import { NextRequest, NextResponse } from 'next/server'
import { kiteAAProvider } from '@/lib/aa-sdk'
import { validateApiKey } from '@/lib/api-key-store'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/lib/generated/prisma/client'
import * as fs from 'fs'
import * as path from 'path'

type UnknownRecord = Record<string, unknown>

interface StoredCharacter {
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
}

const getLegacyStoragePath = () => path.join(process.cwd(), 'tmp', 'characters.json')

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? (value as UnknownRecord) : {}
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return asRecord(value) as Prisma.InputJsonValue
}

function normalizeLegacyCharacter(row: unknown): StoredCharacter | null {
  const payload = asRecord(row)
  if (
    typeof payload.id !== 'string' ||
    typeof payload.projectId !== 'string' ||
    typeof payload.name !== 'string' ||
    typeof payload.walletAddress !== 'string'
  ) {
    return null
  }

  return {
    id: payload.id,
    projectId: payload.projectId,
    name: payload.name,
    walletAddress: payload.walletAddress,
    aaChainId:
      typeof payload.aaChainId === 'number'
        ? payload.aaChainId
        : Number(process.env.KITE_AA_CHAIN_ID ?? 42161),
    aaProvider:
      typeof payload.aaProvider === 'string' && payload.aaProvider
        ? payload.aaProvider
        : 'legacy-json',
    smartAccountId:
      typeof payload.smartAccountId === 'string' ? payload.smartAccountId : null,
    smartAccountStatus:
      typeof payload.smartAccountStatus === 'string' && payload.smartAccountStatus
        ? payload.smartAccountStatus
        : 'created',
    config: asRecord(payload.config),
    adaptation: asRecord(payload.adaptation),
    isDeployedOnChain:
      typeof payload.isDeployedOnChain === 'boolean' ? payload.isDeployedOnChain : true,
    deploymentTxHash:
      typeof payload.deploymentTxHash === 'string' ? payload.deploymentTxHash : null,
    createdAt:
      typeof payload.createdAt === 'string' ? new Date(payload.createdAt) : new Date(),
  }
}

function toApiCharacter(character: StoredCharacter) {
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

async function backfillLegacyCharacters(projectId: string): Promise<void> {
  try {
    const legacyPath = getLegacyStoragePath()
    if (!fs.existsSync(legacyPath)) {
      return
    }

    const raw = fs.readFileSync(legacyPath, 'utf-8')
    const parsed = JSON.parse(raw) as UnknownRecord
    const values = Object.values(parsed)
      .map(normalizeLegacyCharacter)
      .filter((character): character is StoredCharacter => Boolean(character))
      .filter((character) => character.projectId === projectId)

    if (values.length === 0) {
      return
    }

    for (const character of values) {
      await prisma.character.upsert({
        where: { id: character.id },
        update: {
          name: character.name,
          walletAddress: character.walletAddress,
          aaChainId: character.aaChainId,
          aaProvider: character.aaProvider,
          smartAccountId: character.smartAccountId,
          smartAccountStatus: character.smartAccountStatus,
          config: toInputJson(character.config),
          adaptation: toInputJson(character.adaptation),
          isDeployedOnChain: character.isDeployedOnChain,
          deploymentTxHash: character.deploymentTxHash,
        },
        create: {
          id: character.id,
          projectId: character.projectId,
          name: character.name,
          walletAddress: character.walletAddress,
          aaChainId: character.aaChainId,
          aaProvider: character.aaProvider,
          smartAccountId: character.smartAccountId,
          smartAccountStatus: character.smartAccountStatus,
          config: toInputJson(character.config),
          adaptation: toInputJson(character.adaptation),
          isDeployedOnChain: character.isDeployedOnChain,
          deploymentTxHash: character.deploymentTxHash,
          createdAt: character.createdAt,
        },
      })
    }
  } catch (error) {
    console.error('[API] Legacy character backfill skipped due to error:', error)
  }
}

const normalizeAdaptation = (config: any, existing: any = {}) => ({
  specializationActive: Boolean(existing.specializationActive),
  turnCount: typeof existing.turnCount === 'number' ? existing.turnCount : 0,
  preferences: Array.isArray(existing.preferences) ? existing.preferences : [],
  summary:
    typeof existing.summary === 'string' && existing.summary.trim()
      ? existing.summary
      : 'No adaptation history yet.',
  lastUpdatedAt: new Date().toISOString(),
  pendingSection2: existing.pendingSection2,
  configSnapshot: {
    systemPrompt: typeof config?.systemPrompt === 'string' ? config.systemPrompt : '',
    openness: typeof config?.openness === 'number' ? config.openness : 50,
  },
})

/**
 * POST /api/characters
 * Deploys a new NPC to Kite Chain using Kite AA
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { projectId, name, config } = body

    if (!projectId || !name || !config) {
      return NextResponse.json(
        { error: 'projectId, name, and config are required' },
        { status: 400 }
      )
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Step 1: Instantiate KiteAAProvider
    const aaProvider = kiteAAProvider

    // Step 2: Create smart account (wallet) for the NPC
    const smartAccount = await aaProvider.createSmartAccount({
      ownerId: `${projectId}:${name}`,
      metadata: {
        projectId,
        npcName: name,
      },
    })
    const walletAddress = smartAccount.address

    // Step 3: Build and store character
    const character = await prisma.character.create({
      data: {
        projectId,
        name,
        walletAddress,
        aaChainId: smartAccount.chainId,
        aaProvider: smartAccount.provider,
        smartAccountId: smartAccount.smartAccountId,
        smartAccountStatus: 'created',
        config,
        adaptation: {
          specializationActive: false,
          turnCount: 0,
          preferences: [],
          summary: 'No adaptation history yet.',
          lastUpdatedAt: new Date().toISOString(),
        },
        isDeployedOnChain: true,
      },
    })

    const apiCharacter = toApiCharacter(character as unknown as StoredCharacter)

    return NextResponse.json(
      {
        message: `Deployed ${name} to Kite Chain with wallet ${walletAddress.slice(0, 6)}...`,
        character: apiCharacter,
        walletAddress,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[API] Character deployment error:', error)
    return NextResponse.json(
      { error: 'Failed to deploy character' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/characters
 * Updates an existing deployed NPC configuration
 */
export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    let project: { id: string } | null = null

    if (authHeader) {
      if (!authHeader.startsWith('Bearer ')) {
        return NextResponse.json(
          { error: 'Missing or malformed Authorization header. Use: Bearer gc_live_...' },
          { status: 401 }
        )
      }

      const apiKey = authHeader.replace('Bearer ', '').trim()
      project = await validateApiKey(apiKey)

      if (!project) {
        return NextResponse.json(
          { error: 'Invalid API key' },
          { status: 401 }
        )
      }
    }

    const body = await request.json()
    const { projectId, characterId, config } = body

    if (!projectId || !characterId || !config) {
      return NextResponse.json(
        { error: 'projectId, characterId, and config are required' },
        { status: 400 }
      )
    }

    if (project && project.id !== projectId) {
      return NextResponse.json(
        { error: 'Character project does not match API key project' },
        { status: 403 }
      )
    }

    const character = await prisma.character.findUnique({
      where: { id: characterId },
    })

    if (!character) {
      return NextResponse.json(
        { error: 'Character not found' },
        { status: 404 }
      )
    }

    if (character.projectId !== projectId) {
      return NextResponse.json(
        { error: 'Character not accessible for this project' },
        { status: 403 }
      )
    }

    const updated = await prisma.character.update({
      where: { id: characterId },
      data: {
        config,
        adaptation: normalizeAdaptation(config, character.adaptation),
      },
    })

    return NextResponse.json({
      message: `Updated ${character.name} configuration`,
      character: toApiCharacter(updated as unknown as StoredCharacter),
    })
  } catch (error) {
    console.error('[API] Character update error:', error)
    return NextResponse.json(
      { error: 'Failed to update character' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/characters
 * Fetch characters by API key (Bearer token authentication)
 */
export async function GET(request: NextRequest) {
  try {
    // --- Authenticate via API Key ---
    const authHeader = request.headers.get('Authorization')

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or malformed Authorization header. Use: Bearer gc_live_...' },
        { status: 401 }
      )
    }

    const apiKey = authHeader.replace('Bearer ', '').trim()
    const project = await validateApiKey(apiKey)

    if (!project) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      )
    }

    await backfillLegacyCharacters(project.id)

    const chars = await prisma.character.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(
      chars.map((character) => toApiCharacter(character as unknown as StoredCharacter))
    )
  } catch (error) {
    console.error('[API] Character fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch characters' },
      { status: 500 }
    )
  }
}
