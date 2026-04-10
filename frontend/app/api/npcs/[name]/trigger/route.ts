import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/lib/generated/prisma/client'
import { kiteAgentClient } from '@/lib/kite-sdk'
import { resolveProjectAndCharacter, asRecord } from '@/lib/npc-resolver'

/**
 * POST /api/npcs/[name]/trigger
 * Inject an external event and get the NPC's reaction via the LLM.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await context.params
    const result = await resolveProjectAndCharacter(request, name)
    if (result instanceof NextResponse) return result

    const { character } = result
    const body = await request.json()
    const { event, asset, data = {}, recordInMemory = true } = body

    if (!event || typeof event !== 'string') {
      return NextResponse.json({ error: 'event (string) is required' }, { status: 400 })
    }

    const config = asRecord(character.config)
    const adaptation = asRecord(character.adaptation)

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

    // Log the trigger
    await (prisma as any).npcLog.create({
      data: {
        characterId: character.id,
        eventType: 'TRIGGER',
        details: {
          event,
          asset: asset ?? null,
          data,
          reaction: agentResponse.text,
          action: agentResponse.action ?? null,
        },
      },
    })

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
        where: { id: character.id },
        data: { adaptation: updatedAdaptation as Prisma.InputJsonValue },
      })
    }

    return NextResponse.json({
      npcId: character.id,
      npcName: character.name,
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