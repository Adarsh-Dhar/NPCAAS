import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { kiteAgentClient } from '@/lib/kite-sdk'
import { validateApiKey } from '@/lib/api-key-store'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/lib/generated/prisma/client'
import { eventBus } from '@/lib/npcEventBus'
import { worldState } from '@/lib/npcWorldState'
import { EconomicEngine } from '@/lib/economic-engine'
import { ensureNpcSocialSubscription } from '@/lib/npcSocialReactivity'
import { SocialEngine, normalizeBaseHostility, normalizeDisposition } from '@/lib/social-engine'
import {
  formatInventoryForPrompt,
  parseOptionalInventory,
  type InventoryItem,
} from '@/lib/npc-inventory'
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

function getCorsHeaders(origin: string | null) {
  const allowedOrigin =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

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
  allowDbFetch?: boolean
  dbEndpoint?: string
  inventory?: InventoryItem[]
}

interface Section2Profile {
  systemPrompt: string
  openness: number
}

interface AdaptationMemory {
  specializationActive: boolean
  turnCount: number
  preferences: string[]
  summary: string
  pendingSection2?: Section2Profile
  lastUpdatedAt: string
}

interface StoredCharacter {
  id: string
  name: string
  walletAddress: string
  config: unknown
  adaptation: unknown
  computeUsageTokens?: bigint | number | string
  computeLimitTokens?: bigint | number | string
  lastComputeResetAt?: Date | string
  teeAttestationProof?: string | null
  projects: Array<{ id: string }>
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

async function fetchCurrentMarketRate(symbol?: string): Promise<number | undefined> {
  const endpoint = process.env.KITE_MARKET_RATE_API_URL
  if (!endpoint) return undefined

  try {
    let fetchUrl = endpoint
    if (symbol && symbol.toUpperCase() !== 'KITE_USD') {
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

function toCharacterConfig(value: unknown): CharacterConfig {
  const payload = asRecord(value)
  const rawFaction = payload.factionId ?? payload.factions
  const factionId = typeof rawFaction === 'string' && rawFaction.trim() ? rawFaction.trim() : undefined

  return {
    systemPrompt: typeof payload.systemPrompt === 'string' ? payload.systemPrompt : undefined,
    openness: typeof payload.openness === 'number' ? payload.openness : undefined,
    canTrade: typeof payload.canTrade === 'boolean' ? payload.canTrade : undefined,
    baseCapital: asNumber(payload.baseCapital ?? payload.capital),
    pricingAlgorithm:
      typeof payload.pricingAlgorithm === 'string' ? payload.pricingAlgorithm : undefined,
    marginPercentage: asNumber(payload.marginPercentage),
    factionId,
    disposition: normalizeDisposition(payload.disposition),
    baseHostility: normalizeBaseHostility(payload.baseHostility ?? payload.hostility),
    teeExecution:
      typeof payload.teeExecution === 'string' && payload.teeExecution.toUpperCase() === 'ENABLED'
        ? 'ENABLED'
        : 'DISABLED',
    computeBudget: asNumber(payload.computeBudget),
    allowDbFetch: typeof payload.allowDbFetch === 'boolean' ? payload.allowDbFetch : false,
    dbEndpoint: typeof payload.dbEndpoint === 'string' ? payload.dbEndpoint : undefined,
    inventory: parseOptionalInventory(payload.inventory),
  }
}

function getTeeTrustScore(teeEnabled: boolean): number {
  return teeEnabled ? 12 : 0
}

function toAdaptationMemory(value: unknown): AdaptationMemory {
  const payload = asRecord(value)
  const pendingSection2 = asRecord(payload.pendingSection2)
  const hasPendingSection2 =
    typeof pendingSection2.systemPrompt === 'string' &&
    typeof pendingSection2.openness === 'number'
  return {
    specializationActive: Boolean(payload.specializationActive),
    turnCount: typeof payload.turnCount === 'number' ? payload.turnCount : 0,
    preferences: Array.isArray(payload.preferences)
      ? payload.preferences.filter((item): item is string => typeof item === 'string')
      : [],
    summary:
      typeof payload.summary === 'string' && payload.summary.trim()
        ? payload.summary
        : 'No adaptation history yet.',
    pendingSection2: hasPendingSection2
      ? { systemPrompt: pendingSection2.systemPrompt as string, openness: pendingSection2.openness as number }
      : undefined,
    lastUpdatedAt:
      typeof payload.lastUpdatedAt === 'string' ? payload.lastUpdatedAt : new Date().toISOString(),
  }
}

function parseSection2Definition(message: string): Section2Profile | null {
  const promptMatch = message.match(
    /Core\s+System\s+Prompt\s*\n?\s*([\s\S]*?)\n\s*Openness\s+to\s+Experience/i
  )
  const opennessMatch = message.match(/Openness\s+to\s+Experience\s*\n?\s*(\d{1,3})/i)
  if (!promptMatch || !opennessMatch) return null
  const openness = Math.max(0, Math.min(100, parseInt(opennessMatch[1], 10)))
  const systemPrompt = promptMatch[1].trim()
  if (!systemPrompt) return null
  return { systemPrompt, openness }
}

function isActivationMessage(message: string): boolean {
  return /(activate\s+section\s*2|activate\s+cognitive\s+layer|enable\s+specialization|confirm\s+section\s*2|yes\s+activate)/i.test(message)
}

function extractPreferences(message: string): string[] {
  const patterns = [
    /i\s+want\s+([^.!?]+)/gi,
    /please\s+([^.!?]+)/gi,
    /prefer\s+([^.!?]+)/gi,
    /focus\s+on\s+([^.!?]+)/gi,
  ]
  const preferences: string[] = []
  for (const pattern of patterns) {
    let match: RegExpExecArray | null = pattern.exec(message)
    while (match) {
      const candidate = match[1].trim().replace(/\s+/g, ' ')
      if (candidate.length >= 4 && candidate.length <= 120) preferences.push(candidate)
      match = pattern.exec(message)
    }
  }
  return preferences
}

function parseAllowedTradeTokens(): string[] {
  const env = process.env.ALLOWED_TRADE_TOKENS
  if (!env) return []
  return env.split(',').map(token => token.trim().toUpperCase()).filter(token => token.length > 0)
}

function detectTradeCurrency(messages: string[], allowedTokens: string[]): string | undefined {
  if (allowedTokens.length === 0) return undefined
  
  const tokenKeywords = allowedTokens
    .filter(token => token !== 'KITE_USD')
    .join('|')
  
  if (!tokenKeywords) return undefined
  
  const pattern = new RegExp(`\\b(${tokenKeywords})\\b`, 'i')
  const recentContext = messages.slice(-3).join(' ').slice(-500)
  const match = recentContext.match(pattern)
  
  return match ? match[1].toUpperCase() : undefined
}

function buildSummary(preferences: string[], turnCount: number, profile: Section2Profile): string {
  const topPreferences = preferences.slice(0, 4)
  const preferenceText =
    topPreferences.length > 0
      ? `Key preferences: ${topPreferences.join('; ')}`
      : 'Key preferences: none yet'
  return `${preferenceText}. Section 2 profile active with openness ${profile.openness}. Specialized turns: ${turnCount}.`
}

function mergePreferences(existing: string[], incoming: string[]): string[] {
  const merged: string[] = [...existing]
  for (const pref of incoming) {
    if (!merged.some((item) => item.toLowerCase() === pref.toLowerCase())) {
      merged.unshift(pref)
    }
  }
  return merged.slice(0, 8)
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

async function findCharacterByName(
  npcName: string,
  projectId: string
): Promise<StoredCharacter | null> {
  const rawName = npcName.trim()
  const hyphenToUnderscore = rawName.replace(/[\s-]+/g, '_')
  const normalisedName = rawName.toUpperCase().replace(/[\s-]+/g, '_')
  const character = await (prisma.character as any).findFirst({
    where: {
      projects: { some: { id: projectId } },
      OR: [
        { name: rawName },
        { name: hyphenToUnderscore },
        { name: normalisedName },
        { name: { equals: rawName, mode: 'insensitive' } },
        { name: { equals: hyphenToUnderscore, mode: 'insensitive' } },
        { name: { equals: normalisedName, mode: 'insensitive' } },
      ],
    },
    include: { projects: { select: { id: true } } },
  })
  return character
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
        { error: 'Missing or malformed Authorization header. Use: Bearer gc_live_...' },
        { status: 401, headers: corsHeaders }
      )
    }
    const apiKey = authHeader.replace('Bearer ', '').trim()
    const validatedProject = await validateApiKey(apiKey)
    if (!validatedProject) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401, headers: corsHeaders })
    }
    project = validatedProject
  }

  try {
    const body = await request.json()

    const {
      npcName,
      characterId: legacyCharacterId,
      message,
      targetFactionId,
      targetDisposition,
      targetBaseHostility,
    } = body

    if (!message) {
      return NextResponse.json(
        { error: 'message is required' },
        { status: 400, headers: corsHeaders }
      )
    }

    if (!npcName && !legacyCharacterId) {
      return NextResponse.json(
        { error: 'npcName or characterId is required' },
        { status: 400, headers: corsHeaders }
      )
    }

    let character: StoredCharacter | null = null

    if (npcName && project) {
      character = await findCharacterByName(npcName, project.id)
      if (!character) {
        return NextResponse.json(
          { error: `Character '${npcName}' not found in this project. Check the name and your API key.` },
          { status: 404, headers: corsHeaders }
        )
      }
    } else if (legacyCharacterId) {
      character = (await (prisma.character as any).findUnique({
        where: { id: legacyCharacterId },
        include: { projects: { select: { id: true } } },
      })) as StoredCharacter | null
      if (!character) {
        return NextResponse.json(
          { error: 'Character not found' },
          { status: 404, headers: corsHeaders }
        )
      }
      if (project && !character.projects.some((p) => p.id === project!.id)) {
        return NextResponse.json(
          { error: 'Character not accessible with this API key' },
          { status: 403, headers: corsHeaders }
        )
      }
    }

    if (!character) {
      return NextResponse.json(
        { error: 'Could not resolve character. Provide npcName (with API key) or characterId.' },
        { status: 400, headers: corsHeaders }
      )
    }

    const config = toCharacterConfig(character.config)
    const adaptation = toAdaptationMemory(character.adaptation)
    const activeProjectId = project?.id ?? character.projects[0]?.id ?? 'global'
    const projectContext =
      activeProjectId === 'global'
        ? null
        : await prisma.project.findUnique({
            where: { id: activeProjectId },
            select: { globalContext: true },
          })

    if (isLikelyPolicyTriggerMessage(message)) {
      return NextResponse.json(
        {
          success: true,
          response: `${character.name} refuses that command. Keep operations inside lawful in-city contracts and mission protocol.`,
          action: 'locks the archive channel and waits',
          characterId: character.id,
          npcName: character.name,
          tradeIntent: null,
          specializationActive: adaptation.specializationActive,
          pendingSpecialization: Boolean(adaptation.pendingSection2),
          timestamp: new Date().toISOString(),
          projectId: activeProjectId,
        },
        { status: 200, headers: corsHeaders }
      )
    }

    const tee = buildTeeGateResult({
      teeExecution: config.teeExecution,
      characterId: character.id,
      projectId: activeProjectId,
    })
    const teeTrustScore = getTeeTrustScore(tee.enabled)

    let usageTokens = parseComputeUsage(character.computeUsageTokens)
    let limitTokens = parseComputeLimit(character.computeLimitTokens ?? config.computeBudget)
    let lastComputeResetAt = parseResetAt(character.lastComputeResetAt)

    if (shouldResetBudget(lastComputeResetAt)) {
      usageTokens = BigInt(0)
      lastComputeResetAt = new Date()
      await persistComputeBudgetIfSupported(prisma as unknown as any, {
        characterId: character.id,
        usageTokens,
        limitTokens,
        lastComputeResetAt,
        logPrefix: '[chat]',
      })
    }

    const computeDecision = evaluateComputeBudget({
      usageTokens,
      limitTokens,
      lastResetAt: lastComputeResetAt,
    })

    if (!computeDecision.allowed) {
      await (prisma as any).npcLog.create({
        data: {
          characterId: character.id,
          eventType: 'COMPUTE_BUDGET_EXCEEDED',
          details: {
            message,
            budget: serializeBudget(computeDecision),
          },
        },
      })

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

    // Section 2 definition parsing
    const section2Profile = parseSection2Definition(message)
    if (section2Profile) {
      const nextAdaptation = {
        ...adaptation,
        pendingSection2: section2Profile,
        lastUpdatedAt: new Date().toISOString(),
      }
      await prisma.character.update({
        where: { id: character.id },
        data: { adaptation: nextAdaptation as unknown as Prisma.InputJsonValue },
      })
      await (prisma as any).npcLog.create({
        data: {
          characterId: character.id,
          eventType: 'SECTION2_PARSED',
          details: { systemPrompt: section2Profile.systemPrompt, openness: section2Profile.openness },
        },
      })
      return NextResponse.json(
        {
          success: true,
          response:
            'I parsed your Section 2 cognitive layer. Reply with "Activate Section 2" to apply this profile and start progressive specialization.',
          action: 'nods slowly and processes the information',
          characterId: character.id,
          npcName: character.name,
          specializationActive: adaptation.specializationActive,
          pendingSpecialization: true,
          timestamp: new Date().toISOString(),
          projectId: project?.id,
        },
        { status: 200, headers: corsHeaders }
      )
    }

    // Section 2 activation
    if (isActivationMessage(message) && adaptation.pendingSection2) {
      const appliedProfile = adaptation.pendingSection2
      const nextConfig = {
        ...config,
        systemPrompt: appliedProfile.systemPrompt,
        openness: appliedProfile.openness,
      }
      const nextAdaptation = {
        ...adaptation,
        specializationActive: true,
        pendingSection2: undefined,
        summary: buildSummary(adaptation.preferences, adaptation.turnCount, appliedProfile),
        lastUpdatedAt: new Date().toISOString(),
      }
      await prisma.character.update({
        where: { id: character.id },
        data: {
          config: nextConfig as unknown as Prisma.InputJsonValue,
          adaptation: nextAdaptation as unknown as Prisma.InputJsonValue,
        },
      })
      await (prisma as any).npcLog.create({
        data: {
          characterId: character.id,
          eventType: 'SECTION2_ACTIVATED',
          details: { openness: appliedProfile.openness },
        },
      })
      return NextResponse.json(
        {
          success: true,
          response:
            'Section 2 activated. I will now become progressively more specific to your goals as this conversation continues.',
          action: 'stands tall with a confident nod',
          characterId: character.id,
          npcName: character.name,
          specializationActive: true,
          pendingSpecialization: false,
          timestamp: new Date().toISOString(),
          projectId: project?.id,
        },
        { status: 200, headers: corsHeaders }
      )
    }

    // Normal chat — build allowed tools list
    const agent = kiteAgentClient
    const allowedTools = [
      'propose_trade',
      'execute_trade',
      'join_faction',
      'betray_ally',
      'declare_hostility',
    ]

    // Conditionally add the DB fetch tool
    if (config.allowDbFetch && config.dbEndpoint) {
      allowedTools.push('query_database')
      agent.setDbEndpoint(config.dbEndpoint)
    }

    if (Array.isArray(config.inventory)) {
      allowedTools.push('check_stock', 'execute_sale')
    }

    agent.registerTools(allowedTools)

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

    const dynamicWorldContext = worldState.buildWorldContextPrompt(character.id, activeProjectId)

    const socialInput = {
      actor: {
        factionId: config.factionId,
        disposition: config.disposition,
        baseHostility: config.baseHostility,
        openness: config.openness,
        teeTrustScore,
      },
      target: {
        factionId: typeof targetFactionId === 'string' ? targetFactionId : undefined,
        disposition:
          typeof targetDisposition === 'string'
            ? normalizeDisposition(targetDisposition)
            : undefined,
        baseHostility: targetBaseHostility,
      },
      targetName: 'message sender',
      interactionType: 'CHAT' as const,
    }

    const actorOpenness = typeof config.openness === 'number' ? config.openness : 50
    const socialEvaluation = SocialEngine.evaluateHostility(socialInput, actorOpenness)
    const socialContext = SocialEngine.buildSocialContext(socialInput, actorOpenness)
    const opennessStrategy = buildOpennessStrategyInstruction(actorOpenness)
    const explicitAggression = isExplicitlyAggressiveMessage(message)
    const hostilityBehaviorNote =
      socialEvaluation.decision === 'ALLOW_CHAT'
        ? ''
        : 'HOSTILITY OVERRIDE: Stay hostile and suspicious, but respond verbally unless the user explicitly threatens violence or coercion.'

    if (socialEvaluation.decision !== 'ALLOW_CHAT' && explicitAggression) {
      const refusalText =
        socialEvaluation.decision === 'INTERRUPT_OR_ATTACK'
          ? `${character.name} rejects diplomacy and escalates aggressively.`
          : `${character.name} refuses to engage due to hostile social standing.`
      const refusalAction =
        socialEvaluation.decision === 'INTERRUPT_OR_ATTACK'
          ? 'reaches for weapons and advances'
          : 'turns away with visible distrust'

      if (socialEvaluation.decision === 'INTERRUPT_OR_ATTACK') {
        await (prisma as any).actionQueue.create({
          data: {
            characterId: character.id,
            actionType: 'COMBAT_INIT',
            payload: {
              description: `Escalated due to social hostility score ${socialEvaluation.hostilityScore}.`,
              hostilityScore: socialEvaluation.hostilityScore,
              trigger: 'CHAT',
            },
            status: 'PENDING',
            executeAt: new Date(),
          },
        })
      }

      await (prisma as any).npcLog.create({
        data: {
          characterId: character.id,
          eventType: 'CHAT_BLOCKED_SOCIAL',
          details: {
            message,
            response: refusalText,
            action: refusalAction,
            hostilityScore: socialEvaluation.hostilityScore,
            decision: socialEvaluation.decision,
          },
        },
      })

      worldState.updateLastAction(character.id, `hostility:${socialEvaluation.decision}`)

      eventBus.broadcast({
        sourceId: character.id,
        sourceName: character.name,
        actionType: 'HOSTILITY_TRIGGERED',
        payload: {
          projectId: activeProjectId,
          sourceFactionId: config.factionId,
          sourceDisposition: config.disposition,
          sourceBaseHostility: config.baseHostility,
          sourceOpenness: actorOpenness,
          sourceTeeTrustScore: teeTrustScore,
          sourceTeeEnabled: tee.enabled,
          hostilityScore: socialEvaluation.hostilityScore,
          decision: socialEvaluation.decision,
          message,
        },
        timestamp: new Date().toISOString(),
      })

      return NextResponse.json(
        {
          success: true,
          response: refusalText,
          action: refusalAction,
          characterId: character.id,
          npcName: character.name,
          tradeIntent: null,
          specializationActive: adaptation.specializationActive,
          pendingSpecialization: Boolean(adaptation.pendingSection2),
          timestamp: new Date().toISOString(),
          projectId: activeProjectId,
          socialDecision: socialEvaluation.decision,
          hostilityScore: socialEvaluation.hostilityScore,
          compute: serializeBudget(computeDecision),
          tee,
        },
        { status: 200, headers: corsHeaders }
      )
    }

    const basePrompt = typeof config.systemPrompt === 'string' && config.systemPrompt.trim()
      ? config.systemPrompt
      : 'You are an autonomous NPC that negotiates fairly and builds reputation.'
    const globalWorldContext =
      typeof projectContext?.globalContext === 'string' && projectContext.globalContext.trim()
        ? `[GLOBAL WORLD CONTEXT]\n${projectContext.globalContext.trim()}`
        : ''

    let liveWalletBalance: string | undefined
    try {
      const provider = new ethers.JsonRpcProvider(KITE_RPC)
      const rawBalance = await provider.getBalance(character.walletAddress)
      liveWalletBalance = ethers.formatEther(rawBalance)
    } catch (error) {
      console.warn('[chat] Failed to fetch live wallet balance:', error)
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

    const activeProfile: Section2Profile = {
      systemPrompt:
        `${basePrompt}\n\n${globalWorldContext}\n\n${dynamicWorldContext}\n\n${socialContext}\n\n${hostilityBehaviorNote}\n\n${opennessStrategy}\n\n${economicContext}\n\n${dbInstruction}\n\n${inventoryInstruction}`.trim(),
      openness: actorOpenness,
    }

    let updatedAdaptation = adaptation
    if (adaptation.specializationActive) {
      const preferenceUpdates = extractPreferences(message)
      const mergedPreferences = mergePreferences(adaptation.preferences, preferenceUpdates)
      updatedAdaptation = {
        ...adaptation,
        turnCount: adaptation.turnCount + 1,
        preferences: mergedPreferences,
        summary: buildSummary(mergedPreferences, adaptation.turnCount + 1, activeProfile),
        lastUpdatedAt: new Date().toISOString(),
      }
      await prisma.character.update({
        where: { id: character.id },
        data: { adaptation: updatedAdaptation as unknown as Prisma.InputJsonValue },
      })
    }

    const agentResponse = await agent.chat(message, {
      characterName: character.name,
      characterId: character.id,
      systemPrompt: activeProfile.systemPrompt,
      openness: activeProfile.openness,
      canTrade: config.canTrade,
      specializationActive: updatedAdaptation.specializationActive,
      adaptationSummary: updatedAdaptation.summary,
      preferences: updatedAdaptation.preferences,
      turnCount: updatedAdaptation.turnCount,
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
      dbEndpoint: config.allowDbFetch ? config.dbEndpoint : undefined,
      inventoryEnabled: Array.isArray(config.inventory),
      inventory: config.inventory,
      npcWalletAddress: character.walletAddress,
    })

    const usedTokens = BigInt(agentResponse.usage?.totalTokens ?? 0)
    let updatedUsageTokens = usageTokens
    if (usedTokens > BigInt(0)) {
      updatedUsageTokens = usageTokens + usedTokens
      try {
        await persistComputeBudgetIfSupported(prisma as unknown as any, {
          characterId: character.id,
          usageTokens: updatedUsageTokens,
          limitTokens,
          lastComputeResetAt,
          logPrefix: '[chat]',
        })

        await (prisma as any).npcLog.create({
          data: {
            characterId: character.id,
            eventType: 'COMPUTE_SPEND',
            details: {
              usedTokens: usedTokens.toString(),
              usageBefore: usageTokens.toString(),
              usageAfter: updatedUsageTokens.toString(),
              limitTokens: limitTokens.toString(),
              message,
            },
          },
        })
      } catch (persistError) {
        console.warn('[chat] Failed to persist compute spend details:', persistError)
      }
    }

    let finalTradeIntent = agentResponse.tradeIntent
    let finalResponseText = agentResponse.text

    if (agentResponse.tradeIntent) {
      const validation = EconomicEngine.validateTradeDetailed({
        tradeIntent: agentResponse.tradeIntent,
        config,
        currentMarketRate,
        openness: actorOpenness,
        proposedCurrency: agentResponse.tradeIntent.currency,
        marketRateCurrency: activeCurrency,
      })

      if (!validation.isValid) {
        finalTradeIntent = undefined
        finalResponseText =
          `${agentResponse.text}\n\n[System Notice] Proposed trade was blocked by economic policy: ${validation.reason ?? 'invalid pricing.'}`
      }
    }

    await (prisma as any).npcLog.create({
      data: {
        characterId: character.id,
        eventType: 'CHAT',
        details: {
          message,
          response: finalResponseText,
          action: agentResponse.action ?? null,
          hasTrade: !!finalTradeIntent,
        },
      },
    })

    worldState.updateLastAction(
      character.id,
      finalTradeIntent ? 'trade_proposed' : 'chat_replied'
    )

    eventBus.broadcast({
      sourceId: character.id,
      sourceName: character.name,
      actionType: finalTradeIntent ? 'TRADE_PROPOSED' : 'CHAT',
      payload: {
        message: message,
        response: finalResponseText,
        tradeIntent: finalTradeIntent,
        projectId: activeProjectId,
        sourceFactionId: config.factionId,
        sourceDisposition: config.disposition,
        sourceBaseHostility: config.baseHostility,
        sourceOpenness: actorOpenness,
        sourceTeeTrustScore: teeTrustScore,
        sourceTeeEnabled: tee.enabled,
      },
      timestamp: new Date().toISOString(),
    })

    const updatedComputeDecision = evaluateComputeBudget({
      usageTokens: updatedUsageTokens,
      limitTokens,
      lastResetAt: lastComputeResetAt,
    })

    return NextResponse.json(
      {
        success: true,
        response: finalResponseText,
        action: agentResponse.action ?? null,
        characterId: character.id,
        npcName: character.name,
        tradeIntent: finalTradeIntent ?? null,
        specializationActive: updatedAdaptation.specializationActive,
        pendingSpecialization: Boolean(updatedAdaptation.pendingSection2),
        timestamp: new Date().toISOString(),
        projectId: project?.id,
        socialDecision: socialEvaluation.decision,
        hostilityScore: socialEvaluation.hostilityScore,
        compute: serializeBudget(updatedComputeDecision),
        tee,
      },
      { status: 200, headers: corsHeaders }
    )
  } catch (error) {
    console.error('[API] Chat error:', error)
    return NextResponse.json(
      { error: 'Failed to process chat request' },
      { status: 500, headers: corsHeaders }
    )
  }
}