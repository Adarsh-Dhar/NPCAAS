import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey } from '@/lib/api-key-store'
import { kiteAAProvider } from '@/lib/aa-sdk'
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

/**
 * POST /api/npcs/:id/clone
 * Fork an NPC — copies persona and memory, but provisions a fresh wallet.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const authorizedProject = await resolveAuthorizedProject(request)
    if (authorizedProject instanceof NextResponse) return authorizedProject

    const source = await (prisma.character as any).findUnique({
      where: { id },
      include: { projects: { select: { id: true } } },
    })

    if (!source) {
      return NextResponse.json({ error: 'NPC not found' }, { status: 404 })
    }

    if (
      authorizedProject &&
      !source.projects.some((p: { id: string }) => p.id === authorizedProject.id)
    ) {
      return NextResponse.json(
        { error: 'NPC not accessible with this API key' },
        { status: 403 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const cloneName: string =
      typeof body.name === 'string' && body.name.trim()
        ? body.name.trim().toUpperCase().replace(/\s+/g, '_')
        : `${source.name}_CLONE_${Date.now()}`

    const ownerId = `character:${cloneName}:${Date.now()}`
    const smartAccount = await kiteAAProvider.createSmartAccount({
      ownerId,
      metadata: { npcName: cloneName, clonedFrom: id },
    })

    const cloneAdaptation = {
      specializationActive: false,
      turnCount: 0,
      preferences: [],
      summary: `Cloned from ${source.name}. No adaptation history yet.`,
      lastUpdatedAt: new Date().toISOString(),
    }

    const clone = await prisma.character.create({
      data: {
        name: cloneName,
        walletAddress: smartAccount.address,
        aaChainId: smartAccount.chainId,
        aaProvider: smartAccount.provider,
        smartAccountId: smartAccount.smartAccountId,
        smartAccountStatus: 'created',
        config: source.config as Prisma.InputJsonValue,
        adaptation: cloneAdaptation as Prisma.InputJsonValue,
        isDeployedOnChain: true,
        projects: source.projects.length
          ? { connect: source.projects.map((p: { id: string }) => ({ id: p.id })) }
          : undefined,
      },
      include: { projects: { select: { id: true } } },
    })

    return NextResponse.json(
      {
        message: `Cloned ${source.name} → ${cloneName} with fresh wallet.`,
        clone: {
          id: clone.id,
          name: clone.name,
          walletAddress: clone.walletAddress,
          clonedFrom: id,
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