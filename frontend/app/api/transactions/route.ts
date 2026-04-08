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
  const allowedOrigin =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function toTradeIntent(value: unknown): TradeIntent | null {
  const payload = asRecord(value)

  if (
    typeof payload.item !== 'string' ||
    typeof payload.price !== 'number' ||
    typeof payload.currency !== 'string'
  ) {
    return null
  }

  return {
    item: payload.item,
    price: payload.price,
    currency: payload.currency,
  }
}

function toDirectWriteTransaction(value: unknown): DirectWriteTransaction | null {
  const payload = asRecord(value)

  if (typeof payload.to !== 'string' || typeof payload.value !== 'string') {
    return null
  }

  if (payload.data !== undefined && typeof payload.data !== 'string') {
    return null
  }

  return {
    to: payload.to,
    value: payload.value,
    data: typeof payload.data === 'string' ? payload.data : undefined,
  }
}

function encodeTradeData(tradeIntent: TradeIntent): string {
  const payload = JSON.stringify({
    action: 'accept_trade',
    item: tradeIntent.item,
    price: tradeIntent.price,
    currency: tradeIntent.currency,
    timestamp: new Date().toISOString(),
  })

  return `0x${Buffer.from(payload, 'utf-8').toString('hex')}`
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin')

  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  })
}

/**
 * POST /api/transactions
 * Universal write-transaction pipeline: sponsor first, then fallback to user gas.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  try {
    const authHeader = request.headers.get('Authorization')
    let authorizedProjectId: string | null = null

    if (authHeader) {
      if (!authHeader.startsWith('Bearer ')) {
        return NextResponse.json(
          { error: 'Missing or malformed Authorization header. Use: Bearer gc_live_...' },
          { status: 401, headers: corsHeaders }
        )
      }

      const apiKey = authHeader.replace('Bearer ', '').trim()
      const project = await validateApiKey(apiKey)

      if (!project) {
        return NextResponse.json({ error: 'Invalid API key' }, { status: 401, headers: corsHeaders })
      }

      authorizedProjectId = project.id
    }

    const body = await request.json()
    const characterId = typeof body.characterId === 'string' ? body.characterId : ''
    const tradeIntent = toTradeIntent(body.tradeIntent)
    const directTx = toDirectWriteTransaction(body.transaction)

    if (!characterId || (!tradeIntent && !directTx)) {
      return NextResponse.json(
        {
          error:
            'characterId is required and provide one of: tradeIntent or transaction { to, value, data? }',
        },
        { status: 400, headers: corsHeaders }
      )
    }

    const character = await prisma.character.findUnique({ where: { id: characterId } })

    if (!character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404, headers: corsHeaders })
    }

    if (authorizedProjectId && character.projectId !== authorizedProjectId) {
      return NextResponse.json(
        { error: 'Character not accessible with this API key' },
        { status: 403, headers: corsHeaders }
      )
    }

    const txInput = directTx ?? {
      to: character.walletAddress,
      value: String(Math.max(0, Math.floor(tradeIntent!.price))),
      data: encodeTradeData(tradeIntent!),
    }

    const execution = await executeWriteTransaction(txInput)

    return NextResponse.json(
      {
        success: true,
        mode: execution.mode,
        sponsored: execution.sponsored,
        txHash: execution.txHash,
        status: execution.status,
        sponsorError: execution.sponsorError,
        characterId,
        tradeIntent: tradeIntent ?? undefined,
        transaction: directTx ?? undefined,
        message:
          execution.mode === 'sponsored'
            ? tradeIntent
              ? 'Trade accepted with gas sponsored by Kite.'
              : 'Transaction sent with gas sponsored by Kite.'
            : 'Sponsorship unavailable. Returned fallback transaction for user-paid gas flow.',
      },
      { status: 200, headers: corsHeaders }
    )
  } catch (error) {
    console.error('[API] Transaction execution error:', error)

    return NextResponse.json(
      { error: 'Failed to execute transaction' },
      { status: 500, headers: corsHeaders }
    )
  }
}
