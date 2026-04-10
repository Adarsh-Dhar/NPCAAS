import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey } from '@/lib/api-key-store'
import type { Prisma } from '@/lib/generated/prisma/client'

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

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

async function loadCharacter(id: string, authorizedProject: { id: string } | null) {
  const character = await (prisma.character as any).findUnique({
    where: { id },
    include: { projects: { select: { id: true } } },
  })
  if (!character) return { error: NextResponse.json({ error: 'NPC not found' }, { status: 404 }) }
  if (
    authorizedProject &&
    !character.projects.some((p: { id: string }) => p.id === authorizedProject.id)
  ) {
    return {
      error: NextResponse.json(
        { error: 'NPC not accessible with this API key' },
        { status: 403 }
      ),
    }
  }
  return { character }
}

/**
 * GET /api/npcs/:id/memory
 * Query what the NPC currently "remembers".
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const authorizedProject = await resolveAuthorizedProject(request)
    if (authorizedProject instanceof NextResponse) return authorizedProject

    const result = await loadCharacter(id, authorizedProject)
    if (result.error) return result.error

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
      memory.topicRelevance = prefs.filter((p) =>
        p.toLowerCase().includes(topic)
      )
    }

    return NextResponse.json({
      npcId: id,
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
 * POST /api/npcs/:id/memory
 * Inject facts, rules, or backstory into the NPC's memory.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const authorizedProject = await resolveAuthorizedProject(request)
    if (authorizedProject instanceof NextResponse) return authorizedProject

    const result = await loadCharacter(id, authorizedProject)
    if (result.error) return result.error

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
    if (backstory)
      injectedItems.push(...(Array.isArray(backstory) ? backstory : [backstory]))
    if (incomingPrefs)
      injectedItems.push(
        ...(Array.isArray(incomingPrefs) ? incomingPrefs : [incomingPrefs])
      )

    const mergedPrefs = Array.from(
      new Set([...injectedItems, ...existingPrefs])
    ).slice(0, 20)

    const existingSummary =
      typeof adaptation.summary === 'string' ? adaptation.summary : ''
    const injectionNote = `[Injected ${new Date().toISOString()}]: ${injectedItems.slice(0, 3).join('; ')}`
    const newSummary =
      existingSummary === 'No adaptation history yet.'
        ? injectionNote
        : `${existingSummary} | ${injectionNote}`

    const updatedAdaptation = {
      ...adaptation,
      preferences: mergedPrefs,
      summary: newSummary,
      lastUpdatedAt: new Date().toISOString(),
    }

    await prisma.character.update({
      where: { id },
      data: { adaptation: updatedAdaptation as Prisma.InputJsonValue },
    })

    return NextResponse.json({
      message: 'Memory injected successfully.',
      npcId: id,
      injectedCount: injectedItems.length,
      totalPreferences: mergedPrefs.length,
    })
  } catch (error) {
    console.error('[API] Memory inject error:', error)
    return NextResponse.json({ error: 'Failed to inject memory' }, { status: 500 })
  }
}

/**
 * DELETE /api/npcs/:id/memory
 * Clear short-term or long-term context.
 * Query param: ?scope=short|long|all  (default: short)
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const authorizedProject = await resolveAuthorizedProject(request)
    if (authorizedProject instanceof NextResponse) return authorizedProject

    const result = await loadCharacter(id, authorizedProject)
    if (result.error) return result.error

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
      // short: reset turn-level context only
      updatedAdaptation = {
        ...adaptation,
        turnCount: 0,
        lastUpdatedAt: new Date().toISOString(),
      }
    }

    await prisma.character.update({
      where: { id },
      data: { adaptation: updatedAdaptation as Prisma.InputJsonValue },
    })

    return NextResponse.json({
      message: `Memory cleared (scope: ${scope}).`,
      npcId: id,
      scope,
    })
  } catch (error) {
    console.error('[API] Memory clear error:', error)
    return NextResponse.json({ error: 'Failed to clear memory' }, { status: 500 })
  }
}