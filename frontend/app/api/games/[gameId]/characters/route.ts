import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { validateApiKey } from '@/lib/api-key-store'
import { prisma } from '@/lib/prisma'
import { kiteAAProvider } from '@/lib/aa-sdk'

const assignmentSchema = z
  .object({
    characterId: z.string().trim().min(1).optional(),
    characterIds: z.array(z.string().trim().min(1)).optional(),
  })
  .strict()

function uniqueIds(values: string[]) {
  return Array.from(new Set(values))
}

async function resolveAuthorizedProject(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader) {
    return null
  }

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

async function resolveGame(params: Promise<{ gameId: string }>) {
  const { gameId } = await params
  if (!gameId) {
    return { error: NextResponse.json({ error: 'gameId is required' }, { status: 400 }) }
  }

  const game = await prisma.project.findUnique({
    where: { id: gameId },
    select: { id: true, name: true },
  })

  if (!game) {
    return { error: NextResponse.json({ error: 'Game not found' }, { status: 404 }) }
  }

  return { game }
}

function normalizeCharacterIds(payload: z.infer<typeof assignmentSchema>) {
  return uniqueIds([
    ...(payload.characterId ? [payload.characterId] : []),
    ...(payload.characterIds ?? []),
  ])
}

function isUnknownArgumentError(error: unknown, argument: string) {
  return error instanceof Error && error.message.includes(`Unknown argument \`${argument}\``)
}

function isLegacyPlaceholderWallet(walletAddress: string, aaChainId?: number): boolean {
  const isZeroPattern = /^0x0{36}[0-9a-fA-F]{4}$/.test(walletAddress)
  const wrongChain = typeof aaChainId === 'number' && aaChainId !== 2368
  return isZeroPattern || wrongChain
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

async function updateCharacterWithUnknownArgStripping(
  characterId: string,
  initialData: Record<string, unknown>,
  maxAttempts = 8
) {
  let data = { ...initialData }
  let attempts = 0

  while (attempts < maxAttempts) {
    attempts += 1
    try {
      return await (prisma.character as any).update({
        where: { id: characterId },
        data,
      })
    } catch (error) {
      if (!(error instanceof Error)) throw error
      const match = error.message.match(/Unknown argument `([^`]+)`/)
      const unknownArg = match?.[1]
      if (unknownArg && Object.prototype.hasOwnProperty.call(data, unknownArg)) {
        const { [unknownArg]: _ignored, ...rest } = data
        data = rest
        continue
      }
      throw error
    }
  }

  throw new Error('Character wallet update failed after stripping unsupported Prisma fields.')
}

async function repairLegacyCharacterWallet(character: any): Promise<string> {
  const ownerId = `character:${character.id}`
  const smartAccount = await kiteAAProvider.createSmartAccount({ ownerId })
  const previousConfig = asRecord(character.config)
  const nextConfig = {
    ...previousConfig,
    ownerId,
  }

  await updateCharacterWithUnknownArgStripping(character.id, {
    walletAddress: smartAccount.address,
    aaChainId: smartAccount.chainId,
    aaProvider: smartAccount.provider,
    smartAccountId: smartAccount.smartAccountId,
    smartAccountStatus: 'created',
    config: nextConfig as unknown as any,
  })

  return smartAccount.address
}

export async function GET(request: NextRequest, context: { params: Promise<{ gameId: string }> }) {
  try {
    const authProject = await resolveAuthorizedProject(request)
    if (authProject instanceof NextResponse) {
      return authProject
    }

    const gameResult = await resolveGame(context.params)
    if (gameResult.error) {
      return gameResult.error
    }

    const game = gameResult.game

    if (authProject && authProject.id !== game.id) {
      return NextResponse.json({ error: 'Game does not match API key project' }, { status: 403 })
    }

    const characterDelegate = prisma.character as any

    let characters: any[] = []
    try {
      characters = await characterDelegate.findMany({
        where: { projects: { some: { id: game.id } } },
        include: { projects: { select: { id: true } } },
        orderBy: { createdAt: 'desc' },
      })
    } catch (error) {
      if (!isUnknownArgumentError(error, 'projects')) {
        throw error
      }

      // Legacy schema fallback: Character belongs to a single project via projectId.
      characters = await characterDelegate.findMany({
        where: { projectId: game.id },
        orderBy: { createdAt: 'desc' },
      })
    }

    const normalizedCharacters = await Promise.all(
      characters.map(async (character) => {
        if (!isLegacyPlaceholderWallet(character.walletAddress, character.aaChainId)) {
          return character
        }

        try {
          const newWalletAddress = await repairLegacyCharacterWallet(character)
          return {
            ...character,
            walletAddress: newWalletAddress,
            smartAccountStatus: 'created',
          }
        } catch (error) {
          console.warn(
            `[API] Failed to auto-repair wallet for character ${character.id}:`,
            error
          )
          return character
        }
      })
    )

    return NextResponse.json({
      game,
      characters: normalizedCharacters.map((character) => ({
        id: character.id,
        name: character.name,
        walletAddress: character.walletAddress,
        smartAccountStatus: character.smartAccountStatus,
        projectIds: Array.isArray(character.projects)
          ? character.projects.map((project: { id: string }) => project.id)
          : typeof character.projectId === 'string'
            ? [character.projectId]
            : [],
        createdAt: character.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error('[API] Game character list error:', error)
    return NextResponse.json({ error: 'Failed to fetch game characters' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ gameId: string }> }) {
  try {
    const authProject = await resolveAuthorizedProject(request)
    if (authProject instanceof NextResponse) {
      return authProject
    }

    const gameResult = await resolveGame(context.params)
    if (gameResult.error) {
      return gameResult.error
    }

    const game = gameResult.game
    if (authProject && authProject.id !== game.id) {
      return NextResponse.json({ error: 'Game does not match API key project' }, { status: 403 })
    }

    const parsed = assignmentSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid payload' },
        { status: 400 }
      )
    }

    const characterIds = normalizeCharacterIds(parsed.data)
    if (!characterIds.length) {
      return NextResponse.json(
        { error: 'characterId or characterIds is required' },
        { status: 400 }
      )
    }

    const existingCharacters = await prisma.character.findMany({
      where: { id: { in: characterIds } },
      select: { id: true },
    })

    if (existingCharacters.length !== characterIds.length) {
      const found = new Set(existingCharacters.map((character) => character.id))
      const missing = characterIds.filter((id) => !found.has(id))
      return NextResponse.json(
        { error: `Character(s) not found: ${missing.join(', ')}` },
        { status: 404 }
      )
    }

    const projectDelegate = prisma.project as any
    const characterDelegate = prisma.character as any

    try {
      await projectDelegate.update({
        where: { id: game.id },
        data: {
          characters: {
            connect: characterIds.map((id) => ({ id })),
          },
        },
      })
    } catch (error) {
      if (!isUnknownArgumentError(error, 'characters')) {
        throw error
      }

      // Legacy schema fallback: assigning moves characters to this game by setting projectId.
      await characterDelegate.updateMany({
        where: { id: { in: characterIds } },
        data: { projectId: game.id },
      })
    }

    return NextResponse.json({
      message: 'Characters assigned to game',
      gameId: game.id,
      assignedCharacterIds: characterIds,
    })
  } catch (error) {
    console.error('[API] Game character assignment error:', error)
    return NextResponse.json({ error: 'Failed to assign characters to game' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ gameId: string }> }) {
  try {
    const authProject = await resolveAuthorizedProject(request)
    if (authProject instanceof NextResponse) {
      return authProject
    }

    const gameResult = await resolveGame(context.params)
    if (gameResult.error) {
      return gameResult.error
    }

    const game = gameResult.game
    if (authProject && authProject.id !== game.id) {
      return NextResponse.json({ error: 'Game does not match API key project' }, { status: 403 })
    }

    const parsed = assignmentSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid payload' },
        { status: 400 }
      )
    }

    const characterIds = normalizeCharacterIds(parsed.data)
    if (!characterIds.length) {
      return NextResponse.json(
        { error: 'characterId or characterIds is required' },
        { status: 400 }
      )
    }

    const projectDelegate = prisma.project as any
    const characterDelegate = prisma.character as any

    try {
      await projectDelegate.update({
        where: { id: game.id },
        data: {
          characters: {
            disconnect: characterIds.map((id) => ({ id })),
          },
        },
      })
    } catch (error) {
      if (!isUnknownArgumentError(error, 'characters')) {
        throw error
      }

      // Legacy schema cannot represent "no game" for required projectId; reject explicitly.
      const inGameCount = await characterDelegate.count({
        where: { id: { in: characterIds }, projectId: game.id },
      })

      if (inGameCount > 0) {
        return NextResponse.json(
          {
            error:
              'Unassign is not supported on the legacy schema. Run the many-to-many migration to remove game assignments independently.',
          },
          { status: 409 }
        )
      }
    }

    return NextResponse.json({
      message: 'Characters removed from game',
      gameId: game.id,
      removedCharacterIds: characterIds,
    })
  } catch (error) {
    console.error('[API] Game character unassignment error:', error)
    return NextResponse.json({ error: 'Failed to remove characters from game' }, { status: 500 })
  }
}
