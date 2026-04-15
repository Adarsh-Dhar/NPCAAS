/**
 * app/api/chat/stream/route.ts
 *
 * Streaming NPC chat endpoint — now accepts `npcName` (semantic) or
 * legacy `characterId`. The API key identifies the project, so
 * character lookup is: name + projectId → character record.
 */

import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { kiteAgentClient, encodeSSEFrame } from '@/lib/kite-sdk'
import { validateApiKey } from '@/lib/api-key-store'
import { prisma } from '@/lib/prisma'
import { EconomicEngine } from '@/lib/economic-engine'

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:8080',
  'https://your-game-studio.com',
]

const KITE_RPC = process.env.KITE_AA_RPC_URL ?? 'https://rpc-testnet.gokite.ai'

interface CharacterConfig {
  systemPrompt?: string
  openness?: number
  canTrade?: boolean
  baseCapital?: number
  pricingAlgorithm?: string
  marginPercentage?: number
}

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function toCharacterConfig(value: unknown): CharacterConfig {
  const config = asRecord(value)
  return {
    systemPrompt: typeof config.systemPrompt === 'string' ? config.systemPrompt : undefined,
    openness: asNumber(config.openness),
    canTrade: typeof config.canTrade === 'boolean' ? config.canTrade : undefined,
    baseCapital: asNumber(config.baseCapital ?? config.capital),
    pricingAlgorithm:
      typeof config.pricingAlgorithm === 'string' ? config.pricingAlgorithm : undefined,
    marginPercentage: asNumber(config.marginPercentage),
  }
}

async function fetchCurrentMarketRate(): Promise<number | undefined> {
  const endpoint = process.env.KITE_MARKET_RATE_API_URL
  if (!endpoint) return undefined

  try {
    const response = await fetch(endpoint, { method: 'GET', cache: 'no-store' })
    if (!response.ok) return undefined
    const payload = (await response.json()) as Record<string, unknown>
    return asNumber(payload.currentMarketRate ?? payload.rate ?? payload.price)
  } catch {
    return undefined
  }
}

function errorStream(message: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(encodeSSEFrame({ type: 'error', error: message })))
      controller.close()
    },
  })
}

/**
 * Resolve a character by npcName within a project, or by legacy characterId.
 */
async function resolveCharacter(
  npcName: string | undefined,
  characterId: string | undefined,
  projectId: string | null
): Promise<any | null> {
  if (npcName && projectId) {
    const normalisedName = npcName.trim().toUpperCase().replace(/\s+/g, '_')
    return (prisma.character as any).findFirst({
      where: {
        name: normalisedName,
        projects: { some: { id: projectId } },
      },
      include: { projects: { select: { id: true } } },
    })
  }
  if (characterId) {
    return (prisma.character as any).findUnique({
      where: { id: characterId },
      include: { projects: { select: { id: true } } },
    })
  }
  return null
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin')
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(origin) })
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  // Auth
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
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401, headers: corsHeaders })
    }
    project = validated
  }

  // Parse body
  let body: { npcName?: string; characterId?: string; message?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: corsHeaders })
  }

  const { npcName, characterId, message } = body

  if (!message || typeof message !== 'string' || !message.trim()) {
    return NextResponse.json(
      { error: 'message (string) is required' },
      { status: 400, headers: corsHeaders }
    )
  }

  const sseHeaders: Record<string, string> = {
    ...corsHeaders,
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  }

  const encoder = new TextEncoder()

  // No NPC target — base chat stream
  if (!npcName && !characterId) {
    kiteAgentClient.registerTools([])
    const rawStream = kiteAgentClient.chatStream(message, {
      characterName: 'NPC Assistant',
      canTrade: false,
      systemPrompt:
        'You are a helpful NPC assistant. Chat naturally and ask for Section 2 details when the user wants deeper specialization.',
    })
    const encodedStream = rawStream.pipeThrough(
      new TransformStream({ transform(chunk, ctrl) { ctrl.enqueue(encoder.encode(chunk)) } })
    )
    return new NextResponse(encodedStream, { status: 200, headers: sseHeaders })
  }

  // Resolve character
  const character = await resolveCharacter(npcName, characterId, project?.id ?? null).catch(() => null)

  if (!character) {
    const notFoundMsg = npcName
      ? `Character '${npcName}' not found in this project.`
      : `Character not found: ${characterId}`
    return new NextResponse(errorStream(notFoundMsg), { status: 404, headers: sseHeaders })
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

  // Build agent context
  const config = toCharacterConfig(character.config)
  const adaptation = asRecord(character.adaptation)

  let liveWalletBalance: string | undefined
  try {
    const provider = new ethers.JsonRpcProvider(KITE_RPC)
    const rawBalance = await provider.getBalance(character.walletAddress)
    liveWalletBalance = ethers.formatEther(rawBalance)
  } catch (error) {
    console.warn('[chat/stream] Failed to fetch live wallet balance:', error)
  }

  const currentMarketRate = await fetchCurrentMarketRate()
  const economicContext = EconomicEngine.buildEconomicContext({
    config,
    currentMarketRate,
    liveWalletBalance,
  })

  const basePrompt = config.systemPrompt?.trim()
    ? config.systemPrompt.trim()
    : 'You are an autonomous NPC that negotiates fairly and builds reputation.'

  const ctx = {
    characterName: character.name,
    systemPrompt: `${basePrompt}\n\n${economicContext}`,
    openness: config.openness,
    canTrade: config.canTrade !== false,
    specializationActive: Boolean(adaptation.specializationActive),
    adaptationSummary: typeof adaptation.summary === 'string' ? adaptation.summary : undefined,
    preferences: Array.isArray(adaptation.preferences) ? adaptation.preferences : [],
    turnCount: typeof adaptation.turnCount === 'number' ? adaptation.turnCount : 0,
    baseCapital: config.baseCapital,
    pricingAlgorithm: config.pricingAlgorithm,
    marginPercentage: config.marginPercentage,
    currentMarketRate,
    liveWalletBalance,
  }

  kiteAgentClient.registerTools(['get_payer_addr', 'approve_payment', 'check_inventory', 'execute_trade'])

  const rawStream = kiteAgentClient.chatStream(message, ctx)

  const encodedStream = rawStream.pipeThrough(
    new TransformStream<string, Uint8Array>({
      transform(chunk, controller) { controller.enqueue(encoder.encode(chunk)) },
    })
  )

  return new NextResponse(encodedStream, { status: 200, headers: sseHeaders })
}