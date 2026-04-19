import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey } from '@/lib/api-key-store'
import { kiteAgentClient } from '@/lib/kite-sdk'

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

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

/**
 * POST /api/environment/broadcast
 * Send a message to all NPCs in a "room" or project simultaneously.
 * Each NPC processes the message through the LLM and produces a reaction.
 *
 * Body:
 * {
 *   message: string      // broadcast message/event
 *   room?: string        // optional room/game ID (defaults to all NPCs in project)
 *   npcIds?: string[]    // optional explicit list of NPC IDs to address
 *   reactAsync?: boolean // default: false — wait for all reactions
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const authorizedProject = await resolveAuthorizedProject(request)
    if (authorizedProject instanceof NextResponse) return authorizedProject

    const body = await request.json()
    const { message, room, npcIds, reactAsync = false } = body

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'message (string) is required' }, { status: 400 })
    }

    // Find target NPCs
    let characters: any[]

    if (npcIds && Array.isArray(npcIds) && npcIds.length > 0) {
      characters = await (prisma.character as any).findMany({
        where: {
          id: { in: npcIds },
          ...(authorizedProject
            ? { projects: { some: { id: authorizedProject.id } } }
            : {}),
        },
        select: { id: true, name: true, config: true },
      })
    } else if (room) {
      // room maps to a project/game ID
      characters = await (prisma.character as any).findMany({
        where: { projects: { some: { id: room } } },
        select: { id: true, name: true, config: true },
      })
    } else if (authorizedProject) {
      characters = await (prisma.character as any).findMany({
        where: { projects: { some: { id: authorizedProject.id } } },
        select: { id: true, name: true, config: true },
      })
    } else {
      return NextResponse.json(
        { error: 'Provide room, npcIds, or an API key to target NPCs' },
        { status: 400 }
      )
    }

    if (characters.length === 0) {
      return NextResponse.json({
        message: 'Broadcast sent (no NPCs in target audience).',
        recipientCount: 0,
        reactions: [],
      })
    }

    if (reactAsync) {
      // Fire-and-forget — return immediately
      return NextResponse.json({
        message: 'Broadcast dispatched asynchronously.',
        recipientCount: characters.length,
        npcIds: characters.map((c: any) => c.id),
        broadcastAt: new Date().toISOString(),
      })
    }

    // Collect reactions synchronously (limit to 10 NPCs to avoid timeout)
    const targets = characters.slice(0, 10)
    const reactions = await Promise.allSettled(
      targets.map(async (character: any) => {
        const config = asRecord(character.config)
        kiteAgentClient.registerTools([])
        const response = await kiteAgentClient.chat(
          `[BROADCAST]: ${message}`,
          {
            characterName: character.name,
            systemPrompt:
              typeof config.systemPrompt === 'string' ? config.systemPrompt : undefined,
            openness: typeof config.openness === 'number' ? config.openness : undefined,
            canTrade: false, // broadcasts don't trigger trades
          }
        )
        return {
          npcId: character.id,
          npcName: character.name,
          reaction: response.text,
          action: response.action ?? null,
        }
      })
    )

    const results = reactions.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : { npcId: targets[i].id, npcName: targets[i].name, reaction: null, error: 'Reaction failed' }
    )

    return NextResponse.json({
      message: 'Broadcast sent.',
      recipientCount: characters.length,
      reactedCount: results.filter((r) => r.reaction !== null).length,
      broadcastAt: new Date().toISOString(),
      reactions: results,
    })
  } catch (error) {
    console.error('[API] Environment broadcast error:', error)
    return NextResponse.json({ error: 'Failed to broadcast message' }, { status: 500 })
  }
}