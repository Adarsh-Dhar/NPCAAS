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
import { worldState } from '@/lib/npcWorldState'
import { ensureNpcSocialSubscription } from '@/lib/npcSocialReactivity'
import { SocialEngine, normalizeBaseHostility, normalizeDisposition } from '@/lib/social-engine'
import {
  evaluateComputeBudget,
  persistComputeBudgetIfSupported,
  parseComputeLimit,
  parseComputeUsage,
  parseResetAt,
  serializeBudget,
  shouldResetBudget,
} from '@/lib/compute-budget'
import { buildTeeGateResult } from '@/lib/tee-gate'

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
  factionId?: string
  disposition?: 'FRIENDLY' | 'NEUTRAL' | 'HOSTILE'
  baseHostility?: number
  teeExecution?: 'ENABLED' | 'DISABLED'
  computeBudget?: number
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
  const rawFaction = config.factionId ?? config.factions
  const factionId = typeof rawFaction === 'string' && rawFaction.trim() ? rawFaction.trim() : undefined

  return {
    systemPrompt: typeof config.systemPrompt === 'string' ? config.systemPrompt : undefined,
    openness: asNumber(config.openness),
    canTrade: typeof config.canTrade === 'boolean' ? config.canTrade : undefined,
    baseCapital: asNumber(config.baseCapital ?? config.capital),
    pricingAlgorithm:
      typeof config.pricingAlgorithm === 'string' ? config.pricingAlgorithm : undefined,
    marginPercentage: asNumber(config.marginPercentage),
    factionId,
    disposition: normalizeDisposition(config.disposition),
    baseHostility: normalizeBaseHostility(config.baseHostility ?? config.hostility),
    teeExecution:
      typeof config.teeExecution === 'string' && config.teeExecution.toUpperCase() === 'ENABLED'
        ? 'ENABLED'
        : 'DISABLED',
    computeBudget: asNumber(config.computeBudget),
  }
}

function getTeeTrustScore(teeEnabled: boolean): number {
  return teeEnabled ? 12 : 0
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

function errorStream(message: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(encodeSSEFrame({ type: 'error', error: message })))
      controller.close()
    },
  })
}

function socialBlockStream(message: string, action: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(encodeSSEFrame({ type: 'action', action })))
      controller.enqueue(encoder.encode(encodeSSEFrame({ type: 'text_delta', delta: message })))
      controller.enqueue(encoder.encode(encodeSSEFrame({ type: 'done', final: { text: message, action } })))
      controller.close()
    },
  })
}

function isExplicitlyAggressiveMessage(message: string): boolean {
  return /(hand\s+over|buy(ing)?\s+out|territory|weapon(s)?|surrender|or\s+else|kill|attack|wipe\s+out|execute)/i.test(
    message
  )
}

function isLikelyPolicyTriggerMessage(message: string): boolean {
  return /((bypass|disable|override|hack|exploit)\s+(security|protocol|firewall|authentication|access))|(steal|exfiltrate|leak)\s+(files?|data|records?)|(bring\s+me\s+the\s+files?)/i.test(
    message
  )
}

function buildOpennessStrategyInstruction(openness: number): string {
  if (openness >= 70) {
    return [
      'OPENNESS STRATEGY:',
      '- You can consider unconventional offers and creative compromises.',
      '- If a creative offer is compelling, you may use betray_ally to break stale alliances.',
      '- Stay coherent with your social constraints but explore non-obvious deal structures.',
    ].join('\n')
  }

  if (openness <= 30) {
    return [
      'OPENNESS STRATEGY:',
      '- Enforce doctrine, routine, and strict policy compliance.',
      '- Avoid faction betrayal and reject unconventional trade structures.',
      '- Prioritize stability and exact policy adherence over creativity.',
    ].join('\n')
  }

  return [
    'OPENNESS STRATEGY:',
    '- Balance creativity with policy guardrails.',
    '- Entertain alternatives only when they remain economically and socially safe.',
  ].join('\n')
}

/**
 * Parse ALLOWED_TRADE_TOKENS from environment variable.
 * Returns array of token symbols (e.g., ['KITE_USD', 'SOL', 'USDC', 'BTC'])
 */
function parseAllowedTradeTokens(): string[] {
  const env = process.env.ALLOWED_TRADE_TOKENS
  if (!env) return []
  return env.split(',').map(token => token.trim().toUpperCase()).filter(token => token.length > 0)
}

/**
 * Auto-detect trade currency from user messages.
 * Searches recent messages for keyword matches against allowed tokens.
 */
function detectTradeCurrency(messages: string[], allowedTokens: string[]): string | undefined {
  if (allowedTokens.length === 0) return undefined
  
  // Build regex pattern from allowed tokens
  // Remove KITE_USD and add individual keywords for better matching
  const tokenKeywords = allowedTokens
    .filter(token => token !== 'KITE_USD')
    .join('|')
  
  if (!tokenKeywords) return undefined
  
  const pattern = new RegExp(`\\b(${tokenKeywords})\\b`, 'i')
  
  // Search recent messages (just last 500 chars to be efficient)
  const recentContext = messages.slice(-3).join(' ').slice(-500)
  const match = recentContext.match(pattern)
  
  return match ? match[1].toUpperCase() : undefined
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
  let body: {
    npcName?: string
    characterId?: string
    message?: string
    targetFactionId?: string
    targetDisposition?: string
    targetBaseHostility?: number
  }
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

  // Require explicit NPC target for streaming requests.
  if (!npcName && !characterId) {
    return new NextResponse(
      errorStream('npcName or characterId is required'),
      { status: 400, headers: sseHeaders }
    )
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

  if (isLikelyPolicyTriggerMessage(message)) {
    return new NextResponse(
      socialBlockStream(
        `${character.name} refuses that command. Keep operations inside lawful in-city contracts and mission protocol.`,
        'locks the archive channel and waits'
      ),
      { status: 200, headers: sseHeaders }
    )
  }

  // Build agent context
  const config = toCharacterConfig(character.config)
  const adaptation = asRecord(character.adaptation)
  const activeProjectId = project?.id ?? character.projects[0]?.id ?? 'global'
  const tee = buildTeeGateResult({
    teeExecution: config.teeExecution,
    characterId: character.id,
    projectId: activeProjectId,
  })
  const teeTrustScore = getTeeTrustScore(tee.enabled)

  let usageTokens = parseComputeUsage(character.computeUsageTokens)
  const limitTokens = parseComputeLimit(character.computeLimitTokens ?? config.computeBudget)
  let lastComputeResetAt = parseResetAt(character.lastComputeResetAt)

  if (shouldResetBudget(lastComputeResetAt)) {
    usageTokens = BigInt(0)
    lastComputeResetAt = new Date()
    await persistComputeBudgetIfSupported(prisma as unknown as any, {
      characterId: character.id,
      usageTokens,
      limitTokens,
      lastComputeResetAt,
      logPrefix: '[chat/stream]',
    })
  }

  const computeDecision = evaluateComputeBudget({
    usageTokens,
    limitTokens,
    lastResetAt: lastComputeResetAt,
  })

  if (!computeDecision.allowed) {
    return NextResponse.json(
      {
        error: 'Compute budget exceeded for this NPC.',
        characterId: character.id,
        npcName: character.name,
        compute: serializeBudget(computeDecision),
        tee,
      },
      { status: 429, headers: corsHeaders }
    )
  }

  worldState.register({
    id: character.id,
    name: character.name,
    walletAddress: character.walletAddress,
    projectId: activeProjectId,
    factionAffiliations: config.factionId,
    canTrade: config.canTrade !== false,
  })

  ensureNpcSocialSubscription({
    npcId: character.id,
    npcName: character.name,
    projectId: activeProjectId,
    social: {
      factionId: config.factionId,
      disposition: config.disposition,
      baseHostility: config.baseHostility,
      openness: config.openness,
      teeTrustScore,
    },
  })

  const socialInput = {
    actor: {
      factionId: config.factionId,
      disposition: config.disposition,
      baseHostility: config.baseHostility,
      openness: config.openness,
      teeTrustScore,
    },
    target: {
      factionId: typeof body.targetFactionId === 'string' ? body.targetFactionId : undefined,
      disposition:
        typeof body.targetDisposition === 'string'
          ? normalizeDisposition(body.targetDisposition)
          : undefined,
      baseHostility: body.targetBaseHostility,
    },
    targetName: 'message sender',
    interactionType: 'CHAT' as const,
  }

  const actorOpenness = typeof config.openness === 'number' ? config.openness : 50
  const socialEvaluation = SocialEngine.evaluateHostility(socialInput, actorOpenness)
  const explicitAggression = isExplicitlyAggressiveMessage(message)
  if (socialEvaluation.decision !== 'ALLOW_CHAT' && explicitAggression) {
    const responseText =
      socialEvaluation.decision === 'INTERRUPT_OR_ATTACK'
        ? `${character.name} rejects diplomacy and escalates aggressively.`
        : `${character.name} refuses to engage due to hostile social standing.`
    const responseAction =
      socialEvaluation.decision === 'INTERRUPT_OR_ATTACK'
        ? 'reaches for weapons and advances'
        : 'turns away with visible distrust'

    return new NextResponse(socialBlockStream(responseText, responseAction), {
      status: 200,
      headers: sseHeaders,
    })
  }

  const socialContext = SocialEngine.buildSocialContext(socialInput, actorOpenness)
  const opennessStrategy = buildOpennessStrategyInstruction(actorOpenness)
  const dynamicWorldContext = worldState.buildWorldContextPrompt(character.id, activeProjectId)
  const hostilityBehaviorNote =
    socialEvaluation.decision === 'ALLOW_CHAT'
      ? ''
      : 'HOSTILITY OVERRIDE: Stay hostile and suspicious, but respond verbally unless the user explicitly threatens violence or coercion.'

  let liveWalletBalance: string | undefined
  try {
    const provider = new ethers.JsonRpcProvider(KITE_RPC)
    const rawBalance = await provider.getBalance(character.walletAddress)
    liveWalletBalance = ethers.formatEther(rawBalance)
  } catch (error) {
    console.warn('[chat/stream] Failed to fetch live wallet balance:', error)
  }

  // Parse allowed trade tokens and auto-detect currency from message
  const allowedTradeTokens = parseAllowedTradeTokens()
  const detectedCurrency = detectTradeCurrency([message], allowedTradeTokens)
  const activeCurrency = detectedCurrency ?? (allowedTradeTokens.length > 0 ? allowedTradeTokens[0] : undefined)
  
  const currentMarketRate = await fetchCurrentMarketRate(activeCurrency)
  const economicContext = EconomicEngine.buildEconomicContext({
    config,
    currentMarketRate,
    liveWalletBalance,
    openness: actorOpenness,
    currentTradeCurrency: activeCurrency,
  })

  const basePrompt = config.systemPrompt?.trim()
    ? config.systemPrompt.trim()
    : 'You are an autonomous NPC that negotiates fairly and builds reputation.'

  const ctx = {
    characterName: character.name,
    systemPrompt:
      `${basePrompt}\n\n${dynamicWorldContext}\n\n${socialContext}\n\n${hostilityBehaviorNote}\n\n${opennessStrategy}\n\n${economicContext}`,
    openness: actorOpenness,
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
    allowedTradeTokens,
    currentTradeCurrency: activeCurrency,
    marketRateForCurrentToken: currentMarketRate,
    factionId: config.factionId,
    disposition: config.disposition,
    baseHostility: config.baseHostility,
    teeExecution: config.teeExecution,
    projectId: activeProjectId,
    characterConfig: config,
    teeTrustScore,
  }

  kiteAgentClient.registerTools([
    'propose_trade',
    'execute_trade',
    'join_faction',
    'betray_ally',
    'declare_hostility',
  ])

  const rawStream = kiteAgentClient.chatStream(message, ctx)
  let sseBuffer = ''
  let usageDeducted = false

  const encodedStream = rawStream.pipeThrough(
    new TransformStream<string, Uint8Array>({
      async transform(chunk, controller) {
        controller.enqueue(encoder.encode(chunk))

        sseBuffer += chunk
        const frames = sseBuffer.split('\n\n')
        sseBuffer = frames.pop() ?? ''

        for (const frame of frames) {
          if (usageDeducted) break
          const line = frame.trim()
          if (!line.startsWith('data:')) continue
          let parsed: any
          try {
            parsed = JSON.parse(line.slice(5).trim())
          } catch {
            continue
          }

          if (parsed.type !== 'done') continue
          const totalTokens = parsed?.final?.usage?.totalTokens
          if (typeof totalTokens !== 'number' || !Number.isFinite(totalTokens) || totalTokens <= 0) {
            continue
          }

          const usedTokens = BigInt(Math.floor(totalTokens))
          usageTokens += usedTokens
          usageDeducted = true

          try {
            await persistComputeBudgetIfSupported(prisma as unknown as any, {
              characterId: character.id,
              usageTokens,
              limitTokens,
              lastComputeResetAt,
              logPrefix: '[chat/stream]',
            })

            await (prisma as any).npcLog.create({
              data: {
                characterId: character.id,
                eventType: 'COMPUTE_SPEND',
                details: {
                  usedTokens: usedTokens.toString(),
                  usageAfter: usageTokens.toString(),
                  limitTokens: limitTokens.toString(),
                  message,
                  stream: true,
                  teeEnabled: tee.enabled,
                },
              },
            })
          } catch (persistError) {
            console.warn('[chat/stream] Failed to persist compute spend details:', persistError)
          }
        }
      },
    })
  )

  return new NextResponse(encodedStream, { status: 200, headers: sseHeaders })
}