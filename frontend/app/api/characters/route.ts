import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { kiteAAProvider } from '@/lib/aa-sdk'
import { validateApiKey } from '@/lib/api-key-store'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/lib/generated/prisma/client'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return asRecord(value) as Prisma.InputJsonValue
}

function normalizeAdaptation(config: unknown, existing: unknown = {}) {
  const safeConfig = asRecord(config)
  const safeExisting = asRecord(existing)

  return {
    specializationActive: Boolean(safeExisting.specializationActive),
    turnCount: typeof safeExisting.turnCount === 'number' ? safeExisting.turnCount : 0,
    preferences: Array.isArray(safeExisting.preferences) ? safeExisting.preferences : [],
    summary:
      typeof safeExisting.summary === 'string' && safeExisting.summary.trim()
        ? safeExisting.summary
        : 'No adaptation history yet.',
    lastUpdatedAt: new Date().toISOString(),
    pendingSection2: safeExisting.pendingSection2,
    configSnapshot: {
      systemPrompt: typeof safeConfig.systemPrompt === 'string' ? safeConfig.systemPrompt : '',
      openness: typeof safeConfig.openness === 'number' ? safeConfig.openness : 50,
    },
  }
}

function toApiCharacter(character: {
  id: string
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
  projects: Array<{ id: string }>
}) {
  return {
    id: character.id,
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
    projectIds: character.projects.map((project) => project.id),
    createdAt: character.createdAt.toISOString(),
  }
}

function isProjectsRelationRuntimeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes('unknown argument `projects`') ||
    message.includes('unknown field `projects`') ||
    message.includes('_charactertoproject') ||
    (message.includes('table') && message.includes('does not exist'))
  )
}

function shouldFallbackToLegacyCreate(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return isProjectsRelationRuntimeError(error)
}

const createCharacterSchema = z
  .object({
    name: z.string().trim().min(1),
    config: z.record(z.string(), z.unknown()),
    gameIds: z.array(z.string().trim().min(1)).optional(),
    projectId: z.string().trim().min(1).optional(),
  })
  .strict()

const updateCharacterSchema = z
  .object({
    characterId: z.string().trim().min(1),
    name: z.string().trim().min(1).optional(),
    config: z.record(z.string(), z.unknown()),
  })
  .strict()

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

  if (!project) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }

  return project
}

export async function POST(request: NextRequest) {
  try {
    const parsed = createCharacterSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid payload' },
        { status: 400 }
      )
    }

    const { name, config, gameIds, projectId } = parsed.data
    const candidateGameIds = Array.from(new Set([...(gameIds ?? []), ...(projectId ? [projectId] : [])]))

    const games = candidateGameIds.length
      ? await prisma.project.findMany({
          where: { id: { in: candidateGameIds } },
          select: { id: true },
        })
      : []

    if (games.length !== candidateGameIds.length) {
      const foundIds = new Set(games.map((game) => game.id))
      const missingIds = candidateGameIds.filter((id) => !foundIds.has(id))
      return NextResponse.json(
        { error: `Game(s) not found: ${missingIds.join(', ')}` },
        { status: 404 }
      )
    }

    const ownerId = `character:${name}:${Date.now()}`
    const smartAccount = await kiteAAProvider.createSmartAccount({
      ownerId,
      metadata: {
        npcName: name,
        gameIds: candidateGameIds,
      },
    })

    const characterData = {
      name,
      walletAddress: smartAccount.address,
      aaChainId: smartAccount.chainId,
      aaProvider: smartAccount.provider,
      smartAccountId: smartAccount.smartAccountId,
      smartAccountStatus: 'created',
      config: toInputJson(config),
      adaptation: {
        specializationActive: false,
        turnCount: 0,
        preferences: [],
        summary: 'No adaptation history yet.',
        lastUpdatedAt: new Date().toISOString(),
      },
      isDeployedOnChain: true,
      projects: games.length
        ? {
            connect: games.map((game) => ({ id: game.id })),
          }
        : undefined,
    }

    let character:
      | {
          id: string
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
          projects: Array<{ id: string }>
        }
      | null = null

    try {
      character = await prisma.character.create({
        data: characterData,
        include: {
          projects: { select: { id: true } },
        },
      })
    } catch (createError) {
      if (!shouldFallbackToLegacyCreate(createError)) {
        throw createError
      }

      const fallbackProjectId =
        games[0]?.id ??
        (
          await prisma.project.findFirst({
            select: { id: true },
            orderBy: { createdAt: 'asc' },
          })
        )?.id

      if (!fallbackProjectId) {
        return NextResponse.json(
          { error: 'No games available. Create a game before deploying a character.' },
          { status: 409 }
        )
      }

      const legacyPrisma = prisma as unknown as {
        character: {
          create: (args: {
            data: {
              name: string
              walletAddress: string
              aaChainId: number
              aaProvider: string
              smartAccountId: string | null
              smartAccountStatus: string
              config: Prisma.InputJsonValue
              adaptation: Prisma.InputJsonValue
              isDeployedOnChain: boolean
              projectId: string
            }
          }) => Promise<{
            id: string
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
            projectId: string
          }>
        }
      }

      const legacyCharacter = await legacyPrisma.character.create({
        data: {
          name,
          walletAddress: smartAccount.address,
          aaChainId: smartAccount.chainId,
          aaProvider: smartAccount.provider,
          smartAccountId: smartAccount.smartAccountId,
          smartAccountStatus: 'created',
          config: toInputJson(config),
          adaptation: {
            specializationActive: false,
            turnCount: 0,
            preferences: [],
            summary: 'No adaptation history yet.',
            lastUpdatedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
          isDeployedOnChain: true,
          projectId: fallbackProjectId,
        },
      })

      character = {
        ...legacyCharacter,
        projects: legacyCharacter.projectId ? [{ id: legacyCharacter.projectId }] : [],
      }
    }

    return NextResponse.json(
      {
        message: `Deployed ${name} to Kite Chain with wallet ${smartAccount.address.slice(0, 6)}...`,
        character: toApiCharacter(character),
        walletAddress: smartAccount.address,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[API] Character deployment error:', error)
    const message =
      error instanceof Error && error.message.trim() ? error.message : 'Failed to deploy character'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authorizedProject = await resolveAuthorizedProject(request)
    if (authorizedProject instanceof NextResponse) {
      return authorizedProject
    }

    const parsed = updateCharacterSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid payload' },
        { status: 400 }
      )
    }

    const { characterId, name, config } = parsed.data

    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { projects: { select: { id: true } } },
    })

    if (!character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }

    if (
      authorizedProject &&
      !character.projects.some((project) => project.id === authorizedProject.id)
    ) {
      return NextResponse.json(
        { error: 'Character not accessible with this API key' },
        { status: 403 }
      )
    }

    // Build update data — only patch fields that have meaningful content
    const hasConfigFields = Object.keys(config).length > 0

    const updateData: Prisma.CharacterUpdateInput = {}

    if (name) {
      updateData.name = name
    }

    if (hasConfigFields) {
      updateData.config = toInputJson(config)
      updateData.adaptation = normalizeAdaptation(config, character.adaptation) as Prisma.InputJsonValue
    }

    const updated = await prisma.character.update({
      where: { id: characterId },
      data: updateData,
      include: { projects: { select: { id: true } } },
    })

    return NextResponse.json({
      message: `Updated ${updated.name} configuration`,
      character: toApiCharacter(updated),
    })
  } catch (error) {
    console.error('[API] Character update error:', error)
    return NextResponse.json({ error: 'Failed to update character' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const authorizedProject = await resolveAuthorizedProject(request)
    if (authorizedProject instanceof NextResponse) {
      return authorizedProject
    }

    try {
      const characters = await prisma.character.findMany({
        where: authorizedProject
          ? {
              projects: {
                some: { id: authorizedProject.id },
              },
            }
          : undefined,
        include: { projects: { select: { id: true } } },
        orderBy: { createdAt: 'desc' },
      })

      return NextResponse.json(characters.map((character) => toApiCharacter(character)))
    } catch (relationError) {
      if (!isProjectsRelationRuntimeError(relationError)) {
        throw relationError
      }

      const legacyPrisma = prisma as unknown as {
        character: {
          findMany: (args: {
            where?: { projectId?: string }
            orderBy: { createdAt: 'desc' }
          }) => Promise<
            Array<{
              id: string
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
              projectId: string
            }>
          >
        }
      }

      const legacyCharacters = await legacyPrisma.character.findMany({
        where: authorizedProject ? { projectId: authorizedProject.id } : undefined,
        orderBy: { createdAt: 'desc' },
      })

      return NextResponse.json(
        legacyCharacters.map((character) =>
          toApiCharacter({
            ...character,
            projects: character.projectId ? [{ id: character.projectId }] : [],
          })
        )
      )
    }
  } catch (error) {
    console.error('[API] Character fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch characters' }, { status: 500 })
  }
}