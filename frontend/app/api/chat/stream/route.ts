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
import { ensureNpcSocialSubscription } from '@/lib/npcSocialReactivity'
import { SocialEngine, normalizeBaseHostility, normalizeDisposition } from '@/lib/social-engine'
import { buildTeeGateResult } from '@/lib/tee-gate'
import { appendNpcEventTag, shouldForceBriefcaseLocatedEvent } from '@/lib/npc-event-tags'
import {
  formatInventoryForPrompt,
  parseOptionalInventory,
  type InventoryItem,
} from '@/lib/npc-inventory'
import { type NpcPublicProfile, worldState } from '@/lib/npcWorldState'


const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:8080',
  'https://your-game-studio.com',
]

const KITE_RPC = process.env.KITE_AA_RPC_URL ?? 'https://rpc-testnet.gokite.ai'

interface GameEventDefinition {
  name: string
  condition: string
}

interface CharacterConfig {
  systemPrompt?: string
  openness?: number
  canTrade?: boolean
  interGameTransactionsEnabled?: boolean
  baseCapital?: number
  pricingAlgorithm?: string
  marginPercentage?: number
  factionId?: string
  role?: string
  disposition?: 'FRIENDLY' | 'NEUTRAL' | 'HOSTILE'
  baseHostility?: number
  teeExecution?: 'ENABLED' | 'DISABLED'
  allowDbFetch?: boolean
  dbEndpoint?: string
  inventory?: InventoryItem[]
}

const STREAM_CHARACTER_SELECT = {
  id: true,
  name: true,
  walletAddress: true,
  smartAccountStatus: true,
  isDeployedOnChain: true,
  teeAttestationProof: true,
  gameEvents: true,
  config: true,
  adaptation: true,
  projects: { select: { id: true } },
} as const

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

function parseGameEvents(value: unknown): GameEventDefinition[] {
  if (!Array.isArray(value)) return []

  const events: GameEventDefinition[] = []
  for (const entry of value) {
    const payload = asRecord(entry)
    const name = typeof payload.name === 'string' ? payload.name.trim() : ''
    const condition = typeof payload.condition === 'string' ? payload.condition.trim() : ''
    if (!name || !condition) continue
    if (!/^[A-Z0-9_]+$/.test(name)) continue
    events.push({ name, condition })
  }

  return events
}

function getCombatEventTag(events: GameEventDefinition[]): string {
  const combatEvent = events.find(
    (event) => event.name === 'COMBAT_INITIATED' || event.name === 'CHAT_BLOCKED_SOCIAL'
  )
  return combatEvent ? ` [[EVENT:${combatEvent.name}]]` : ''
}

function getBriefcaseEventTag(input: {
  characterName: string
  userMessage: string
  responseText: string
  gameEvents: GameEventDefinition[]
}): string {
  return shouldForceBriefcaseLocatedEvent(input) ? ' [[EVENT:BRIEFCASE_LOCATED]]' : ''
}

function toCharacterConfig(value: unknown): CharacterConfig {
  const config = asRecord(value)
  const rawFaction = config.factionId ?? config.factions
  const factionId = typeof rawFaction === 'string' && rawFaction.trim() ? rawFaction.trim() : undefined

  return {
    systemPrompt: typeof config.systemPrompt === 'string' ? config.systemPrompt : undefined,
    openness: asNumber(config.openness),
    canTrade: typeof config.canTrade === 'boolean' ? config.canTrade : undefined,
    interGameTransactionsEnabled:
      typeof config.interGameTransactionsEnabled === 'boolean'
        ? config.interGameTransactionsEnabled
        : undefined,
    baseCapital: asNumber(config.baseCapital ?? config.capital),
    pricingAlgorithm:
      typeof config.pricingAlgorithm === 'string' ? config.pricingAlgorithm : undefined,
    marginPercentage: asNumber(config.marginPercentage),
    factionId,
    role: typeof config.role === 'string' ? config.role : undefined,
    disposition: normalizeDisposition(config.disposition),
    baseHostility: normalizeBaseHostility(config.baseHostility ?? config.hostility),
    teeExecution:
      typeof config.teeExecution === 'string' && config.teeExecution.toUpperCase() === 'ENABLED'
        ? 'ENABLED'
        : 'DISABLED',
    allowDbFetch: typeof config.allowDbFetch === 'boolean' ? config.allowDbFetch : false,
    dbEndpoint: typeof config.dbEndpoint === 'string' ? config.dbEndpoint : undefined,
    inventory: parseOptionalInventory(config.inventory),
  }
}

function toNpcPublicProfile(character: {
  id: string
  name: string
  walletAddress: string
  smartAccountStatus: string
  isDeployedOnChain: boolean
  teeAttestationProof: string | null
  config: unknown
  adaptation: unknown
  projects: Array<{ id: string }>
}, config: CharacterConfig, adaptation: Record<string, unknown>): NpcPublicProfile {
  return {
    id: character.id,
    name: character.name,
    walletAddress: character.walletAddress,
    projectIds: character.projects.map((project) => project.id),
    projectId: character.projects[0]?.id,
    factionAffiliations: config.factionId,
    role: config.role,
    canTrade: config.canTrade !== false,
    interGameTransactionsEnabled: config.interGameTransactionsEnabled !== false,
    smartAccountStatus: character.smartAccountStatus,
    isDeployedOnChain: character.isDeployedOnChain,
    teeAttestationProof: character.teeAttestationProof,
    config: asRecord(character.config),
    adaptation,
    adaptationSummary: typeof adaptation.summary === 'string' ? adaptation.summary : undefined,
  }
}

function getTeeTrustScore(teeEnabled: boolean): number {
  return teeEnabled ? 12 : 0
}

async function fetchCurrentMarketRate(symbol?: string): Promise<number | undefined> {
  const endpoint = process.env.KITE_MARKET_RATE_API_URL
  if (!endpoint) return undefined

  try {
    let fetchUrl = endpoint
    if (symbol && symbol.toUpperCase() !== 'PYUSD') {
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

function parseAllowedTradeTokens(): string[] {
  const env = process.env.ALLOWED_TRADE_TOKENS
  if (!env) return []
  return env.split(',').map(token => token.trim().toUpperCase()).filter(token => token.length > 0)
}

function detectTradeCurrency(messages: string[], allowedTokens: string[]): string | undefined {
  if (allowedTokens.length === 0) return undefined
  
  const tokenKeywords = allowedTokens
    .filter(token => token !== 'PYUSD')
    .join('|')
  
  if (!tokenKeywords) return undefined
  
  const pattern = new RegExp(`\\b(${tokenKeywords})\\b`, 'i')
  const recentContext = messages.slice(-3).join(' ').slice(-500)
  const match = recentContext.match(pattern)
  
  return match ? match[1].toUpperCase() : undefined
}

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
      select: STREAM_CHARACTER_SELECT,
    })
  }
  if (characterId) {
    return (prisma.character as any).findUnique({
      where: { id: characterId },
      select: STREAM_CHARACTER_SELECT,
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

  if (!npcName && !characterId) {
    return new NextResponse(
      errorStream('npcName or characterId is required'),
      { status: 400, headers: sseHeaders }
    )
  }

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

  const config = toCharacterConfig(character.config)
  const gameEvents = parseGameEvents((character as { gameEvents?: unknown }).gameEvents)
  const adaptation = asRecord(character.adaptation)
  const activeProjectId = project?.id ?? character.projects[0]?.id ?? 'global'
  let projectContext: { globalContext?: string } | null = null
  if (activeProjectId !== 'global') {
    try {
      projectContext = await (prisma.project as any).findUnique({
        where: { id: activeProjectId },
        select: { globalContext: true },
      })
    } catch (error) {
      console.warn('[chat/stream] Failed to fetch project globalContext:', error)
    }
  }

  const tee = buildTeeGateResult({
    teeExecution: config.teeExecution,
    characterId: character.id,
    projectId: activeProjectId,
  })
  const teeTrustScore = getTeeTrustScore(tee.enabled)


  worldState.register({
    id: character.id,
    name: character.name,
    walletAddress: character.walletAddress,
    projectId: activeProjectId,
    projectIds: character.projects.map((project: { id: string }) => project.id),
    factionAffiliations: config.factionId,
    canTrade: config.canTrade !== false,
    interGameTransactionsEnabled: config.interGameTransactionsEnabled !== false,
    smartAccountStatus: character.smartAccountStatus,
    isDeployedOnChain: character.isDeployedOnChain,
    teeAttestationProof: character.teeAttestationProof,
    config: asRecord(character.config),
    adaptation,
    adaptationSummary: typeof adaptation.summary === 'string' ? adaptation.summary : undefined,
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
    const combatEventTag = getCombatEventTag(gameEvents)
    const responseText =
      socialEvaluation.decision === 'INTERRUPT_OR_ATTACK'
        ? `${character.name} rejects diplomacy and escalates aggressively.${combatEventTag}`
        : `${character.name} refuses to engage due to hostile social standing.${combatEventTag}`
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
  let projectRoster: NpcPublicProfile[] = []
  if (activeProjectId !== 'global') {
    try {
      const rosterCharacters = await (prisma.character as any).findMany({
        where: {
          projects: { some: { id: activeProjectId } },
          id: { not: character.id },
        },
        select: STREAM_CHARACTER_SELECT,
        orderBy: { createdAt: 'asc' },
      })

      projectRoster = rosterCharacters.map((npc: {
        id: string
        name: string
        walletAddress: string
        smartAccountStatus: string
        isDeployedOnChain: boolean
        teeAttestationProof: string | null
        config: unknown
        adaptation: unknown
        projects: Array<{ id: string }>
      }) => {
        const npcConfig = toCharacterConfig(npc.config)
        const npcAdaptation = asRecord(npc.adaptation)

        return toNpcPublicProfile(npc, npcConfig, npcAdaptation)
      })
    } catch (error) {
      console.warn('[chat/stream] Failed to fetch project roster:', error)
    }
  }

  const dynamicWorldContext = worldState.buildWorldContextPrompt(character.id, activeProjectId, projectRoster)
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
  const globalWorldContext =
    typeof projectContext?.globalContext === 'string' && projectContext.globalContext.trim()
      ? `[GLOBAL WORLD CONTEXT]\n${projectContext.globalContext.trim()}`
      : ''

  // Build DB access instruction when the feature is enabled
  let dbInstruction = ''
  if (config.allowDbFetch && config.dbEndpoint) {
    dbInstruction =
      "DATABASE ACCESS: You have access to an external database via the 'query_database' tool. " +
      'If the user asks a question about lore, stats, or facts you do not know, you MUST use this tool to fetch the answer before replying.'
  }

  let inventoryInstruction = ''
  if (Array.isArray(config.inventory)) {
    const inventorySnapshot = formatInventoryForPrompt(config.inventory)
    inventoryInstruction =
      "INVENTORY ACCESS: You are a merchant with native platform-managed inventory. " +
      "Use the 'check_stock' tool before answering item availability questions. " +
      "If the user confirms a purchase, require buyerWallet and txHash, then MUST call 'execute_sale'. " +
      'Never confirm delivery unless execute_sale succeeds. ' +
      `Current stock:\n${inventorySnapshot}`
  }

  let gameEventInstruction = ''
  if (gameEvents.length > 0) {
    const eventLines = gameEvents
      .map((event) => `- [[EVENT:${event.name}]]: ${event.condition}`)
      .join('\n')

    gameEventInstruction =
      'GAME ENGINE EVENTS: You can trigger physical world events in the client. ' +
      'When any event condition is satisfied, include the exact token [[EVENT:EVENT_NAME]] once in your response. ' +
      'Do not alter token spelling or format.\n' +
      `Available events:\n${eventLines}`
  }

  const systemPrompt =
    `${basePrompt}\n\n${globalWorldContext}\n\n${dynamicWorldContext}\n\n${socialContext}\n\n${hostilityBehaviorNote}\n\n${opennessStrategy}\n\n${economicContext}\n\n${dbInstruction}\n\n${inventoryInstruction}\n\n${gameEventInstruction}`.trim()

  const ctx = {
    characterName: character.name,
    systemPrompt,
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
    dbEndpoint: config.allowDbFetch ? config.dbEndpoint : undefined,
    inventoryEnabled: Array.isArray(config.inventory),
    inventory: config.inventory,
    npcWalletAddress: character.walletAddress,
  }

  // Build allowed tools list — conditionally include DB tool
  const allowedTools = [
    'propose_trade',
    'execute_trade',
    'join_faction',
    'betray_ally',
    'declare_hostility',
  ]

  if (config.allowDbFetch && config.dbEndpoint) {
    allowedTools.push('query_database')
    kiteAgentClient.setDbEndpoint(config.dbEndpoint)
  }

  if (Array.isArray(config.inventory)) {
    allowedTools.push('check_stock', 'execute_sale')
  }

  kiteAgentClient.registerTools(allowedTools)

  const rawStream = kiteAgentClient.chatStream(message, ctx)
  let sseBuffer = ''

  const encodedStream = rawStream.pipeThrough(
    new TransformStream<string, Uint8Array>({
      async transform(chunk, controller) {
        sseBuffer += chunk
        const frames = sseBuffer.split('\n\n')
        sseBuffer = frames.pop() ?? ''

        for (const frame of frames) {
          const line = frame.trim()
          if (!line.startsWith('data:')) continue
          let parsed: any
          try {
            parsed = JSON.parse(line.slice(5).trim())
          } catch {
            controller.enqueue(encoder.encode(`${frame}\n\n`))
            continue
          }

          if (parsed.type === 'done' && parsed.final?.text) {
            const briefcaseEventTag = getBriefcaseEventTag({
              characterName: character.name,
              userMessage: message,
              responseText: String(parsed.final.text),
              gameEvents,
            })

            if (briefcaseEventTag) {
              parsed.final.text = appendNpcEventTag(String(parsed.final.text), {
                characterName: character.name,
                userMessage: message,
                responseText: String(parsed.final.text),
                gameEvents,
              })
              parsed.final.worldEvent = 'BRIEFCASE_LOCATED'
            }
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify(parsed)}\n\n`))

          if (parsed.type !== 'done') continue
        }
      },
      flush(controller) {
        if (sseBuffer.trim().length > 0) {
          controller.enqueue(encoder.encode(sseBuffer))
        }
      },
    })
  )

  return new NextResponse(encodedStream, { status: 200, headers: sseHeaders })
}