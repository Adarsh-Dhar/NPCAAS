import { NextRequest, NextResponse } from 'next/server'
import { kiteAgentClient } from '@/lib/kite-sdk'
import { validateApiKey } from '@/lib/api-key-store'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/lib/generated/prisma/client'

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:8080',
  'https://your-game-studio.com',
]

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
  projectId: string
  name: string
  config: unknown
  adaptation: unknown
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function toCharacterConfig(value: unknown): CharacterConfig {
  const payload = asRecord(value)
  return {
    systemPrompt: typeof payload.systemPrompt === 'string' ? payload.systemPrompt : undefined,
    openness: typeof payload.openness === 'number' ? payload.openness : undefined,
    canTrade: typeof payload.canTrade === 'boolean' ? payload.canTrade : undefined,
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
      ? {
          systemPrompt: pendingSection2.systemPrompt as string,
          openness: pendingSection2.openness as number,
        }
      : undefined,
    lastUpdatedAt:
      typeof payload.lastUpdatedAt === 'string'
        ? payload.lastUpdatedAt
        : new Date().toISOString(),
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
    const { characterId, message } = body

    if (!message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400, headers: corsHeaders })
    }

    // Base-chat fallback (no characterId)
    if (!characterId) {
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

    const character = (await prisma.character.findUnique({
      where: { id: characterId },
    })) as unknown as StoredCharacter | null

    if (!character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404, headers: corsHeaders })
    }

    if (project && character.projectId !== project.id) {
      return NextResponse.json(
        { error: 'Character not accessible with this API key' },
        { status: 403, headers: corsHeaders }
      )
    }

    const config = toCharacterConfig(character.config)
    const adaptation = toAdaptationMemory(character.adaptation)

    const section2Profile = parseSection2Definition(message)
    if (section2Profile) {
      const nextAdaptation = { ...adaptation, pendingSection2: section2Profile, lastUpdatedAt: new Date().toISOString() }
      await prisma.character.update({
        where: { id: characterId },
        data: { adaptation: nextAdaptation as unknown as Prisma.InputJsonValue },
      })
      return NextResponse.json(
        {
          success: true,
          response: 'I parsed your Section 2 cognitive layer. Reply with "Activate Section 2" to apply this profile and start progressive specialization.',
          action: 'nods slowly and processes the information',
          characterId,
          specializationActive: adaptation.specializationActive,
          pendingSpecialization: true,
          timestamp: new Date().toISOString(),
          projectId: project?.id,
        },
        { status: 200, headers: corsHeaders }
      )
    }

    if (isActivationMessage(message) && adaptation.pendingSection2) {
      const appliedProfile = adaptation.pendingSection2
      const nextConfig = { ...config, systemPrompt: appliedProfile.systemPrompt, openness: appliedProfile.openness }
      const nextAdaptation = {
        ...adaptation,
        specializationActive: true,
        pendingSection2: undefined,
        summary: buildSummary(adaptation.preferences, adaptation.turnCount, appliedProfile),
        lastUpdatedAt: new Date().toISOString(),
      }
      await prisma.character.update({
        where: { id: characterId },
        data: {
          config: nextConfig as unknown as Prisma.InputJsonValue,
          adaptation: nextAdaptation as unknown as Prisma.InputJsonValue,
        },
      })
      return NextResponse.json(
        {
          success: true,
          response: 'Section 2 activated. I will now become progressively more specific to your goals as this conversation continues.',
          action: 'stands tall with a confident nod',
          characterId,
          specializationActive: true,
          pendingSpecialization: false,
          timestamp: new Date().toISOString(),
          projectId: project?.id,
        },
        { status: 200, headers: corsHeaders }
      )
    }

    const agent = kiteAgentClient
    agent.registerTools(['get_payer_addr', 'approve_payment', 'check_inventory', 'execute_trade'])

    let updatedAdaptation = adaptation
    if (adaptation.specializationActive) {
      const preferenceUpdates = extractPreferences(message)
      const mergedPreferences = mergePreferences(adaptation.preferences, preferenceUpdates)
      const activeProfile: Section2Profile = {
        systemPrompt:
          typeof config.systemPrompt === 'string' && config.systemPrompt.trim()
            ? config.systemPrompt
            : 'You are an autonomous NPC that negotiates fairly and builds reputation.',
        openness: typeof config.openness === 'number' ? config.openness : 50,
      }
      updatedAdaptation = {
        ...adaptation,
        turnCount: adaptation.turnCount + 1,
        preferences: mergedPreferences,
        summary: buildSummary(mergedPreferences, adaptation.turnCount + 1, activeProfile),
        lastUpdatedAt: new Date().toISOString(),
      }
      await prisma.character.update({
        where: { id: characterId },
        data: { adaptation: updatedAdaptation as unknown as Prisma.InputJsonValue },
      })
    }

    const agentResponse = await agent.chat(message, {
      characterName: character.name,
      systemPrompt: typeof config.systemPrompt === 'string' ? config.systemPrompt : undefined,
      openness: typeof config.openness === 'number' ? config.openness : undefined,
      canTrade: config.canTrade,
      specializationActive: updatedAdaptation.specializationActive,
      adaptationSummary: updatedAdaptation.summary,
      preferences: updatedAdaptation.preferences,
      turnCount: updatedAdaptation.turnCount,
    })

    return NextResponse.json(
      {
        success: true,
        response: agentResponse.text,
        action: agentResponse.action ?? null,   // <-- NEW: physical action field
        characterId,
        tradeIntent: agentResponse.tradeIntent,
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