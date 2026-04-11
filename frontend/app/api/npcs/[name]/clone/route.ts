import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/lib/generated/prisma/client'
import { kiteAAProvider } from '@/lib/aa-sdk'
import { resolveProjectAndCharacter } from '@/lib/npc-resolver'

/**
 * POST /api/npcs/[name]/clone
 * Fork an NPC — copies persona and memory, provisions a fresh wallet.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await context.params
    const result = await resolveProjectAndCharacter(request, name)
    if (result instanceof NextResponse) return result

    const { character, project } = result
    const body = await request.json().catch(() => ({}))

    const cloneName: string =
      typeof body.name === 'string' && body.name.trim()
        ? body.name.trim().toUpperCase().replace(/\s+/g, '_')
        : `${character.name}_CLONE_${Date.now()}`

    // Enforce name uniqueness within the project
    const existingClone = await (prisma.character as any).findFirst({
      where: {
        name: cloneName,
        projects: { some: { id: project.id } },
      },
    })
    if (existingClone) {
      return NextResponse.json(
        { error: `An NPC named '${cloneName}' already exists in this project. Choose a different name.` },
        { status: 409 }
      )
    }

    const cloneId = crypto.randomUUID()
    const ownerId = `character:${cloneId}`
    const smartAccount = await kiteAAProvider.createSmartAccount({
      ownerId,
      metadata: { npcName: cloneName, clonedFrom: character.id },
    })

    const clone = await prisma.character.create({
      data: {
        id: cloneId,
        name: cloneName,
        walletAddress: smartAccount.address,
        aaChainId: smartAccount.chainId,
        aaProvider: smartAccount.provider,
        smartAccountId: smartAccount.smartAccountId,
        smartAccountStatus: 'created',
        config: character.config as Prisma.InputJsonValue,
        adaptation: {
          specializationActive: false,
          turnCount: 0,
          preferences: [],
          summary: `Cloned from ${character.name}. No adaptation history yet.`,
          lastUpdatedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
        isDeployedOnChain: true,
        projects: { connect: character.projects.map((p) => ({ id: p.id })) },
      },
      include: { projects: { select: { id: true } } },
    })

    await (prisma as any).npcLog.create({
      data: {
        characterId: character.id,
        eventType: 'CLONE_CREATED',
        details: { cloneId: clone.id, cloneName },
      },
    })

    return NextResponse.json(
      {
        message: `Cloned ${character.name} → ${cloneName} with fresh wallet.`,
        clone: {
          id: clone.id,
          name: clone.name,
          walletAddress: clone.walletAddress,
          clonedFrom: character.id,
          clonedFromName: character.name,
          projectIds: clone.projects.map((p) => p.id),
          createdAt: clone.createdAt.toISOString(),
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[API] NPC clone error:', error)
    return NextResponse.json({ error: 'Failed to clone NPC' }, { status: 500 })
  }
}