import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey } from '@/lib/api-key-store'
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

/**
 * POST /api/npcs/:id/start
 * Wake the NPC to run background tasks.
 *
 * Body (optional):
 * {
 *   schedule?: string   // cron expression e.g. "* /5 * * * *" (every 5 min)
 *   events?: string[]   // event names to listen for
 *   tasks?: string[]    // task descriptions to run on each tick
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

    const body = await request.json().catch(() => ({}))
    const { schedule, events = [], tasks = [] } = body

    const config = character.config && typeof character.config === 'object'
      ? (character.config as Record<string, unknown>)
      : {}

    const updatedConfig = {
      ...config,
      autonomousLoop: {
        active: true,
        startedAt: new Date().toISOString(),
        schedule: schedule ?? '*/5 * * * *',
        events,
        tasks,
      },
    }

    await prisma.character.update({
      where: { id },
      data: { config: updatedConfig as Prisma.InputJsonValue },
    })

    return NextResponse.json({
      message: `Autonomous loop started for NPC ${character.name}.`,
      npcId: id,
      loop: updatedConfig.autonomousLoop,
    })
  } catch (error) {
    console.error('[API] NPC start error:', error)
    return NextResponse.json({ error: 'Failed to start autonomous loop' }, { status: 500 })
  }
}