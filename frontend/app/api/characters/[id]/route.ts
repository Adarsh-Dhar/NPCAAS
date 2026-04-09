import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey } from '@/lib/api-key-store'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function toApiCharacter(character: {
  id: string
  projectId: string
  name: string
  walletAddress: string
  aaChainId: number
  aaProvider: string
  smartAccountId: string | null
  smartAccountStatus: string
  config: unknown
  adaptation: unknown
  isDeployedOnChain: boolean
  deploymentTxHash: string | null
  createdAt: Date
}) {
  return {
    id: character.id,
    projectId: character.projectId,
    name: character.name,
    walletAddress: character.walletAddress,
    aaChainId: character.aaChainId,
    aaProvider: character.aaProvider,
    smartAccountId: character.smartAccountId ?? undefined,
    smartAccountStatus: character.smartAccountStatus,
    config: asRecord(character.config),
    adaptation: asRecord(character.adaptation),
    isDeployedOnChain: character.isDeployedOnChain,
    deploymentTxHash: character.deploymentTxHash ?? undefined,
    createdAt: character.createdAt.toISOString(),
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    if (!id) {
      return NextResponse.json({ error: 'Character id is required' }, { status: 400 })
    }

    const authHeader = request.headers.get('Authorization')
    if (authHeader) {
      if (!authHeader.startsWith('Bearer ')) {
        return NextResponse.json(
          { error: 'Missing or malformed Authorization header. Use: Bearer gc_live_...' },
          { status: 401 }
        )
      }

      const apiKey = authHeader.replace('Bearer ', '').trim()
      const project = await validateApiKey(apiKey)
      if (!project) {
        return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
      }

      const character = await prisma.character.findUnique({
        where: { id },
        include: { project: true },
      })

      if (!character) {
        return NextResponse.json({ error: 'Character not found' }, { status: 404 })
      }

      if (character.projectId !== project.id) {
        return NextResponse.json(
          { error: 'Character not accessible for this project' },
          { status: 403 }
        )
      }

      return NextResponse.json({
        character: toApiCharacter(character),
        project: {
          id: character.project.id,
          name: character.project.name,
          apiKey: character.project.apiKey,
          createdAt: character.project.createdAt.toISOString(),
        },
      })
    }

    const character = await prisma.character.findUnique({
      where: { id },
      include: { project: true },
    })

    if (!character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }

    return NextResponse.json({
      character: toApiCharacter(character),
      project: {
        id: character.project.id,
        name: character.project.name,
        apiKey: character.project.apiKey,
        createdAt: character.project.createdAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('[API] Character fetch-by-id error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch character' },
      { status: 500 }
    )
  }
}