import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/lib/generated/prisma/client'
import { resolveProjectAndCharacter, asRecord } from '@/lib/npc-resolver'

/**
 * GET /api/npcs/[name]/memory
 * Query what the NPC currently "remembers".
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await context.params
    const result = await resolveProjectAndCharacter(request, name)
    if (result instanceof NextResponse) return result

    const { character } = result
    const adaptation = asRecord(character.adaptation)
    const config = asRecord(character.config)

    const url = new URL(request.url)
    const topic = url.searchParams.get('topic')?.toLowerCase()

    const memory: Record<string, unknown> = {
      summary: adaptation.summary ?? 'No adaptation history yet.',
      preferences: adaptation.preferences ?? [],
      turnCount: adaptation.turnCount ?? 0,
      specializationActive: adaptation.specializationActive ?? false,
      lastUpdatedAt: adaptation.lastUpdatedAt,
    }

    if (topic) {
      const prefs = (adaptation.preferences as string[]) ?? []
      memory.topicRelevance = prefs.filter((p) => p.toLowerCase().includes(topic))
    }

    return NextResponse.json({
      npcId: character.id,
      npcName: character.name,
      memory,
      configSnapshot: {
        systemPrompt: config.systemPrompt,
        openness: config.openness,
      },
    })
  } catch (error) {
    console.error('[API] Memory fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch memory' }, { status: 500 })
  }
}

/**
 * POST /api/npcs/[name]/memory
 * Inject facts, rules, or backstory into the NPC's memory.
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
    const { facts, rules, backstory, preferences: incomingPrefs } = body

    if (!facts && !rules && !backstory && !incomingPrefs) {
      return NextResponse.json(
        { error: 'Provide at least one of: facts, rules, backstory, preferences' },
        { status: 400 }
      )
    }

    const adaptation = asRecord(character.adaptation)
    const existingPrefs = Array.isArray(adaptation.preferences)
      ? (adaptation.preferences as string[])
      : []

    const injectedItems: string[] = []
    if (facts) injectedItems.push(...(Array.isArray(facts) ? facts : [facts]))
    if (rules) injectedItems.push(...(Array.isArray(rules) ? rules : [rules]))
    if (backstory) injectedItems.push(...(Array.isArray(backstory) ? backstory : [backstory]))
    if (incomingPrefs) injectedItems.push(...(Array.isArray(incomingPrefs) ? incomingPrefs : [incomingPrefs]))

    const mergedPrefs = Array.from(new Set([...injectedItems, ...existingPrefs])).slice(0, 20)
    const existingSummary = typeof adaptation.summary === 'string' ? adaptation.summary : ''
    const injectionNote = `[Injected ${new Date().toISOString()}]: ${injectedItems.slice(0, 3).join('; ')}`
    const newSummary =
      existingSummary === 'No adaptation history yet.' ? injectionNote : `${existingSummary} | ${injectionNote}`

    const updatedAdaptation = {
      ...adaptation,
      preferences: mergedPrefs,
      summary: newSummary,
      lastUpdatedAt: new Date().toISOString(),
    }

    await prisma.character.update({
      where: { id: character.id },
      data: { adaptation: updatedAdaptation as Prisma.InputJsonValue },
      select: { id: true },
    })

    // Log the memory injection
    await (prisma as any).npcLog.create({
      data: {
        characterId: character.id,
        eventType: 'MEMORY_INJECT',
        details: { injectedCount: injectedItems.length, items: injectedItems.slice(0, 5) },
      },
      select: { id: true },
    })

    return NextResponse.json({
      message: 'Memory injected successfully.',
      npcId: character.id,
      npcName: character.name,
      injectedCount: injectedItems.length,
      totalPreferences: mergedPrefs.length,
    })
  } catch (error) {
    console.error('[API] Memory inject error:', error)
    return NextResponse.json({ error: 'Failed to inject memory' }, { status: 500 })
  }
}

/**
 * DELETE /api/npcs/[name]/memory
 * Clear short-term or long-term context.
 * Query param: ?scope=short|long|all (default: short)
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await context.params
    const result = await resolveProjectAndCharacter(request, name)
    if (result instanceof NextResponse) return result

    const { character } = result
    const url = new URL(request.url)
    const scope = url.searchParams.get('scope') ?? 'short'

    const adaptation = asRecord(character.adaptation)
    let updatedAdaptation: Record<string, unknown>

    if (scope === 'all') {
      updatedAdaptation = {
        specializationActive: false,
        turnCount: 0,
        preferences: [],
        summary: 'Memory cleared.',
        lastUpdatedAt: new Date().toISOString(),
      }
    } else if (scope === 'long') {
      updatedAdaptation = {
        ...adaptation,
        preferences: [],
        summary: 'Long-term memory cleared.',
        lastUpdatedAt: new Date().toISOString(),
      }
    } else {
      updatedAdaptation = {
        ...adaptation,
        turnCount: 0,
        lastUpdatedAt: new Date().toISOString(),
      }
    }

    await prisma.character.update({
      where: { id: character.id },
      data: { adaptation: updatedAdaptation as Prisma.InputJsonValue },
      select: { id: true },
    })

    return NextResponse.json({
      message: `Memory cleared (scope: ${scope}).`,
      npcId: character.id,
      npcName: character.name,
      scope,
    })
  } catch (error) {
    console.error('[API] Memory clear error:', error)
    return NextResponse.json({ error: 'Failed to clear memory' }, { status: 500 })
  }
}