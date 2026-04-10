import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveProjectAndCharacter, asRecord } from '@/lib/npc-resolver'

/**
 * GET /api/npcs/[name]/logs
 * Get a chronological ledger of everything the NPC has done.
 * Reads from the NpcLog table (real DB records) and supplements with
 * synthetic entries derived from stored config state.
 *
 * Query params:
 *   ?limit=50        (default: 50, max: 200)
 *   ?type=CHAT|TRADE|BROADCAST|all  (default: all)
 *   ?since=ISO_DATE
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await context.params
    const result = await resolveProjectAndCharacter(request, name)
    if (result instanceof NextResponse) return result

    const { character } = result
    const url = new URL(request.url)
    const limit = Math.min(Number(url.searchParams.get('limit') ?? '50'), 200)
    const type = url.searchParams.get('type') ?? 'all'
    const since = url.searchParams.get('since')

    // Query real NpcLog records
    const dbWhere: Record<string, unknown> = { characterId: character.id }
    if (type !== 'all') dbWhere.eventType = type.toUpperCase()
    if (since) dbWhere.createdAt = { gte: new Date(since) }

    const dbLogs = await (prisma as any).npcLog.findMany({
      where: dbWhere,
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    const config = asRecord(character.config)
    const adaptation = asRecord(character.adaptation)

    // Supplement with synthetic state-derived logs if no filter applied
    let syntheticLogs: Array<{
      id: string
      type: string
      timestamp: string
      summary: string
      details?: Record<string, unknown>
    }> = []

    if (type === 'all') {
      // Deployment log
      syntheticLogs.push({
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

      // Specialization activation
      if (Boolean(adaptation.specializationActive)) {
        syntheticLogs.push({
          id: `log_spec_${character.id}`,
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
        syntheticLogs.push({
          id: `log_loop_start_${character.id}`,
          type: 'loop_start',
          timestamp: String(loop.startedAt),
          summary: `Autonomous loop started (schedule: ${loop.schedule ?? 'unset'})`,
        })
      }
      if (loop.stoppedAt) {
        syntheticLogs.push({
          id: `log_loop_stop_${character.id}`,
          type: 'loop_stop',
          timestamp: String(loop.stoppedAt),
          summary: 'Autonomous loop paused',
        })
      }
    }

    // If a 'since' filter was provided, filter synthetic logs accordingly
    if (since) {
      const sinceDate = new Date(since).getTime()
      syntheticLogs = syntheticLogs.filter((l) => new Date(l.timestamp).getTime() >= sinceDate)
    }

    // Merge DB logs with synthetic logs, sort newest first
    const dbFormatted = dbLogs.map((log: any) => ({
      id: log.id,
      type: log.eventType,
      timestamp: log.createdAt.toISOString(),
      summary: buildLogSummary(log.eventType, log.details),
      details: log.details,
    }))

    const allLogs = [...dbFormatted, ...syntheticLogs].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )

    const paginated = allLogs.slice(0, limit)

    return NextResponse.json({
      npcId: character.id,
      npcName: character.name,
      totalLogs: allLogs.length,
      returnedLogs: paginated.length,
      logs: paginated,
    })
  } catch (error) {
    console.error('[API] NPC logs error:', error)
    return NextResponse.json({ error: 'Failed to fetch NPC logs' }, { status: 500 })
  }
}

function buildLogSummary(eventType: string, details: Record<string, unknown>): string {
  switch (eventType) {
    case 'CHAT':
      return `Chat: "${String(details.message ?? '').slice(0, 60)}"`
    case 'TRADE':
      return `Trade: ${details.item} for ${details.price} ${details.currency}`
    case 'BROADCAST':
      return `Broadcast received: "${String(details.message ?? '').slice(0, 60)}"`
    case 'SECTION2_PARSED':
      return 'Section 2 cognitive profile parsed'
    case 'SECTION2_ACTIVATED':
      return `Section 2 activated (openness: ${details.openness})`
    case 'MEMORY_INJECT':
      return `Memory injected: ${details.injectedCount} items`
    default:
      return eventType
  }
}