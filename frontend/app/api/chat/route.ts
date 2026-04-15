import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { kiteAgentClient } from '@/lib/kite-sdk'
import { validateApiKey } from '@/lib/api-key-store'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/lib/generated/prisma/client'
import { eventBus } from '@/lib/npcEventBus'
import { worldState } from '@/lib/npcWorldState'
import { EconomicEngine } from '@/lib/economic-engine'

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

function toCharacterConfig(value: unknown): CharacterConfig {
  const payload = asRecord(value)
  return {
    systemPrompt: typeof payload.systemPrompt === 'string' ? payload.systemPrompt : undefined,
    openness: typeof payload.openness === 'number' ? payload.openness : undefined,
    canTrade: typeof payload.canTrade === 'boolean' ? payload.canTrade : undefined,
    baseCapital: asNumber(payload.baseCapital ?? payload.capital),
    pricingAlgorithm:
      typeof payload.pricingAlgorithm === 'string' ? payload.pricingAlgorithm : undefined,
    marginPercentage: asNumber(payload.marginPercentage),
  }
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

/**
 * Look up a character by name within the authenticated project.
 * npcName is normalised to uppercase with underscores, matching how names are stored.
 */
async function findCharacterByName(
  npcName: string,
  projectId: string
): Promise<StoredCharacter | null> {
  const normalisedName = npcName.trim().toUpperCase().replace(/\s+/g, '_')
  const character = await (prisma.character as any).findFirst({
    where: {
      name: normalisedName,
      projects: { some: { id: projectId } },
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

    // Support both npcName (new semantic API) and characterId (legacy)
    const { npcName, characterId: legacyCharacterId, message } = body

    if (!message) {
      return NextResponse.json(
        { error: 'message is required' },
        { status: 400, headers: corsHeaders }
      )
    }

    // Base-chat fallback — no NPC target
    if (!npcName && !legacyCharacterId) {
      const agent = kiteAgentClient
      agent.registerTools([])
      const agentResponse = await agent.chat(message, {
        characterName: 'NPC Assistant',
        canTrade: false,
        systemPrompt:
          'You are a helpful NPC assistant. Chat naturally and ask for Section 2 details when the user wants deeper specialization.',
      })
      return NextResponse.json(
        {
          success: true,
          response: agentResponse.text,
          action: agentResponse.action ?? null,
          specializationActive: false,
          pendingSpecialization: false,
          timestamp: new Date().toISOString(),
          projectId: project?.id,
        },
        { status: 200, headers: corsHeaders }
      )
    }

    // Resolve the character — prefer name lookup, fall back to ID
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
      // Legacy path: look up by ID
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
      // Log the event
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

    // Normal chat
    const agent = kiteAgentClient
    agent.registerTools(['get_payer_addr', 'approve_payment', 'check_inventory', 'execute_trade'])

    // 1. Fetch the live context of other NPCs in the project
    const dynamicWorldContext = worldState.buildWorldContextPrompt(character.id)

    // 2. Append it to the base system prompt
    const basePrompt = typeof config.systemPrompt === 'string' && config.systemPrompt.trim()
      ? config.systemPrompt
      : 'You are an autonomous NPC that negotiates fairly and builds reputation.'

    let liveWalletBalance: string | undefined
    try {
      const provider = new ethers.JsonRpcProvider(KITE_RPC)
      const rawBalance = await provider.getBalance(character.walletAddress)
      liveWalletBalance = ethers.formatEther(rawBalance)
    } catch (error) {
      console.warn('[chat] Failed to fetch live wallet balance:', error)
    }

    const currentMarketRate = await fetchCurrentMarketRate()
    const economicContext = EconomicEngine.buildEconomicContext({
      config,
      currentMarketRate,
      liveWalletBalance,
    })

    const activeProfile: Section2Profile = {
      systemPrompt: `${basePrompt}\n\n${dynamicWorldContext}\n\n${economicContext}`,
      openness: typeof config.openness === 'number' ? config.openness : 50,
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
    })

    let finalTradeIntent = agentResponse.tradeIntent
    let finalResponseText = agentResponse.text

    if (agentResponse.tradeIntent) {
      const validation = EconomicEngine.validateTradeDetailed({
        tradeIntent: agentResponse.tradeIntent,
        config,
        currentMarketRate,
      })

      if (!validation.isValid) {
        finalTradeIntent = undefined
        finalResponseText =
          `${agentResponse.text}\n\n[System Notice] Proposed trade was blocked by economic policy: ${validation.reason ?? 'invalid pricing.'}`
      }
    }

    // Log the chat interaction in NpcLog table
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

    // Broadcast to the Event Bus so other NPCs "hear" this interaction
    eventBus.broadcast({
      sourceId: character.id,
      sourceName: character.name,
      actionType: finalTradeIntent ? 'TRADE_PROPOSED' : 'CHAT',
      payload: {
        message: message,
        response: finalResponseText,
        tradeIntent: finalTradeIntent,
        projectId: project?.id,
      },
      timestamp: new Date().toISOString(),
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