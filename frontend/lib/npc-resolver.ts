/**
 * lib/npc-resolver.ts
 *
 * Shared helper used by all /api/npcs/[name]/... routes.
 * Resolves a character by semantic name within the authenticated project.
 *
 * The dynamic route segment is `[name]` — the NPC's display name, e.g. "scrap"
 * or "cipher". Names are stored uppercase with underscores; lookup is
 * case-insensitive via normalisation.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey } from '@/lib/api-key-store'

export interface AuthorisedProject {
  id: string
  name: string
  apiKey: string
  createdAt: string
}

/**
 * Extract and validate the Bearer API key from the request.
 * Returns the project on success, or a NextResponse error.
 */
export async function resolveAuthorisedProject(
  request: NextRequest
): Promise<AuthorisedProject | NextResponse> {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader) {
    return NextResponse.json(
      { error: 'Missing Authorization header. Use: Bearer gc_live_...' },
      { status: 401 }
    )
  }
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Malformed Authorization header. Use: Bearer gc_live_...' },
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

/**
 * Normalise an NPC name for DB lookup.
 * "Scrap" → "SCRAP", "my npc" → "MY_NPC"
 */
export function normaliseNpcName(name: string): string {
  return name.trim().toUpperCase().replace(/\s+/g, '_')
}

export interface ResolvedCharacter {
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
  updatedAt: Date
  projects: Array<{ id: string }>
}

/**
 * Find a character by (name, projectId).
 * Returns the character or a NextResponse 404/403.
 */
export async function resolveCharacterByName(
  npcName: string,
  projectId: string
): Promise<ResolvedCharacter | NextResponse> {
  // First, attempt lookup by unique id (tests use character IDs in routes).
  try {
    const byId = await (prisma.character as any).findUnique({
      where: { id: npcName },
      include: { projects: { select: { id: true } } },
    })

    if (byId) {
      // Ensure the character belongs to the authorised project
      if (byId.projects && Array.isArray(byId.projects)) {
        const found = byId.projects.some((p: any) => p.id === projectId)
        if (found) return byId as ResolvedCharacter
      }
      return NextResponse.json(
        { error: `NPC '${npcName}' not found in this project.` },
        { status: 404 }
      )
    }
  } catch (err) {
    // ignore and fall back to name-based lookup
  }

  const normalisedName = normaliseNpcName(npcName)

  const character = await (prisma.character as any).findFirst({
    where: {
      name: normalisedName,
      projects: { some: { id: projectId } },
    },
    include: { projects: { select: { id: true } } },
  })

  if (!character) {
    return NextResponse.json(
      { error: `NPC '${npcName}' not found in this project.` },
      { status: 404 }
    )
  }

  return character as ResolvedCharacter
}

/**
 * Combined: validate API key + resolve character by name.
 * Returns { project, character } or a NextResponse error.
 */
export async function resolveProjectAndCharacter(
  request: NextRequest,
  npcName: string
): Promise<{ project: AuthorisedProject; character: ResolvedCharacter } | NextResponse> {
  const projectOrError = await resolveAuthorisedProject(request)
  if (projectOrError instanceof NextResponse) return projectOrError

  const characterOrError = await resolveCharacterByName(npcName, projectOrError.id)
  if (characterOrError instanceof NextResponse) return characterOrError

  return { project: projectOrError, character: characterOrError }
}

export function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}