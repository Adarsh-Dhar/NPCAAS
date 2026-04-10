/**
 * app/api/chat/stream/route.ts
 *
 * Streaming NPC chat endpoint.
 *
 * POST /api/chat/stream
 * Body:   { characterId: string, message: string }
 * Auth:   Bearer <gc_live_...>  (optional — open for unauthenticated playground)
 * Return: text/event-stream  (Server-Sent Events)
 *
 * Event shapes:
 *   data: {"type":"text_delta","delta":"<token>"}\n\n
 *   data: {"type":"action","action":"<physical action>"}\n\n
 *   data: {"type":"trade_intent","tradeIntent":{...}}\n\n
 *   data: {"type":"done","final":{text,action,tradeIntent?}}\n\n
 *   data: {"type":"error","error":"<message>"}\n\n
 *
 * Because we need Prisma (Node.js runtime), this route cannot run on Edge.
 * Streaming still works via ReadableStream piped through Next.js response.
 */

import { NextRequest, NextResponse } from 'next/server'
import { kiteAgentClient, encodeSSEFrame } from '@/lib/kite-sdk'
import { validateApiKey } from '@/lib/api-key-store'
import { prisma } from '@/lib/prisma'

// Re-use CORS helpers from the main chat route
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:8080',
  'https://your-game-studio.com',
]

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin':  allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

/** Emit a single SSE done+error frame and close the stream. */
function errorStream(message: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(encodeSSEFrame({ type: 'error', error: message }))
      )
      controller.close()
    },
  })
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin')
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(origin) })
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  // ── Auth (optional) ─────────────────────────────────────────────────────
  const authHeader = request.headers.get('Authorization')
  let project: { id: string } | null = null

  if (authHeader) {
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Malformed Authorization header. Use: Bearer gc_live_...' },
        { status: 401, headers: corsHeaders }
      )
    }
    const apiKey = authHeader.replace('Bearer ', '').trim()
    const validated = await validateApiKey(apiKey)
    if (!validated) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401, headers: corsHeaders }
      )
    }
    project = validated
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { characterId?: string; message?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400, headers: corsHeaders }
    )
  }

  const { characterId, message } = body

  if (!message || typeof message !== 'string' || !message.trim()) {
    return NextResponse.json(
      { error: 'message (string) is required' },
      { status: 400, headers: corsHeaders }
    )
  }

  // ── SSE headers ──────────────────────────────────────────────────────────
  const sseHeaders: Record<string, string> = {
    ...corsHeaders,
    'Content-Type':      'text/event-stream',
    'Cache-Control':     'no-cache, no-transform',
    'Connection':        'keep-alive',
    'X-Accel-Buffering': 'no', // disable Nginx buffering for SSE
  }

  const encoder = new TextEncoder()

  // ── Fallback: no characterId → base chat ─────────────────────────────────
  if (!characterId) {
    kiteAgentClient.registerTools([])
    const rawStream = kiteAgentClient.chatStream(message, {
      characterName: 'NPC Assistant',
      canTrade: false,
      systemPrompt:
        'You are a helpful NPC assistant. Chat naturally and ask for Section 2 details ' +
        'when the user wants deeper specialization.',
    })

    const encodedStream = rawStream.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          controller.enqueue(encoder.encode(chunk))
        },
      })
    )

    return new NextResponse(encodedStream, { status: 200, headers: sseHeaders })
  }

  // ── Load character from DB ────────────────────────────────────────────────
  const character = await (prisma.character as any)
    .findUnique({
      where: { id: characterId },
      include: { projects: { select: { id: true } } },
    })
    .catch(() => null)

  if (!character) {
    return new NextResponse(
      errorStream(`Character not found: ${characterId}`),
      { status: 404, headers: sseHeaders }
    )
  }

  if (
    project &&
    !character.projects.some((p: { id: string }) => p.id === project!.id)
  ) {
    return new NextResponse(
      errorStream('Character not accessible with this API key'),
      { status: 403, headers: sseHeaders }
    )
  }

  // ── Build agent context ───────────────────────────────────────────────────
  const config    = asRecord(character.config)
  const adaptation = asRecord(character.adaptation)

  const ctx = {
    characterName:       character.name,
    systemPrompt:        typeof config.systemPrompt === 'string' ? config.systemPrompt : undefined,
    openness:            typeof config.openness    === 'number'  ? config.openness    : undefined,
    canTrade:            config.canTrade !== false,
    specializationActive: Boolean(adaptation.specializationActive),
    adaptationSummary:   typeof adaptation.summary     === 'string' ? adaptation.summary     : undefined,
    preferences:         Array.isArray(adaptation.preferences) ? adaptation.preferences : [],
    turnCount:           typeof adaptation.turnCount  === 'number'  ? adaptation.turnCount  : 0,
  }

  kiteAgentClient.registerTools(['get_payer_addr', 'approve_payment', 'check_inventory', 'execute_trade'])

  const rawStream = kiteAgentClient.chatStream(message, ctx)

  const encodedStream = rawStream.pipeThrough(
    new TransformStream<string, Uint8Array>({
      transform(chunk, controller) {
        controller.enqueue(encoder.encode(chunk))
      },
    })
  )

  return new NextResponse(encodedStream, { status: 200, headers: sseHeaders })
}