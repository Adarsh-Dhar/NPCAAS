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
 * POST /api/npcs/:id/stop
 * Halt autonomous background actions.
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

    const config = character.config && typeof character.config === 'object'
      ? (character.config as Record<string, unknown>)
      : {}

    const existingLoop =
      config.autonomousLoop && typeof config.autonomousLoop === 'object'
        ? (config.autonomousLoop as Record<string, unknown>)
        : {}

    const updatedConfig = {
      ...config,
      autonomousLoop: {
        ...existingLoop,
        active: false,
        stoppedAt: new Date().toISOString(),
      },
    }

    await prisma.character.update({
      where: { id },
      data: { config: updatedConfig as Prisma.InputJsonValue },
    })

    return NextResponse.json({
      message: `Autonomous loop paused for NPC ${character.name}.`,
      npcId: id,
      loop: updatedConfig.autonomousLoop,
    })
  } catch (error) {
    console.error('[API] NPC stop error:', error)
    return NextResponse.json({ error: 'Failed to stop autonomous loop' }, { status: 500 })
  }
}