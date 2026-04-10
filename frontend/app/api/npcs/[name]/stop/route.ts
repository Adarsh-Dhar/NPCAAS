import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/lib/generated/prisma/client'
import { resolveProjectAndCharacter, asRecord } from '@/lib/npc-resolver'

/**
 * POST /api/npcs/[name]/stop
 * Halt autonomous background actions.
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
    const config = asRecord(character.config)
    const existingLoop = asRecord(config.autonomousLoop)

    const updatedConfig = {
      ...config,
      autonomousLoop: {
        ...existingLoop,
        active: false,
        stoppedAt: new Date().toISOString(),
      },
    }

    await prisma.character.update({
      where: { id: character.id },
      data: { config: updatedConfig as Prisma.InputJsonValue },
    })

    await (prisma as any).npcLog.create({
      data: {
        characterId: character.id,
        eventType: 'LOOP_STOP',
        details: { stoppedAt: new Date().toISOString() },
      },
    })

    return NextResponse.json({
      message: `Autonomous loop paused for NPC ${character.name}.`,
      npcId: character.id,
      npcName: character.name,
      loop: updatedConfig.autonomousLoop,
    })
  } catch (error) {
    console.error('[API] NPC stop error:', error)
    return NextResponse.json({ error: 'Failed to stop autonomous loop' }, { status: 500 })
  }
}