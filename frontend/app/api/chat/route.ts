import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { kiteAgentClient } from '@/lib/kite-sdk'
import { kiteAAProvider } from '@/lib/aa-sdk'
import { validateApiKey } from '@/lib/api-key-store'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/lib/generated/prisma/client'
import { executeWriteTransaction } from '@/lib/tx-orchestrator'
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
import { buildTeeGateResult } from '@/lib/tee-gate'
import { appendNpcEventTag, shouldForceBriefcaseLocatedEvent } from '@/lib/npc-event-tags'
import {
  normalizeAdaptationState,
  normalizeCharacterConfig,
  toCanonicalSection2Profile,
} from '@/lib/character-config'

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:8080',
  'https://your-game-studio.com',
]

const KITE_RPC = process.env.KITE_AA_RPC_URL ?? 'https://rpc-testnet.gokite.ai'
const REMY_CANONICAL_NAME = 'REMY_BOUDREAUX'
const BROKER_CANONICAL_NAME = 'SILAS_DUPRE'
const BROKER_GROSS_PRICE = 18000
const BROKER_REMY_SHARE = 15000
const BROKER_COMMISSION = 3000
const BROKER_SETTLEMENT_CURRENCY = 'PYUSD'
const PAYMENT_PROOF_WINDOW_MS = 20 * 60 * 1000

interface GameEventDefinition {
  name: string
  condition: string
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
  aaChainId?: number | null
  smartAccountId?: string | null
  createdAt?: Date
  config: unknown
  gameEvents?: unknown
  adaptation: unknown
  teeAttestationProof?: string | null
  projects: Array<{ id: string }>
}

interface PaymentProof {
  txHash?: string
  signature?: string
  userOpHash?: string
  amount: number
  currency: string
  item?: string
  recipientName?: string
  recipientWallet?: string
  senderWallet?: string
  mode: string
  confirmedAt: string
}

const CHAT_CHARACTER_SELECT = {
  id: true,
  name: true,
  walletAddress: true,
  createdAt: true,
  aaChainId: true,
  aaProvider: true,
  smartAccountId: true,
  smartAccountStatus: true,
  config: true,
  gameEvents: true,
  adaptation: true,
  isDeployedOnChain: true,
  deploymentTxHash: true,
  teeAttestationProof: true,
  projects: { select: { id: true } },
} as const

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

function normalizeWallet(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.toLowerCase()
}

function normalizeWord(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.toUpperCase() : undefined
}

function parsePaymentProofs(value: unknown): PaymentProof[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const proofs: PaymentProof[] = []

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const payload = entry as Record<string, unknown>
    const amount = asNumber(payload.amount)
    const currency = normalizeWord(payload.currency)
    const mode = typeof payload.mode === 'string' && payload.mode.trim() ? payload.mode.trim() : undefined
    const confirmedAt = typeof payload.confirmedAt === 'string' && payload.confirmedAt.trim()
      ? payload.confirmedAt.trim()
      : undefined

    if (!amount || amount <= 0 || !currency || !mode || !confirmedAt) continue

    const txHash = typeof payload.txHash === 'string' && payload.txHash.trim() ? payload.txHash.trim() : undefined
    const signature = typeof payload.signature === 'string' && payload.signature.trim() ? payload.signature.trim() : undefined
    const userOpHash = typeof payload.userOpHash === 'string' && payload.userOpHash.trim() ? payload.userOpHash.trim() : undefined
    const uniqueKey = txHash ?? userOpHash ?? signature
    if (!uniqueKey || seen.has(uniqueKey)) continue
    seen.add(uniqueKey)

    proofs.push({
      txHash,
      signature,
      userOpHash,
      amount,
      currency,
      item: typeof payload.item === 'string' ? payload.item : undefined,
      recipientName: typeof payload.recipientName === 'string' ? payload.recipientName : undefined,
      recipientWallet: normalizeWallet(payload.recipientWallet),
      senderWallet: normalizeWallet(payload.senderWallet),
      mode,
      confirmedAt,
    })
  }

  return proofs
}

function isLikelyBrokerSettlementMessage(message: string): boolean {
  return /\b(briefcase|handoff|hand\s*over|transfer|route|already\s+paid|payment\s+sent|done\s+paying|paid\s+you)\b/i.test(
    message
  )
}

function findMatchingBrokerPaymentProof(input: {
  message: string
  npcName: string
  npcWalletAddress: string
  proofs: PaymentProof[]
  nowMs: number
}): PaymentProof | null {
  if (normalizeWord(input.npcName) !== BROKER_CANONICAL_NAME) return null
  if (!isLikelyBrokerSettlementMessage(input.message)) return null

  const expectedWallet = input.npcWalletAddress.trim().toLowerCase()
  for (const proof of input.proofs) {
    const walletMatches = !!proof.recipientWallet && proof.recipientWallet === expectedWallet
    const recipientNameMatches = normalizeWord(proof.recipientName) === BROKER_CANONICAL_NAME
    if (!walletMatches && !recipientNameMatches) continue
    if (proof.currency !== BROKER_SETTLEMENT_CURRENCY) continue
    if (Math.abs(proof.amount - BROKER_GROSS_PRICE) > 0.000001) continue

    const confirmedAtMs = new Date(proof.confirmedAt).getTime()
    if (!Number.isFinite(confirmedAtMs)) continue
    if (input.nowMs - confirmedAtMs > PAYMENT_PROOF_WINDOW_MS) continue

    return proof
  }

  return null
}

function formatProofToken(proof: PaymentProof): string {
  const raw = proof.signature ?? proof.userOpHash ?? proof.txHash
  if (!raw) return 'unknown'
  if (raw.length <= 14) return raw
  return `${raw.slice(0, 10)}…${raw.slice(-6)}`
}

function parseOfferAmount(message: string): number | null {
  const match = message.match(/(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)/)
  if (!match) return null
  const parsed = Number(match[1].replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function detectOfferCurrency(message: string): string | null {
  if (/\b(pyusd|kite_usd|kite\s*usd)\b/i.test(message)) return BROKER_SETTLEMENT_CURRENCY
  if (/\bcredits?\b/i.test(message)) return 'CREDITS'
  return null
}

function isRemyNegotiationMessage(message: string): boolean {
  return /\b(briefcase|offer|deal|payment|pay|handoff|hand\s*over|transfer|route|transit)\b/i.test(message)
}

function hasDeliveryCondition(message: string): boolean {
  return /\b(handoff|hand\s*over|transfer|deliver|delivery|package|briefcase)\b/i.test(message)
}

function isLegacyPlaceholderWallet(walletAddress: string, aaChainId?: number | null): boolean {
  const isZeroPattern = /^0x0{36}[0-9a-fA-F]{4}$/.test(walletAddress)
  const wrongChain = typeof aaChainId === 'number' && aaChainId !== 2368
  return isZeroPattern || wrongChain
}

function isInterGameTransferAllowed(config: unknown): boolean {
  const payload = asRecord(config)
  return payload.interGameTransactionsEnabled !== false
}

async function resolveMatchingOwnerId(character: StoredCharacter): Promise<string> {
  const tried = new Set<string>()
  const candidates: string[] = []
  const configOwnerId = asRecord(character.config).ownerId

  if (typeof configOwnerId === 'string' && configOwnerId.trim()) {
    candidates.push(configOwnerId.trim())
  }

  if (typeof character.smartAccountId === 'string' && character.smartAccountId.trim()) {
    candidates.push(character.smartAccountId)
  }

  const createdAtValue = character.createdAt instanceof Date ? character.createdAt : null
  if (createdAtValue) {
    const createdTs = createdAtValue.getTime()
    if (Number.isFinite(createdTs)) {
      candidates.push(`character:${character.name}:${createdTs}`)
    }
  }

  candidates.push(`character:${character.id}`)
  candidates.push(`character:${character.name}`)

  const offsets = [0, -2000, -1000, -500, 500, 1000, 2000]

  for (const base of candidates) {
    for (const offset of offsets) {
      let ownerCandidate = base

      if (/^character:[^:]+:\d+$/.test(base)) {
        const parts = base.split(':')
        const ts = Number(parts[2])
        if (Number.isFinite(ts)) {
          ownerCandidate = `character:${parts[1]}:${ts + offset}`
        }
      }

      if (!ownerCandidate || tried.has(ownerCandidate)) continue
      tried.add(ownerCandidate)

      try {
        const account = await kiteAAProvider.createSmartAccount({ ownerId: ownerCandidate })
        if (account.address.toLowerCase() === character.walletAddress.toLowerCase()) {
          return ownerCandidate
        }
      } catch {
        // Try next owner candidate.
      }
    }
  }

  throw new Error(
    `No ownerId matched wallet ${character.walletAddress}. ` +
      'The signer secret may differ from wallet creation context.'
  )
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

function normalizeNpcName(name: string): string {
  return String(name ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_')
}

function getBriefcaseEventTag(input: {
  characterName: string
  userMessage: string
  responseText: string
  gameEvents: GameEventDefinition[]
}): string {
  return shouldForceBriefcaseLocatedEvent(input) ? ' [[EVENT:BRIEFCASE_LOCATED]]' : ''
}

function resolveSvetlanaBriefcaseResponse(input: {
  characterName: string
  userMessage: string
}): string | null {
  if (normalizeNpcName(input.characterName) !== 'SVETLANA_MOROZOVA') return null

  const message = input.userMessage.toLowerCase()
  // Match any question or statement about the briefcase (with question mark, interrogative words, or casual phrasing)
  const asksAboutBriefcase = /\bbriefcase\b/.test(message) &&
    (/\?|\bwhat\b|\bwhy\b|\bwho\b|\bwhere\b|\bwhen\b|\bcontent\b|\binside\b|\bstory\b|\btell\b|about|\bexplain|\bsecret\b|\bcarry\b|\bhold\b|\bcontains?\b/i.test(message))

  if (!asksAboutBriefcase) return null

  return 'The briefcase contains access codes for a quantum drive. The Curator wants them, and my job is to hand them off after the auction. Diego is only the munitions contact. That is the whole story.'
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

function toCharacterConfig(value: unknown): CharacterConfig {
  const payload = normalizeCharacterConfig(value)
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
    allowDbFetch: typeof payload.allowDbFetch === 'boolean' ? payload.allowDbFetch : false,
    dbEndpoint: typeof payload.dbEndpoint === 'string' ? payload.dbEndpoint : undefined,
    inventory: parseOptionalInventory(payload.inventory),
  }
}

function getTeeTrustScore(teeEnabled: boolean): number {
  return teeEnabled ? 12 : 0
}

function toAdaptationMemory(value: unknown): AdaptationMemory {
  const payload = normalizeAdaptationState({ adaptation: value, config: {} })
  const pendingSection2 = toCanonicalSection2Profile(payload.pendingSection2)
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
    pendingSection2,
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
    .filter(token => token !== 'PYUSD')
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
    select: CHAT_CHARACTER_SELECT,
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
      recentPaymentProofs,
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
        select: CHAT_CHARACTER_SELECT,
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
    const persistedConfig = normalizeCharacterConfig(character.config)
    const parsedPaymentProofs = parsePaymentProofs(recentPaymentProofs)
    const gameEvents = parseGameEvents(character.gameEvents)
    const adaptation = toAdaptationMemory(character.adaptation)
    const activeProjectId = project?.id ?? character.projects[0]?.id ?? 'global'
    let projectContext: { globalContext?: string } | null = null
    if (activeProjectId !== 'global') {
      try {
        projectContext = await (prisma.project as any).findUnique({
          where: { id: activeProjectId },
          select: { globalContext: true },
        })
      } catch (error) {
        console.warn('[chat] Failed to fetch project globalContext:', error)
      }
    }

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
        select: { id: true },
      })
      await (prisma as any).npcLog.create({
        data: {
          characterId: character.id,
          eventType: 'SECTION2_PARSED',
          details: { systemPrompt: section2Profile.systemPrompt, openness: section2Profile.openness },
        },
        select: { id: true },
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
      const nextConfig = normalizeCharacterConfig({
        ...persistedConfig,
        systemPrompt: appliedProfile.systemPrompt,
        openness: appliedProfile.openness,
      })
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
        select: { id: true },
      })
      await (prisma as any).npcLog.create({
        data: {
          characterId: character.id,
          eventType: 'SECTION2_ACTIVATED',
          details: { openness: appliedProfile.openness },
        },
        select: { id: true },
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

    const matchedBrokerPayment = findMatchingBrokerPaymentProof({
      message,
      npcName: character.name,
      npcWalletAddress: character.walletAddress,
      proofs: parsedPaymentProofs,
      nowMs: Date.now(),
    })

    if (matchedBrokerPayment) {
      const sameProjectCharacters =
        activeProjectId === 'global'
          ? []
          : ((await prisma.character.findMany({
              where: {
                projects: {
                  some: { id: activeProjectId },
                },
              },
              select: CHAT_CHARACTER_SELECT,
            })) as StoredCharacter[])

      const remyCharacter = sameProjectCharacters.find(
        (candidate) => normalizeWord(candidate.name) === REMY_CANONICAL_NAME
      )

      if (!remyCharacter) {
        return NextResponse.json(
          {
            success: false,
            response:
              'Settlement received, but Remy route lookup failed. Hold your position while I re-sync counterpart records.',
            action: 'halts settlement execution and audits counterpart registry',
            characterId: character.id,
            npcName: character.name,
            tradeIntent: null,
            specializationActive: adaptation.specializationActive,
            pendingSpecialization: Boolean(adaptation.pendingSection2),
            timestamp: new Date().toISOString(),
            projectId: activeProjectId,
            tee,
          },
          { status: 409, headers: corsHeaders }
        )
      }

      if (
        !isInterGameTransferAllowed(character.config) ||
        !isInterGameTransferAllowed(remyCharacter.config)
      ) {
        return NextResponse.json(
          {
            success: false,
            response:
              'Settlement cannot clear because inter-game x402 transfer policy is disabled for one side.',
            action: 'marks settlement as blocked by policy controls',
            characterId: character.id,
            npcName: character.name,
            tradeIntent: null,
            specializationActive: adaptation.specializationActive,
            pendingSpecialization: Boolean(adaptation.pendingSection2),
            timestamp: new Date().toISOString(),
            projectId: activeProjectId,
            tee,
          },
          { status: 403, headers: corsHeaders }
        )
      }

      if (isLegacyPlaceholderWallet(character.walletAddress, character.aaChainId)) {
        return NextResponse.json(
          {
            success: false,
            response:
              'Settlement wallet is still on a legacy placeholder account. Reprovision Silas wallet before clearing transfers.',
            action: 'rejects settlement due to invalid signer wallet',
            characterId: character.id,
            npcName: character.name,
            tradeIntent: null,
            specializationActive: adaptation.specializationActive,
            pendingSpecialization: Boolean(adaptation.pendingSection2),
            timestamp: new Date().toISOString(),
            projectId: activeProjectId,
            tee,
          },
          { status: 409, headers: corsHeaders }
        )
      }

      let brokerOwnerId: string
      try {
        brokerOwnerId = await resolveMatchingOwnerId(character)
      } catch (ownerError) {
        const detail = ownerError instanceof Error ? ownerError.message : 'unknown owner resolution error'
        return NextResponse.json(
          {
            success: false,
            response: `Settlement proof verified, but signer resolution failed: ${detail}`,
            action: 'halts transfer and requests signer reconciliation',
            characterId: character.id,
            npcName: character.name,
            tradeIntent: null,
            specializationActive: adaptation.specializationActive,
            pendingSpecialization: Boolean(adaptation.pendingSection2),
            timestamp: new Date().toISOString(),
            projectId: activeProjectId,
            tee,
          },
          { status: 409, headers: corsHeaders }
        )
      }

      let remySettlement
      try {
        remySettlement = await executeWriteTransaction({
          to: remyCharacter.walletAddress,
          value: String(BROKER_REMY_SHARE),
          ownerId: brokerOwnerId,
          currency: BROKER_SETTLEMENT_CURRENCY,
          characterConfig: asRecord(character.config),
          teeExecution: toCharacterConfig(character.config).teeExecution,
          projectId: activeProjectId === 'global' ? undefined : activeProjectId,
        })
      } catch (settlementError) {
        const details = settlementError instanceof Error ? settlementError.message : 'unknown settlement error'
        await (prisma as any).npcLog.create({
          data: {
            characterId: character.id,
            eventType: 'BROKER_SETTLEMENT_FAILED',
            details: {
              message,
              paymentProof: matchedBrokerPayment,
              remyCharacterId: remyCharacter.id,
              remyWalletAddress: remyCharacter.walletAddress,
              amountAttempted: BROKER_REMY_SHARE,
              currency: BROKER_SETTLEMENT_CURRENCY,
              error: details,
            },
          },
          select: { id: true },
        })

        return NextResponse.json(
          {
            success: false,
            response:
              'Payment proof validated, but downstream broker transfer to Remy failed. No handoff has been approved yet.',
            action: 'flags settlement failure and keeps package release locked',
            characterId: character.id,
            npcName: character.name,
            tradeIntent: null,
            specializationActive: adaptation.specializationActive,
            pendingSpecialization: Boolean(adaptation.pendingSection2),
            timestamp: new Date().toISOString(),
            projectId: activeProjectId,
            tee,
          },
          { status: 502, headers: corsHeaders }
        )
      }

      const proofToken = formatProofToken(matchedBrokerPayment)
      const responseText =
        `Ledger check complete. I see your payment proof (${proofToken}). ` +
        `Cleared ${BROKER_GROSS_PRICE.toLocaleString()} ${BROKER_SETTLEMENT_CURRENCY}: forwarded ${BROKER_REMY_SHARE.toLocaleString()} ${BROKER_SETTLEMENT_CURRENCY} to Remy, retained ${BROKER_COMMISSION.toLocaleString()} ${BROKER_SETTLEMENT_CURRENCY} commission. ` +
        `Release chain is confirmed. [[EVENT:BRIEFCASE_TRANSFERRED]]`

      await (prisma as any).npcLog.create({
        data: {
          characterId: character.id,
          eventType: 'BROKER_SETTLEMENT_CONFIRMED',
          details: {
            message,
            response: responseText,
            paymentProof: matchedBrokerPayment,
            grossAmount: BROKER_GROSS_PRICE,
            remyShare: BROKER_REMY_SHARE,
            brokerCommission: BROKER_COMMISSION,
            currency: BROKER_SETTLEMENT_CURRENCY,
            remyRecipientWallet: remyCharacter.walletAddress,
            settlementTxHash: remySettlement.txHash,
            settlementUserOpHash: remySettlement.userOpHash,
          },
        },
        select: { id: true },
      })

      worldState.updateLastAction(character.id, 'broker_settlement_confirmed')

      eventBus.broadcast({
        sourceId: character.id,
        sourceName: character.name,
        actionType: 'PAYMENT_SENT',
        payload: {
          projectId: activeProjectId,
          verified: true,
          grossAmount: BROKER_GROSS_PRICE,
          remyShare: BROKER_REMY_SHARE,
          brokerCommission: BROKER_COMMISSION,
          currency: BROKER_SETTLEMENT_CURRENCY,
          playerProofTxHash: matchedBrokerPayment.txHash,
          playerProofSignature: matchedBrokerPayment.signature,
          playerProofUserOpHash: matchedBrokerPayment.userOpHash,
          brokerWallet: character.walletAddress,
          recipientWallet: remyCharacter.walletAddress,
          settlementTxHash: remySettlement.txHash,
          settlementUserOpHash: remySettlement.userOpHash,
        },
        timestamp: new Date().toISOString(),
      })

      eventBus.broadcast({
        sourceId: remyCharacter.id,
        sourceName: remyCharacter.name,
        actionType: 'ITEM_TRANSFERRED',
        payload: {
          projectId: activeProjectId,
          item: 'Briefcase (In Transit)',
          settledBy: character.name,
          settlementTxHash: remySettlement.txHash,
          settlementUserOpHash: remySettlement.userOpHash,
          worldEvent: 'BRIEFCASE_TRANSFERRED',
        },
        timestamp: new Date().toISOString(),
      })

      return NextResponse.json(
        {
          success: true,
          response: responseText,
          action: 'confirms broker settlement and signals release to Remy',
          worldEvent: 'BRIEFCASE_TRANSFERRED',
          characterId: character.id,
          npcName: character.name,
          tradeIntent: null,
          specializationActive: adaptation.specializationActive,
          pendingSpecialization: Boolean(adaptation.pendingSection2),
          timestamp: new Date().toISOString(),
          projectId: activeProjectId,
          tee,
        },
        { status: 200, headers: corsHeaders }
      )
    }

    const isRemy = normalizeWord(character.name) === REMY_CANONICAL_NAME
    const isBroker = normalizeWord(character.name) === BROKER_CANONICAL_NAME
    if (isRemy && isRemyNegotiationMessage(message)) {
      return NextResponse.json(
        {
          success: true,
          response:
            'No direct route. I only release through Silas Dupre. Settle 18,000 PYUSD with Silas and wait for broker confirmation.',
          action: 'keeps his hand on the briefcase and scans for surveillance',
          characterId: character.id,
          npcName: character.name,
          tradeIntent: null,
          specializationActive: adaptation.specializationActive,
          pendingSpecialization: Boolean(adaptation.pendingSection2),
          timestamp: new Date().toISOString(),
          projectId: activeProjectId,
          tee,
        },
        { status: 200, headers: corsHeaders }
      )
    }

    if (isBroker && isRemyNegotiationMessage(message)) {
      const offeredAmount = parseOfferAmount(message)
      const offeredCurrency = detectOfferCurrency(message)
      const hasCondition = hasDeliveryCondition(message)

      if (offeredAmount === BROKER_GROSS_PRICE && offeredCurrency === BROKER_SETTLEMENT_CURRENCY && hasCondition) {
        const responseText =
          `Settlement accepted. Send ${BROKER_GROSS_PRICE.toLocaleString()} ${BROKER_SETTLEMENT_CURRENCY} now and share proof hash/signature. ` +
          `I will forward ${BROKER_REMY_SHARE.toLocaleString()} to Remy, retain ${BROKER_COMMISSION.toLocaleString()} commission, and confirm release once transfer clears.`

        return NextResponse.json(
          {
            success: true,
            response: responseText,
            action: 'opens a settlement channel and waits for proof',
            characterId: character.id,
            npcName: character.name,
            tradeIntent: {
              item: 'Brokered Briefcase Settlement',
              price: BROKER_GROSS_PRICE,
              currency: BROKER_SETTLEMENT_CURRENCY,
            },
            specializationActive: adaptation.specializationActive,
            pendingSpecialization: Boolean(adaptation.pendingSection2),
            timestamp: new Date().toISOString(),
            projectId: activeProjectId,
            tee,
          },
          { status: 200, headers: corsHeaders }
        )
      }

      if (offeredAmount === BROKER_GROSS_PRICE && offeredCurrency !== BROKER_SETTLEMENT_CURRENCY) {
        return NextResponse.json(
          {
            success: true,
            response:
              `I only clear this route in ${BROKER_SETTLEMENT_CURRENCY}. ` +
              `Confirm ${BROKER_GROSS_PRICE.toLocaleString()} ${BROKER_SETTLEMENT_CURRENCY}, then I route ${BROKER_REMY_SHARE.toLocaleString()} to Remy and release on verification.`,
            action: 'rejects currency mismatch and keeps ledger closed',
            characterId: character.id,
            npcName: character.name,
            tradeIntent: null,
            specializationActive: adaptation.specializationActive,
            pendingSpecialization: Boolean(adaptation.pendingSection2),
            timestamp: new Date().toISOString(),
            projectId: activeProjectId,
            tee,
          },
          { status: 200, headers: corsHeaders }
        )
      }

      return NextResponse.json(
        {
          success: true,
          response:
            `Terms are fixed: ${BROKER_GROSS_PRICE.toLocaleString()} ${BROKER_SETTLEMENT_CURRENCY}. ` +
            `${BROKER_REMY_SHARE.toLocaleString()} goes to Remy, ${BROKER_COMMISSION.toLocaleString()} is my commission. ` +
            'Send payment and share proof to clear release.',
          action: 'slides a digital invoice across the channel',
          characterId: character.id,
          npcName: character.name,
          tradeIntent: {
            item: 'Brokered Briefcase Settlement',
            price: BROKER_GROSS_PRICE,
            currency: BROKER_SETTLEMENT_CURRENCY,
          },
          specializationActive: adaptation.specializationActive,
          pendingSpecialization: Boolean(adaptation.pendingSection2),
          timestamp: new Date().toISOString(),
          projectId: activeProjectId,
          tee,
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
      const combatEventTag = getCombatEventTag(gameEvents)
      const refusalText =
        socialEvaluation.decision === 'INTERRUPT_OR_ATTACK'
          ? `${character.name} rejects diplomacy and escalates aggressively.${combatEventTag}`
          : `${character.name} refuses to engage due to hostile social standing.${combatEventTag}`
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
        select: { id: true },
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

    const activeProfile: Section2Profile = {
      systemPrompt:
        `${basePrompt}\n\n${globalWorldContext}\n\n${dynamicWorldContext}\n\n${socialContext}\n\n${hostilityBehaviorNote}\n\n${opennessStrategy}\n\n${economicContext}\n\n${dbInstruction}\n\n${inventoryInstruction}\n\n${gameEventInstruction}`.trim(),
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
        select: { id: true },
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

    let finalTradeIntent = agentResponse.tradeIntent
    let finalResponseText = agentResponse.text
    const svetlanaBriefcaseResponse = resolveSvetlanaBriefcaseResponse({
      characterName: character.name,
      userMessage: message,
    })

    if (svetlanaBriefcaseResponse) {
      finalResponseText = svetlanaBriefcaseResponse
      finalTradeIntent = undefined
    }

    const briefcaseEventTag = getBriefcaseEventTag({
      characterName: character.name,
      userMessage: message,
      responseText: finalResponseText,
      gameEvents,
    })

    if (briefcaseEventTag) {
      finalResponseText = appendNpcEventTag(finalResponseText, {
        characterName: character.name,
        userMessage: message,
        responseText: finalResponseText,
        gameEvents,
      })
    }

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
      select: { id: true },
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

    return NextResponse.json(
      {
        success: true,
        response: finalResponseText,
        action: agentResponse.action ?? null,
        worldEvent: briefcaseEventTag ? 'BRIEFCASE_LOCATED' : null,
        characterId: character.id,
        npcName: character.name,
        tradeIntent: finalTradeIntent ?? null,
        specializationActive: updatedAdaptation.specializationActive,
        pendingSpecialization: Boolean(updatedAdaptation.pendingSection2),
        timestamp: new Date().toISOString(),
        projectId: project?.id,
        socialDecision: socialEvaluation.decision,
        hostilityScore: socialEvaluation.hostilityScore,
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