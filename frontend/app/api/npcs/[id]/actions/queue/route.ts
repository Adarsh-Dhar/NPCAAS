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

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

async function loadCharacterWithAuth(id: string, authorizedProject: { id: string } | null) {
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
      error: NextResponse.json({ error: 'NPC not accessible with this API key' }, { status: 403 }),
    }
  }
  return { character }
}

/**
 * GET /api/npcs/:id/actions/queue
 * See what the NPC is planning to do next.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const authorizedProject = await resolveAuthorizedProject(request)
    if (authorizedProject instanceof NextResponse) return authorizedProject

    const result = await loadCharacterWithAuth(id, authorizedProject)
    if (result.error) return result.error

    const { character } = result
    const config = asRecord(character.config)
    const loop = asRecord(config.autonomousLoop)
    const queue = Array.isArray(config.actionQueue) ? config.actionQueue : []

    return NextResponse.json({
      npcId: id,
      loopActive: Boolean(loop.active),
      schedule: loop.schedule ?? null,
      queue,
      queueLength: queue.length,
    })
  } catch (error) {
    console.error('[API] Actions queue fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch action queue' }, { status: 500 })
  }
}

/**
 * POST /api/npcs/:id/actions/queue
 * Enqueue a new pending action.
 *
 * Body:
 * {
 *   type: string        // e.g. "swap", "transfer", "chat"
 *   description: string
 *   payload?: object
 *   scheduledFor?: string  // ISO datetime
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

    const result = await loadCharacterWithAuth(id, authorizedProject)
    if (result.error) return result.error

    const { character } = result
    const body = await request.json()
    const { type, description, payload = {}, scheduledFor } = body

    if (!type || !description) {
      return NextResponse.json(
        { error: 'type and description are required' },
        { status: 400 }
      )
    }

    const config = asRecord(character.config)
    const existingQueue = Array.isArray(config.actionQueue) ? config.actionQueue : []

    const newAction = {
      id: `action_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      description,
      payload,
      status: 'pending',
      scheduledFor: scheduledFor ?? null,
      enqueuedAt: new Date().toISOString(),
    }

    const updatedConfig = {
      ...config,
      actionQueue: [...existingQueue, newAction],
    }

    await prisma.character.update({
      where: { id },
      data: { config: updatedConfig as Prisma.InputJsonValue },
    })

    return NextResponse.json(
      {
        message: 'Action enqueued.',
        npcId: id,
        action: newAction,
        queueLength: updatedConfig.actionQueue.length,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[API] Actions queue enqueue error:', error)
    return NextResponse.json({ error: 'Failed to enqueue action' }, { status: 500 })
  }
}

/**
 * DELETE /api/npcs/:id/actions/queue/:actionId
 * Veto/cancel a pending action before it executes.
 *
 * Note: Next.js dynamic routes handle the actionId segment.
 * This handler uses a query param fallback: ?actionId=xxx
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const authorizedProject = await resolveAuthorizedProject(request)
    if (authorizedProject instanceof NextResponse) return authorizedProject

    const url = new URL(request.url)
    const actionId = url.searchParams.get('actionId')

    if (!actionId) {
      return NextResponse.json({ error: 'actionId query param is required' }, { status: 400 })
    }

    const result = await loadCharacterWithAuth(id, authorizedProject)
    if (result.error) return result.error

    const { character } = result
    const config = asRecord(character.config)
    const existingQueue = Array.isArray(config.actionQueue) ? config.actionQueue : []

    const actionIndex = existingQueue.findIndex(
      (a: unknown) => asRecord(a).id === actionId
    )

    if (actionIndex === -1) {
      return NextResponse.json({ error: 'Action not found in queue' }, { status: 404 })
    }

    const vetoedAction = existingQueue[actionIndex]
    const updatedQueue = existingQueue.filter((_: unknown, i: number) => i !== actionIndex)

    const updatedConfig = { ...config, actionQueue: updatedQueue }

    await prisma.character.update({
      where: { id },
      data: { config: updatedConfig as Prisma.InputJsonValue },
    })

    return NextResponse.json({
      message: 'Action vetoed and removed from queue.',
      npcId: id,
      vetoedAction,
      remainingQueueLength: updatedQueue.length,
    })
  } catch (error) {
    console.error('[API] Action veto error:', error)
    return NextResponse.json({ error: 'Failed to veto action' }, { status: 500 })
  }
}