import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey } from '@/lib/api-key-store'
import {
  normalizeAdaptationState,
  normalizeCharacterConfig,
} from '@/lib/character-config'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

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

function parseGameEvents(value: unknown): GameEventDefinition[] {
  if (!Array.isArray(value)) return []
  const events: GameEventDefinition[] = []

  for (const entry of value) {
    const payload = asRecord(entry)
    const name = typeof payload.name === 'string' ? payload.name.trim() : ''
    const condition = typeof payload.condition === 'string' ? payload.condition.trim() : ''
    if (!name || !condition) continue
    if (!/^[A-Z0-9_]+$/.test(name)) continue
    events.push({ name, condition })
  }

  return events
}

function resolveGameEvents(name: string, value: unknown): GameEventDefinition[] {
  const parsed = parseGameEvents(value)
  if (parsed.length > 0) return parsed
  return PROTOCOL_BABEL_EVENT_DEFAULTS[name] ?? []
}

function shouldFallbackToLegacyProjectRelation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : ''
  const errorCode =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : ''

  return (
    message.includes('Unknown field `projects` for include statement') ||
    message.includes('Unknown argument `projects`') ||
    message.includes('The table `public._CharacterToProject` does not exist') ||
    errorCode === 'P2021'
  )
}

function isUnknownProjectIncludeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : ''
  return (
    message.includes('Unknown field `project` for include statement') ||
    message.includes('Unknown argument `project`')
  )
}

async function hasCharacterAccessForProject(characterId: string, projectId: string): Promise<boolean> {
  const characterDelegate = prisma.character as any

  try {
    const count = await characterDelegate.count({
      where: {
        id: characterId,
        projects: { some: { id: projectId } },
      },
    })
    return count > 0
  } catch {
    // Fall through to legacy projectId relation check.
  }

  try {
    const count = await characterDelegate.count({
      where: {
        id: characterId,
        projectId,
      },
    })
    return count > 0
  } catch {
    return false
  }
}

type ApiProject = {
  id: string
  name: string
  apiKey: string
  createdAt: Date
}

type CharacterWithProjectRelations = {
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
  gameEvents?: unknown
  createdAt: Date
  projectId?: string
  projects?: ApiProject[]
  project?: ApiProject | null
}

const CHARACTER_BASE_SELECT = {
  id: true,
  name: true,
  walletAddress: true,
  aaChainId: true,
  aaProvider: true,
  smartAccountId: true,
  smartAccountStatus: true,
  config: true,
  adaptation: true,
  isDeployedOnChain: true,
  deploymentTxHash: true,
  gameEvents: true,
  createdAt: true,
} as const

const CHARACTER_WITH_PROJECTS_SELECT = {
  ...CHARACTER_BASE_SELECT,
  projects: {
    select: {
      id: true,
      name: true,
      apiKey: true,
      createdAt: true,
    },
  },
} as const

const CHARACTER_WITH_PROJECT_SELECT = {
  ...CHARACTER_BASE_SELECT,
  project: {
    select: {
      id: true,
      name: true,
      apiKey: true,
      createdAt: true,
    },
  },
} as const

function getCharacterProjects(character: CharacterWithProjectRelations): ApiProject[] {
  if (Array.isArray(character.projects)) {
    return character.projects
  }
  if (character.project) {
    return [character.project]
  }
  return []
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
  gameEvents?: unknown
  createdAt: Date
  projectId?: string
  projects?: Array<{ id: string; name: string; apiKey: string; createdAt: Date }>
  project?: { id: string; name: string; apiKey: string; createdAt: Date } | null
}) {
  const relatedProjects = getCharacterProjects(character)

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
    gameEvents: resolveGameEvents(character.name, character.gameEvents),
    isDeployedOnChain: character.isDeployedOnChain,
    deploymentTxHash: character.deploymentTxHash ?? undefined,
    projectIds: relatedProjects.map((project) => project.id),
    createdAt: character.createdAt.toISOString(),
  }
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

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    if (!id) {
      return NextResponse.json({ error: 'Character id is required' }, { status: 400 })
    }

    const authorizedProject = await resolveAuthorizedProject(request)
    if (authorizedProject instanceof NextResponse) {
      return authorizedProject
    }

    let character: CharacterWithProjectRelations | null = null
    const characterDelegate = prisma.character as any

    try {
      character = await characterDelegate.findUnique({
        where: { id },
        select: CHARACTER_WITH_PROJECTS_SELECT,
      })
    } catch (error) {
      if (!shouldFallbackToLegacyProjectRelation(error)) {
        throw error
      }

      try {
        character = await characterDelegate.findUnique({
          where: { id },
          select: CHARACTER_WITH_PROJECT_SELECT,
        })
      } catch (legacyIncludeError) {
        if (!isUnknownProjectIncludeError(legacyIncludeError)) {
          throw legacyIncludeError
        }

        character = await characterDelegate.findUnique({
          where: { id },
          select: CHARACTER_BASE_SELECT,
        })
      }
    }

    if (!character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }

    const relatedProjects = getCharacterProjects(character)

    if (authorizedProject) {
      const hasDirectRelation = relatedProjects.some(
        (project) => project.id === authorizedProject.id
      )

      if (!hasDirectRelation) {
        const hasFallbackAccess = await hasCharacterAccessForProject(
          id,
          authorizedProject.id
        )
        if (!hasFallbackAccess) {
          return NextResponse.json(
            { error: 'Character not accessible with this API key' },
            { status: 403 }
          )
        }
      }
    }

    return NextResponse.json({
      character: toApiCharacter(character),
      projects: relatedProjects.map((project) => ({
        id: project.id,
        name: project.name,
        apiKey: project.apiKey,
        createdAt: project.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error('[API] Character fetch-by-id error:', error)
    return NextResponse.json({ error: 'Failed to fetch character' }, { status: 500 })
  }
}
