import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/lib/generated/prisma/client'
import { resolveProjectAndCharacter } from '@/lib/npc-resolver'

/**
 * POST /api/npcs/[name]/loop
 * Start the NPC autonomous loop for the specified NPC name within the
 * authorised project.
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
      where: { id: character.id },
      data: { config: updatedConfig as Prisma.InputJsonValue },
    })

    return NextResponse.json({
      message: `Autonomous loop started for NPC ${character.name}.`,
      npcId: character.id,
      npcName: character.name,
      loop: updatedConfig.autonomousLoop,
    })
  } catch (error) {
    console.error('[API] NPC start error:', error)
    return NextResponse.json({ error: 'Failed to start autonomous loop' }, { status: 500 })
  }
}
