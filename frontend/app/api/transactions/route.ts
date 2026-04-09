/**
 * app/api/transactions/route.ts  (full replacement)
 *
 * KEY CHANGE from the original:
 *   executeWriteTransaction() now requires ownerId so the AA provider can
 *   derive the NPC's signing key. We read it from character.smartAccountId,
 *   which is where we stored it during character creation.
 */
import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/api-key-store'
import { prisma } from '@/lib/prisma'
import { executeWriteTransaction } from '@/lib/tx-orchestrator'

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:8080',
  'https://your-game-studio.com',
]

interface TradeIntent {
  item: string
  price: number
  currency: string
}

interface DirectWriteTransaction {
  to: string
  value: string
  data?: string
}

function getCorsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

function toTradeIntent(v: unknown): TradeIntent | null {
  const p = asRecord(v)
  if (typeof p.item !== 'string' || typeof p.price !== 'number' || typeof p.currency !== 'string') return null
  return { item: p.item, price: p.price, currency: p.currency }
}

function toDirectTx(v: unknown): DirectWriteTransaction | null {
  const p = asRecord(v)
  if (typeof p.to !== 'string' || typeof p.value !== 'string') return null
  if (p.data !== undefined && typeof p.data !== 'string') return null
  return { to: p.to, value: p.value, data: typeof p.data === 'string' ? p.data : undefined }
}

function encodeTradeData(t: TradeIntent): string {
  const payload = JSON.stringify({
    action: 'accept_trade',
    item: t.item,
    price: t.price,
    currency: t.currency,
    timestamp: new Date().toISOString(),
  })
  return `0x${Buffer.from(payload, 'utf-8').toString('hex')}`
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request.headers.get('origin')),
  })
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  const cors = getCorsHeaders(origin)

  try {
    // -- Auth (optional) --------------------------------------------------
    const authHeader = request.headers.get('Authorization')
    let authorizedProjectId: string | null = null

    if (authHeader) {
      if (!authHeader.startsWith('Bearer ')) {
        return NextResponse.json(
          { error: 'Malformed Authorization header. Use: Bearer gc_live_...' },
          { status: 401, headers: cors }
        )
      }
      const project = await validateApiKey(authHeader.replace('Bearer ', '').trim())
      if (!project) {
        return NextResponse.json({ error: 'Invalid API key' }, { status: 401, headers: cors })
      }
      authorizedProjectId = project.id
    }

    // -- Parse body --------------------------------------------------------
    const body = await request.json()
    const characterId = typeof body.characterId === 'string' ? body.characterId : ''
    const tradeIntent = toTradeIntent(body.tradeIntent)
    const directTx = toDirectTx(body.transaction)

    if (!characterId || (!tradeIntent && !directTx)) {
      return NextResponse.json(
        { error: 'characterId is required; provide tradeIntent or transaction' },
        { status: 400, headers: cors }
      )
    }

    // -- Load character ----------------------------------------------------
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { projects: { select: { id: true } } },
    })
    if (!character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404, headers: cors })
    }
    if (
      authorizedProjectId &&
      !character.projects.some((project) => project.id === authorizedProjectId)
    ) {
      return NextResponse.json(
        { error: 'Character not accessible with this API key' },
        { status: 403, headers: cors }
      )
    }

    // -- Resolve ownerId ---------------------------------------------------
    // smartAccountId stores the ownerId string (set during character creation)
    const ownerId = character.smartAccountId ?? `character:${character.id}`

    // -- Build tx input ----------------------------------------------------
    const txInput = directTx ?? {
      to: character.walletAddress,
      value: String(Math.max(0, Math.floor(tradeIntent!.price))),
      data: encodeTradeData(tradeIntent!),
    }

    // -- Execute via real Kite AA ------------------------------------------
    const execution = await executeWriteTransaction({
      ...txInput,
      ownerId,
    })

    return NextResponse.json(
      {
        success: true,
        mode: execution.mode,
        sponsored: execution.sponsored,
        txHash: execution.txHash,
        userOpHash: execution.userOpHash,
        status: execution.status,
        sponsorError: execution.sponsorError,
        characterId,
        tradeIntent: tradeIntent ?? undefined,
        transaction: directTx ?? undefined,
        message:
          execution.mode === 'sponsored'
            ? tradeIntent
              ? 'Trade accepted — gas sponsored by Kite.'
              : 'Transaction sent — gas sponsored by Kite.'
            : 'Sponsorship unavailable. Fallback requires user-paid gas.',
      },
      { status: 200, headers: cors }
    )
  } catch (error) {
    console.error('[API] Transaction execution error:', error)
    return NextResponse.json(
      { error: 'Failed to execute transaction' },
      { status: 500, headers: getCorsHeaders(origin) }
    )
  }
}