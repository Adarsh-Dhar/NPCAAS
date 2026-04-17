import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  evaluateComputeBudget,
  parseComputeLimit,
  parseComputeUsage,
  serializeBudget,
} from '@/lib/compute-budget'
import { resolveProjectAndCharacter } from '@/lib/npc-resolver'

/**
 * POST /api/npcs/[name]/refill
 * Reset an NPC's consumed compute usage so chat can continue.
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
    const now = new Date()

    const updated = await prisma.character.update({
      where: { id: character.id },
      data: {
        computeUsageTokens: BigInt(0),
        lastComputeResetAt: now,
      },
      select: {
        id: true,
        name: true,
        computeUsageTokens: true,
        computeLimitTokens: true,
        lastComputeResetAt: true,
      },
    })

    const compute = serializeBudget(
      evaluateComputeBudget({
        usageTokens: parseComputeUsage(updated.computeUsageTokens),
        limitTokens: parseComputeLimit(updated.computeLimitTokens),
        lastResetAt: updated.lastComputeResetAt,
      })
    )

    await (prisma as any).npcLog.create({
      data: {
        characterId: updated.id,
        eventType: 'COMPUTE_REFILLED',
        details: {
          resetAt: now.toISOString(),
          compute,
        },
      },
    })

    return NextResponse.json({
      success: true,
      message: `Compute budget for ${updated.name} has been restored.`,
      npcId: updated.id,
      npcName: updated.name,
      compute,
    })
  } catch (error) {
    console.error('[API] NPC refill error:', error)
    return NextResponse.json({ error: 'Failed to refill compute budget' }, { status: 500 })
  }
}
