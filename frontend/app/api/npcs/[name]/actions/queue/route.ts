import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveProjectAndCharacter, asRecord } from '@/lib/npc-resolver'

/**
 * GET /api/npcs/[name]/actions/queue
 * See what the NPC is planning to do next.
 * Reads from the ActionQueue DB table.
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
    const config = asRecord(character.config)
    const loop = asRecord(config.autonomousLoop)

    const rawQueue = await (prisma as any).actionQueue.findMany({
      where: { characterId: character.id, status: 'PENDING' },
      orderBy: { executeAt: 'asc' },
    })

    const queue = (rawQueue ?? []).map((a: any) => ({
      id: a.id,
      type: typeof a.actionType === 'string' ? a.actionType.toLowerCase() : a.actionType,
      description: a.payload?.description ?? null,
      payload: a.payload ?? {},
      status: typeof a.status === 'string' ? a.status.toLowerCase() : a.status,
      scheduledFor: a.executeAt ? new Date(a.executeAt).toISOString() : null,
      enqueuedAt: a.createdAt ? new Date(a.createdAt).toISOString() : null,
    }))

    return NextResponse.json({
      npcId: character.id,
      npcName: character.name,
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
 * POST /api/npcs/[name]/actions/queue
 * Enqueue a new pending action.
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
    const { type, description, payload = {}, scheduledFor } = body

    if (!type || !description) {
      return NextResponse.json(
        { error: 'type and description are required' },
        { status: 400 }
      )
    }

    const newAction = await (prisma as any).actionQueue.create({
      data: {
        characterId: character.id,
        actionType: type.toUpperCase(),
        payload: { description, ...payload },
        status: 'PENDING',
        executeAt: scheduledFor ? new Date(scheduledFor) : new Date(),
      },
    })

    const queueCount = await (prisma as any).actionQueue.count({
      where: { characterId: character.id, status: 'PENDING' },
    })

    await (prisma as any).npcLog.create({
      data: {
        characterId: character.id,
        eventType: 'ACTION_QUEUED',
        details: { actionId: newAction.id, actionType: type, description },
      },
    })

    return NextResponse.json(
      {
        message: 'Action enqueued.',
        npcId: character.id,
        npcName: character.name,
        action: {
          id: newAction.id,
          type: type.toLowerCase(),
          description,
          payload,
          status: 'pending',
          scheduledFor: newAction.executeAt ? new Date(newAction.executeAt).toISOString() : null,
          enqueuedAt: newAction.createdAt ? new Date(newAction.createdAt).toISOString() : null,
        },
        queueLength: queueCount,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[API] Actions queue enqueue error:', error)
    return NextResponse.json({ error: 'Failed to enqueue action' }, { status: 500 })
  }
}

/**
 * DELETE /api/npcs/[name]/actions/queue?actionId=xxx
 * Veto/cancel a pending action before it executes.
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
    const actionId = url.searchParams.get('actionId')

    if (!actionId) {
      return NextResponse.json({ error: 'actionId query param is required' }, { status: 400 })
    }

    const action = await (prisma as any).actionQueue.findFirst({
      where: { id: actionId, characterId: character.id },
    })

    if (!action) {
      return NextResponse.json({ error: 'Action not found in queue' }, { status: 404 })
    }

    await (prisma as any).actionQueue.delete({ where: { id: actionId } })

    const remainingCount = await (prisma as any).actionQueue.count({
      where: { characterId: character.id, status: 'PENDING' },
    })

    await (prisma as any).npcLog.create({
      data: {
        characterId: character.id,
        eventType: 'ACTION_VETOED',
        details: { actionId, actionType: action.actionType },
      },
    })

    return NextResponse.json({
      message: 'Action vetoed and removed from queue.',
      npcId: character.id,
      npcName: character.name,
      vetoedAction: {
        id: action.id,
        type: action.actionType ? String(action.actionType).toLowerCase() : null,
        description: action.payload?.description ?? null,
        payload: action.payload ?? {},
        status: action.status ? String(action.status).toLowerCase() : null,
        scheduledFor: action.executeAt ? new Date(action.executeAt).toISOString() : null,
        enqueuedAt: action.createdAt ? new Date(action.createdAt).toISOString() : null,
      },
      remainingQueueLength: remainingCount,
    })
  } catch (error) {
    console.error('[API] Action veto error:', error)
    return NextResponse.json({ error: 'Failed to veto action' }, { status: 500 })
  }
}