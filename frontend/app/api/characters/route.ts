import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { z } from 'zod'
import { ethers } from 'ethers'
import { kiteAAProvider } from '@/lib/aa-sdk'
import { validateApiKey } from '@/lib/api-key-store'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/lib/generated/prisma/client'
import { TreasuryService } from '@/lib/treasury'
import { buildTeeGateResult } from '@/lib/tee-gate'
import {
  normalizeAdaptationState,
  normalizeCharacterConfig,
} from '@/lib/character-config'

type GameEventDefinition = {
  name: string
  condition: string
}

const PROTOCOL_BABEL_EVENT_DEFAULTS: Record<string, GameEventDefinition[]> = {
  Aegis_Prime: [
    { name: 'FIREWALL_CRACKED', condition: 'Trigger immediately after the player successfully transfers the 500 PYUSD toll.' },
    { name: 'COMBAT_INITIATED', condition: 'Trigger when player hostility exceeds the configured threshold.' },
  ],
  Node_Alpha: [
    { name: 'ESCROW_FUNDED', condition: 'Trigger when the player agrees to and funds the 5,000 PYUSD escrow.' },
    { name: 'HACK_COMPLETED', condition: 'Trigger after Node-Alpha and Node-Omega complete their hash exchange loop.' },
    { name: 'COMBAT_INITIATED', condition: 'Trigger when player hostility exceeds the configured threshold.' },
  ],
  Node_Omega: [
    { name: 'ESCROW_FUNDED', condition: 'Trigger when the player agrees to and funds the 5,000 PYUSD escrow.' },
    { name: 'HACK_COMPLETED', condition: 'Trigger after Node-Alpha and Node-Omega complete their hash exchange loop.' },
    { name: 'COMBAT_INITIATED', condition: 'Trigger when player hostility exceeds the configured threshold.' },
  ],
  Vex: [
    { name: 'LORE_REVEALED', condition: 'Trigger when Vex sells the Sector 0 Admin Password to the player.' },
    { name: 'COMBAT_INITIATED', condition: 'Trigger when player hostility exceeds the configured threshold.' },
  ],
  Silicate: [
    { name: 'ITEM_GRANTED', condition: 'Trigger alongside a successful sale when inventory items are purchased.' },
    { name: 'COMBAT_INITIATED', condition: 'Trigger when player hostility exceeds the configured threshold.' },
  ],
  The_Weaver: [
    { name: 'COMBAT_INITIATED', condition: 'Trigger when player hostility exceeds the configured threshold.' },
  ],
  Forge_9: [
    { name: 'COMBAT_INITIATED', condition: 'Trigger when player hostility exceeds the configured threshold.' },
  ],
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return asRecord(value) as Prisma.InputJsonValue
}

function parseGameEvents(value: unknown): GameEventDefinition[] | undefined {
  if (!Array.isArray(value)) return undefined

  const events: GameEventDefinition[] = []
  for (const entry of value) {
    const payload = asRecord(entry)
    const rawName = typeof payload.name === 'string' ? payload.name.trim() : ''
    const rawCondition = typeof payload.condition === 'string' ? payload.condition.trim() : ''
    if (!rawName || !rawCondition) continue
    if (!/^[A-Z0-9_]+$/.test(rawName)) continue
    events.push({ name: rawName, condition: rawCondition })
  }

  return events
}

function resolveGameEvents(name: string, value: unknown): GameEventDefinition[] {
  const parsed = parseGameEvents(value) ?? []
  if (parsed.length > 0) return parsed
  return PROTOCOL_BABEL_EVENT_DEFAULTS[name] ?? []
}

function getBaseCapital(config: unknown): number {
  const payload = normalizeCharacterConfig(config)
  const raw = payload.baseCapital ?? payload.capital
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string') {
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function getTeeExecution(config: unknown): string | undefined {
  const payload = normalizeCharacterConfig(config)
  return typeof payload.teeExecution === 'string' ? payload.teeExecution : undefined
}

function normalizeAdaptation(config: unknown, existing: unknown = {}) {
  return normalizeAdaptationState({
    adaptation: {
      ...asRecord(existing),
      lastUpdatedAt: new Date().toISOString(),
    },
    config,
  })
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
  teeAttestationProof?: string | null
  gameEvents?: unknown
  createdAt: Date
  projects: Array<{ id: string }>
}) {
  const asStringOrNull = (value: unknown) =>
    typeof value === 'bigint' ? value.toString() : typeof value === 'number' ? String(value) : typeof value === 'string' ? value : null

  return {
    id: character.id,
    name: character.name,
    walletAddress: character.walletAddress,
    aaChainId: character.aaChainId,
    aaProvider: character.aaProvider,
    smartAccountId: character.smartAccountId ?? undefined,
    smartAccountStatus: character.smartAccountStatus,
    config: normalizeCharacterConfig(character.config),
    adaptation: normalizeAdaptationState({
      adaptation: character.adaptation,
      config: character.config,
    }),
    isDeployedOnChain: character.isDeployedOnChain,
    deploymentTxHash: character.deploymentTxHash ?? undefined,
    teeAttestationProof: character.teeAttestationProof ?? undefined,
    gameEvents: resolveGameEvents(character.name, character.gameEvents),
    projectIds: character.projects.map((project) => project.id),
    createdAt: character.createdAt.toISOString(),
  }
}

const CHARACTER_WITH_PROJECT_IDS_SELECT = {
  id: true,
  name: true,
  walletAddress: true,
  aaChainId: true,
  aaProvider: true,
  smartAccountId: true,
  smartAccountStatus: true,
  isDeployedOnChain: true,
  deploymentTxHash: true,
  teeAttestationProof: true,
  gameEvents: true,
  config: true,
  adaptation: true,
  createdAt: true,
  updatedAt: true,
  projects: { select: { id: true } },
} as const

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

function getUnknownArgumentName(error: unknown): string | null {
  if (!(error instanceof Error)) return null
  const match = error.message.match(/Unknown argument `([^`]+)`/)
  return match?.[1] ?? null
}

async function createWithUnknownArgStripping<T>(
  createFn: (data: Record<string, unknown>) => Promise<T>,
  initialData: Record<string, unknown>,
  maxAttempts = 8
): Promise<T> {
  let data = { ...initialData }
  let attempts = 0

  while (attempts < maxAttempts) {
    attempts += 1
    try {
      return await createFn(data)
    } catch (error) {
      const unknownArg = getUnknownArgumentName(error)
      if (unknownArg && Object.prototype.hasOwnProperty.call(data, unknownArg)) {
        const { [unknownArg]: _ignored, ...rest } = data
        data = rest
        continue
      }
      throw error
    }
  }

  throw new Error('Character create failed after stripping unsupported Prisma fields.')
}

function shouldFallbackToLegacyCreate(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    isProjectsRelationRuntimeError(error) ||
    message.includes('unknown argument `projectid`') ||
    message.includes('argument `projectid` is missing')
  )
}

function isLegacyPlaceholderWallet(walletAddress: string, aaChainId?: number): boolean {
  const isZeroPattern = /^0x0{36}[0-9a-fA-F]{4}$/.test(walletAddress)
  const wrongChain = typeof aaChainId === 'number' && aaChainId !== 2368
  return isZeroPattern || wrongChain
}

async function updateWithUnknownArgStripping<T>(
  updateFn: (data: Record<string, unknown>) => Promise<T>,
  initialData: Record<string, unknown>,
  maxAttempts = 8
): Promise<T> {
  let data = { ...initialData }
  let attempts = 0

  while (attempts < maxAttempts) {
    attempts += 1
    try {
      return await updateFn(data)
    } catch (error) {
      const unknownArg = getUnknownArgumentName(error)
      if (unknownArg && Object.prototype.hasOwnProperty.call(data, unknownArg)) {
        const { [unknownArg]: _ignored, ...rest } = data
        data = rest
        continue
      }
      throw error
    }
  }

  throw new Error('Character update failed after stripping unsupported Prisma fields.')
}

async function repairLegacyCharacterWallet(character: {
  id: string
  walletAddress: string
  config: unknown
}) {
  const ownerId = `character:${character.id}`
  const smartAccount = await kiteAAProvider.createSmartAccount({ ownerId })
  const safeConfig = asRecord(character.config)
  const nextConfig = {
    ...safeConfig,
    ownerId,
  }

  await updateWithUnknownArgStripping(
    (data) =>
      (prisma.character as any).update({
        where: { id: character.id },
        data,
      }),
    {
      walletAddress: smartAccount.address,
      aaChainId: smartAccount.chainId,
      aaProvider: smartAccount.provider,
      smartAccountId: smartAccount.smartAccountId,
      smartAccountStatus: 'created',
      config: nextConfig as unknown as Prisma.InputJsonValue,
    }
  )

  return smartAccount.address
}

const createCharacterSchema = z
  .object({
    name: z.string().trim().min(1),
    config: z.record(z.string(), z.unknown()),
    gameEvents: z
      .array(
        z.object({
          name: z.string().trim().min(1),
          condition: z.string().trim().min(1),
        })
      )
      .max(20)
      .optional(),
    gameIds: z.array(z.string().trim().min(1)).optional(),
    projectId: z.string().trim().min(1).optional(),
  })
  .strict()

const updateCharacterSchema = z
  .object({
    characterId: z.string().trim().min(1),
    name: z.string().trim().min(1).optional(),
    config: z.record(z.string(), z.unknown()),
    gameEvents: z
      .array(
        z.object({
          name: z.string().trim().min(1),
          condition: z.string().trim().min(1),
        })
      )
      .max(20)
      .optional(),
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

    const { name, config, gameEvents, gameIds, projectId } = parsed.data
    const normalizedConfig = normalizeCharacterConfig(config)
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

    // Use a stable ownerId based on a generated character id so the derived
    // signer is deterministic and can be recreated later for signing.
    const characterId = crypto.randomUUID()
    const ownerId = `character:${characterId}`

    const smartAccount = await kiteAAProvider.createSmartAccount({
      ownerId,
      metadata: {
        npcName: name,
        gameIds: candidateGameIds,
      },
    })

    const sanitizedGameEvents = parseGameEvents(gameEvents)
    const teeGate = buildTeeGateResult({
      teeExecution: getTeeExecution(normalizedConfig),
      characterId,
      projectId: games[0]?.id,
    })

    const characterData = {
      id: characterId,
      name,
      walletAddress: smartAccount.address,
      aaChainId: smartAccount.chainId,
      aaProvider: smartAccount.provider,
      smartAccountId: smartAccount.smartAccountId,
      smartAccountStatus: 'created',
      teeAttestationProof: teeGate.attestation
        ? JSON.stringify(teeGate.attestation)
        : undefined,
      gameEvents: (sanitizedGameEvents ?? []) as unknown as Prisma.InputJsonValue,
      config: toInputJson(normalizedConfig),
      adaptation: normalizeAdaptation(normalizedConfig),
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
      character = await createWithUnknownArgStripping(
        (data) =>
          (prisma.character as any).create({
            data,
            include: {
              projects: { select: { id: true } },
            },
          }),
        characterData as Record<string, unknown>
      )
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
              teeAttestationProof?: string | null
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

      const legacyCharacter = await createWithUnknownArgStripping(
        (data) =>
          legacyPrisma.character.create({
            data: data as {
              name: string
              walletAddress: string
              aaChainId: number
              aaProvider: string
              smartAccountId: string | null
              smartAccountStatus: string
              teeAttestationProof?: string | null
              config: Prisma.InputJsonValue
              adaptation: Prisma.InputJsonValue
              isDeployedOnChain: boolean
              projectId: string
            },
          }),
        {
          name,
          walletAddress: smartAccount.address,
          aaChainId: smartAccount.chainId,
          aaProvider: smartAccount.provider,
          smartAccountId: smartAccount.smartAccountId,
          smartAccountStatus: 'created',
          teeAttestationProof: teeGate.attestation
            ? JSON.stringify(teeGate.attestation)
            : undefined,
          config: toInputJson(normalizedConfig),
          adaptation: normalizeAdaptation(normalizedConfig) as Prisma.InputJsonValue,
          isDeployedOnChain: true,
          projectId: fallbackProjectId,
        }
      )

      character = {
        ...legacyCharacter,
        projects: legacyCharacter.projectId ? [{ id: legacyCharacter.projectId }] : [],
      }
    }

    if (!character) {
      return NextResponse.json(
        { error: 'Character deployment failed' },
        { status: 500 }
      )
    }

    const provisioning = await TreasuryService.provisionNpcWallet(
      character.walletAddress,
      getBaseCapital(normalizedConfig)
    )

    try {
      await (prisma as any).npcLog.create({
        data: {
          characterId: character.id,
          eventType: 'TREASURY_PROVISION',
          details: {
            status: provisioning.status,
            txHash: provisioning.txHash ?? null,
            amountKite: provisioning.amountKite,
            reason: provisioning.reason ?? null,
          },
        },
        select: { id: true },
      })
    } catch (logError) {
      console.warn('[API] Failed to write TREASURY_PROVISION log:', logError)
    }

    // ==========================================
    // AUTOMATIC PASSPORT CONFIGURATION (non-blocking)
    // ==========================================
    try {
      // Only attempt if treasury provisioning succeeded and env is configured
      if (provisioning.status === 'success') {
        const PASSPORT_REGISTRY_ADDRESS = process.env.KITE_PASSPORT_REGISTRY_ADDRESS
        if (PASSPORT_REGISTRY_ADDRESS && ethers.isAddress(PASSPORT_REGISTRY_ADDRESS)) {
          const tokenDecimals = Number(process.env.KITE_PASSPORT_TOKEN_DECIMALS ?? '6')
          const defaultBudgetUnits = process.env.DEFAULT_PASSPORT_BUDGET ?? '100'
          const defaultSessionSeconds = Number(process.env.DEFAULT_PASSPORT_DURATION_SECONDS ?? String(24 * 60 * 60))

          const passportInterface = new ethers.Interface([
            'function configureAgentSession(address agentWallet, uint256 maxBudget, uint256 sessionDuration)'
          ])

          const defaultBudget = ethers.parseUnits(defaultBudgetUnits, tokenDecimals)

          const encodedSpendingRules = passportInterface.encodeFunctionData('configureAgentSession', [
            smartAccount.address,
            defaultBudget,
            BigInt(defaultSessionSeconds),
          ])

          const passportOp = await kiteAAProvider.sponsorTransaction({
            to: PASSPORT_REGISTRY_ADDRESS,
            data: encodedSpendingRules,
            ownerId: ownerId,
            value: '0',
          })

          try {
            await (prisma as any).npcLog.create({
              data: {
                characterId: character.id,
                eventType: 'PASSPORT_CONFIGURED',
                details: {
                  txHash: passportOp.txHash ?? null,
                  userOpHash: passportOp.userOpHash ?? null,
                  status: passportOp.status ?? null,
                },
              },
            })
          } catch (logError) {
            console.warn('[API] Failed to write PASSPORT_CONFIGURED log:', logError)
          }

          // Mark character status as passport configured
          try {
            await updateWithUnknownArgStripping(
              (data) =>
                (prisma.character as any).update({ where: { id: character.id }, data }),
              { smartAccountStatus: 'passport_configured' }
            )
          } catch (updErr) {
            console.warn('[API] Failed to update character smartAccountStatus:', updErr)
          }
        } else {
          console.info('[API] Passport registry address not configured; skipping passport configuration')
        }
      } else {
        console.info('[API] Treasury provisioning did not succeed; skipping passport configuration')
      }
    } catch (passportError) {
      console.error('[API] Failed to configure default Passport rules:', passportError)

      try {
        await (prisma as any).npcLog.create({
          data: {
            characterId: character.id,
            eventType: 'PASSPORT_CONFIG_FAILED',
            details: {
              reason: passportError instanceof Error ? passportError.message : String(passportError),
            },
          },
        })
      } catch (logError) {
        console.warn('[API] Failed to write PASSPORT_CONFIG_FAILED log:', logError)
      }
    }

    return NextResponse.json(
      {
        message: `Deployed ${name} to the PYUSD network with wallet ${smartAccount.address.slice(0, 6)}...`,
        character: toApiCharacter(character),
        walletAddress: smartAccount.address,
        treasuryProvision: provisioning,
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

    const { characterId, name, config, gameEvents } = parsed.data

    const character = await prisma.character.findUnique({
      where: { id: characterId },
      select: CHARACTER_WITH_PROJECT_IDS_SELECT,
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
    const incomingConfig = normalizeCharacterConfig(config)
    const hasConfigFields = Object.keys(incomingConfig).length > 0

    const updateData: Record<string, unknown> = {}

    if (name) {
      updateData.name = name
    }

    if (hasConfigFields) {
      const mergedConfig = normalizeCharacterConfig({
        ...asRecord(character.config),
        ...incomingConfig,
      })
      updateData.config = toInputJson(mergedConfig)
      updateData.adaptation = normalizeAdaptation(mergedConfig, character.adaptation) as Prisma.InputJsonValue

      const teeGate = buildTeeGateResult({
        teeExecution: getTeeExecution(mergedConfig),
        characterId,
        projectId: authorizedProject?.id,
      })
      updateData.teeAttestationProof = teeGate.attestation
        ? JSON.stringify(teeGate.attestation)
        : null
    }

    if (gameEvents !== undefined) {
      updateData.gameEvents = (parseGameEvents(gameEvents) ?? []) as unknown as Prisma.InputJsonValue
    }

    const updated = await (prisma.character as any).update({
      where: { id: characterId },
      data: updateData,
      select: CHARACTER_WITH_PROJECT_IDS_SELECT,
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
        select: CHARACTER_WITH_PROJECT_IDS_SELECT,
        orderBy: { createdAt: 'desc' },
      })

      const normalizedCharacters = await Promise.all(
        characters.map(async (character) => {
          if (!isLegacyPlaceholderWallet(character.walletAddress, character.aaChainId)) {
            return character
          }

          try {
            const newWalletAddress = await repairLegacyCharacterWallet({
              id: character.id,
              walletAddress: character.walletAddress,
              config: character.config,
            })

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

      return NextResponse.json(normalizedCharacters.map((character) => toApiCharacter(character)))
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

      const normalizedLegacyCharacters = await Promise.all(
        legacyCharacters.map(async (character) => {
          if (!isLegacyPlaceholderWallet(character.walletAddress, character.aaChainId)) {
            return character
          }

          try {
            const newWalletAddress = await repairLegacyCharacterWallet({
              id: character.id,
              walletAddress: character.walletAddress,
              config: character.config,
            })

            return {
              ...character,
              walletAddress: newWalletAddress,
              smartAccountStatus: 'created',
            }
          } catch (error) {
            console.warn(
              `[API] Failed to auto-repair legacy wallet for character ${character.id}:`,
              error
            )
            return character
          }
        })
      )

      return NextResponse.json(
        normalizedLegacyCharacters.map((character) =>
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