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
import { parseEther } from 'ethers' // <--- ADD THIS IMPORT
import { EconomicEngine } from '@/lib/economic-engine'

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

interface CharacterConfig {
  baseCapital?: number
  pricingAlgorithm?: string
  marginPercentage?: number
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

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function toCharacterConfig(value: unknown): CharacterConfig {
  const payload = asRecord(value)
  return {
    baseCapital: asNumber(payload.baseCapital ?? payload.capital),
    pricingAlgorithm:
      typeof payload.pricingAlgorithm === 'string' ? payload.pricingAlgorithm : undefined,
    marginPercentage: asNumber(payload.marginPercentage),
  }
}

async function fetchCurrentMarketRate(symbol?: string): Promise<number | undefined> {
  const endpoint = process.env.KITE_MARKET_RATE_API_URL
  if (!endpoint) return undefined

  try {
    // If symbol provided, append it to the Binance API endpoint
    let fetchUrl = endpoint
    if (symbol && symbol.toUpperCase() !== 'KITE_USD') {
      // Construct Binance ticker symbol (e.g., "SOL" -> "SOLUSDT")
      const tickerSymbol = `${symbol.toUpperCase()}USDT`
      fetchUrl = `${endpoint}?symbol=${tickerSymbol}`
    }
    
    const response = await fetch(fetchUrl, { method: 'GET', cache: 'no-store' })
    if (!response.ok) return undefined
    const payload = (await response.json()) as Record<string, unknown>
    return asNumber(payload.currentMarketRate ?? payload.rate ?? payload.price)
  } catch {
    return undefined
  }
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

    // -- Route the transaction based on intent -----------------------------
    
    // CASE 1: Player Trade (User must send funds to the NPC)
    if (tradeIntent) {
      const config = toCharacterConfig(character.config)
      const currentMarketRate = await fetchCurrentMarketRate()
      const validation = EconomicEngine.validateTradeDetailed({
        tradeIntent,
        config,
        currentMarketRate,
      })

      if (!validation.isValid) {
        return NextResponse.json(
          {
            error:
              validation.reason ??
              'Trade intent violates economic constraints and cannot be executed.',
            minAllowedPrice: validation.minPrice,
          },
          { status: 400, headers: cors }
        )
      }

      const txRequest = {
        to: character.walletAddress, // Receiver is the NPC
        // Converts decimal KITE amount to Wei string
        value: parseEther(tradeIntent.price.toString()).toString(),
        data: "0x",
      }

      return NextResponse.json(
        {
          success: true,
          mode: 'user-paid', // Tells the SDK the user needs to sign
          sponsored: false,
          txRequest,         // The raw transaction data for MetaMask
          status: 'pending',
          characterId,
          tradeIntent,
          message: 'Player payment required. Prompt user wallet to sign transaction.',
        },
        { status: 200, headers: cors }
      )
    }

    // CASE 2: NPC Action (Direct TX, NPC signs, Gas Sponsored by Dev)
    if (directTx) {
      const execution = await executeWriteTransaction({
        ...directTx,
        ownerId, // Sender is the NPC
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
          transaction: directTx,
          message: execution.mode === 'sponsored'
              ? 'Transaction sent — gas sponsored by Kite.'
              : 'Sponsorship unavailable. Fallback requires user-paid gas.',
        },
        { status: 200, headers: cors }
      )
    }
  } catch (error) {
    console.error('[API] Transaction execution error:', error)
    return NextResponse.json(
      { error: 'Failed to execute transaction' },
      { status: 500, headers: getCorsHeaders(origin) }
    )
  }
}