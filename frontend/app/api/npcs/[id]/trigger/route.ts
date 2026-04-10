import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey } from '@/lib/api-key-store'
import { kiteAgentClient } from '@/lib/kite-sdk'
import type { Prisma } from '@/lib/generated/prisma/client'

async function resolveAuthorizedProject(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader) return null
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Missing or malformed Authorization header. Use: Bearer gc_live_...' },
      { status: 401 }
    )
  }
  const apiKey = authHeader.replace('Bearer ', '').trim()
  const project = await validateApiKey(apiKey)
  if (!project) return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  return project
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

/**
 * POST /api/npcs/:id/trigger
 * Inject an external event and get the NPC's reaction via the LLM.
 *
 * Body:
 * {
 *   event: string         // e.g. "market_crash"
 *   asset?: string        // e.g. "ETH"
 *   data?: object         // additional event payload
 *   recordInMemory?: boolean  // default: true
 * }
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const authorizedProject = await resolveAuthorizedProject(request)
    if (authorizedProject instanceof NextResponse) return authorizedProject

    const character = await (prisma.character as any).findUnique({
      where: { id },
      include: { projects: { select: { id: true } } },
    })

    if (!character) {
      return NextResponse.json({ error: 'NPC not found' }, { status: 404 })
    }

    if (
      authorizedProject &&
      !character.projects.some((p: { id: string }) => p.id === authorizedProject.id)
    ) {
      return NextResponse.json(
        { error: 'NPC not accessible with this API key' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { event, asset, data = {}, recordInMemory = true } = body

    if (!event || typeof event !== 'string') {
      return NextResponse.json({ error: 'event (string) is required' }, { status: 400 })
    }

    const config = asRecord(character.config)
    const adaptation = asRecord(character.adaptation)

    // Build a synthetic message for the LLM based on the event
    const eventDescription = asset
      ? `[AUTONOMOUS EVENT]: ${event} affecting ${asset}. Data: ${JSON.stringify(data)}`
      : `[AUTONOMOUS EVENT]: ${event}. Data: ${JSON.stringify(data)}`

    kiteAgentClient.registerTools([])
    const agentResponse = await kiteAgentClient.chat(eventDescription, {
      characterName: character.name,
      systemPrompt:
        typeof config.systemPrompt === 'string' && config.systemPrompt.trim()
          ? config.systemPrompt
          : undefined,
      openness: typeof config.openness === 'number' ? config.openness : undefined,
      canTrade: config.canTrade !== false,
      specializationActive: Boolean(adaptation.specializationActive),
      adaptationSummary: typeof adaptation.summary === 'string' ? adaptation.summary : undefined,
    })

    // Optionally record this trigger event in NPC memory
    if (recordInMemory) {
      const existingPrefs = Array.isArray(adaptation.preferences)
        ? (adaptation.preferences as string[])
        : []
      const eventNote = `Event: ${event}${asset ? ` (${asset})` : ''} at ${new Date().toISOString()}`
      const updatedAdaptation = {
        ...adaptation,
        preferences: [eventNote, ...existingPrefs].slice(0, 20),
        lastUpdatedAt: new Date().toISOString(),
      }
      await prisma.character.update({
        where: { id },
        data: { adaptation: updatedAdaptation as Prisma.InputJsonValue },
      })
    }

    return NextResponse.json({
      npcId: id,
      event,
      asset,
      reaction: {
        text: agentResponse.text,
        action: agentResponse.action ?? null,
      },
      recordedInMemory: recordInMemory,
      triggeredAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[API] NPC trigger error:', error)
    return NextResponse.json({ error: 'Failed to trigger NPC event' }, { status: 500 })
  }
}