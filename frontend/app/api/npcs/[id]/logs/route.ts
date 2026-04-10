import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey } from '@/lib/api-key-store'

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
 * GET /api/npcs/:id/logs
 * Get a chronological ledger of everything the NPC has done.
 *
 * Query params:
 *   ?limit=50       (default: 50, max: 200)
 *   ?type=chat|trade|event|all  (default: all)
 *   ?since=ISO_DATE
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const authorizedProject = await resolveAuthorizedProject(request)
    if (authorizedProject instanceof NextResponse) return authorizedProject

    const character = await (prisma.character as any).findUnique({
      where: { id },
      include: { projects: { select: { id: true } } },
    })

    if (!character) {
      return NextResponse.json({ error: 'NPC not found' }, { status: 404 })
    }

    if (
      authorizedProject &&
      !character.projects.some((p: { id: string }) => p.id === authorizedProject.id)
    ) {
      return NextResponse.json(
        { error: 'NPC not accessible with this API key' },
        { status: 403 }
      )
    }

    const url = new URL(request.url)
    const limit = Math.min(Number(url.searchParams.get('limit') ?? '50'), 200)
    const type = url.searchParams.get('type') ?? 'all'
    const since = url.searchParams.get('since')

    const config = asRecord(character.config)
    const adaptation = asRecord(character.adaptation)

    // Derive synthetic log entries from stored NPC state
    const logs: Array<{
      id: string
      type: string
      timestamp: string
      summary: string
      details?: Record<string, unknown>
    }> = []

    // Deployment log
    logs.push({
      id: `log_deploy_${character.id}`,
      type: 'deploy',
      timestamp: character.createdAt.toISOString(),
      summary: `NPC ${character.name} deployed to chain`,
      details: {
        walletAddress: character.walletAddress,
        aaProvider: character.aaProvider,
        chainId: character.aaChainId,
      },
    })

    // Config update if updatedAt differs from createdAt
    if (
      character.updatedAt &&
      character.updatedAt.getTime() !== character.createdAt.getTime()
    ) {
      logs.push({
        id: `log_config_${character.updatedAt.getTime()}`,
        type: 'config_update',
        timestamp: character.updatedAt.toISOString(),
        summary: `NPC configuration updated`,
      })
    }

    // Specialization activation
    if (Boolean(adaptation.specializationActive)) {
      logs.push({
        id: `log_spec_${id}`,
        type: 'specialization',
        timestamp:
          typeof adaptation.lastUpdatedAt === 'string'
            ? adaptation.lastUpdatedAt
            : character.updatedAt?.toISOString() ?? new Date().toISOString(),
        summary: 'Section 2 cognitive layer activated',
        details: {
          turnCount: adaptation.turnCount,
          preferenceCount: Array.isArray(adaptation.preferences)
            ? adaptation.preferences.length
            : 0,
        },
      })
    }

    // Autonomous loop state
    const loop = asRecord(config.autonomousLoop)
    if (loop.startedAt) {
      logs.push({
        id: `log_loop_start_${id}`,
        type: 'loop_start',
        timestamp: String(loop.startedAt),
        summary: `Autonomous loop started (schedule: ${loop.schedule ?? 'unset'})`,
      })
    }
    if (loop.stoppedAt) {
      logs.push({
        id: `log_loop_stop_${id}`,
        type: 'loop_stop',
        timestamp: String(loop.stoppedAt),
        summary: 'Autonomous loop paused',
      })
    }

    // Pending action queue entries
    const queue = Array.isArray(config.actionQueue) ? config.actionQueue : []
    for (const action of queue) {
      const a = asRecord(action)
      logs.push({
        id: `log_action_${a.id ?? Math.random()}`,
        type: 'action_queued',
        timestamp: String(a.enqueuedAt ?? new Date().toISOString()),
        summary: `Action queued: ${a.description ?? a.type}`,
        details: a,
      })
    }

    // Sort chronologically
    logs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    // Filter
    let filtered = logs
    if (type !== 'all') {
      filtered = logs.filter((l) => l.type === type)
    }
    if (since) {
      const sinceDate = new Date(since).getTime()
      filtered = filtered.filter((l) => new Date(l.timestamp).getTime() >= sinceDate)
    }

    const paginated = filtered.slice(-limit).reverse() // newest first

    return NextResponse.json({
      npcId: id,
      npcName: character.name,
      totalLogs: filtered.length,
      returnedLogs: paginated.length,
      logs: paginated,
    })
  } catch (error) {
    console.error('[API] NPC logs error:', error)
    return NextResponse.json({ error: 'Failed to fetch NPC logs' }, { status: 500 })
  }
}