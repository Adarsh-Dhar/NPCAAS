import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey } from '@/lib/api-key-store'
import { parseComputeLimit, parseComputeUsage } from '@/lib/compute-budget'

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
 * GET /api/system/usage
 * Billing/compute metrics: LLM token consumption and gas spend.
 */
export async function GET(request: NextRequest) {
  try {
    const authorizedProject = await resolveAuthorizedProject(request)
    if (authorizedProject instanceof NextResponse) return authorizedProject

    const where = authorizedProject
      ? { projects: { some: { id: authorizedProject.id } } }
      : {}

    const characters = await (prisma.character as any).findMany({
      where,
      include: { projects: { select: { id: true } } },
    })

    let totalTurnCount = 0
    let totalPreferences = 0
    let activeLoops = 0
    let pendingActions = 0
    let specializationActiveCount = 0
    let totalComputeUsageTokens = BigInt(0)
    let totalComputeLimitTokens = BigInt(0)

    for (const character of characters) {
      const adaptation = asRecord(character.adaptation)
      const config = asRecord(character.config)

      totalTurnCount += typeof adaptation.turnCount === 'number' ? adaptation.turnCount : 0
      totalPreferences += Array.isArray(adaptation.preferences)
        ? adaptation.preferences.length
        : 0

      if (Boolean(adaptation.specializationActive)) {
        specializationActiveCount++
      }

      const loop = asRecord(config.autonomousLoop)
      if (Boolean(loop.active)) activeLoops++

      const queue = Array.isArray(config.actionQueue) ? config.actionQueue : []
      pendingActions += queue.length

      totalComputeUsageTokens += parseComputeUsage(character.computeUsageTokens)
      totalComputeLimitTokens += parseComputeLimit(character.computeLimitTokens ?? config.computeBudget)
    }

    const remainingComputeTokens =
      totalComputeLimitTokens > totalComputeUsageTokens
        ? totalComputeLimitTokens - totalComputeUsageTokens
        : BigInt(0)
    const usageRatio =
      totalComputeLimitTokens > BigInt(0)
        ? Number(totalComputeUsageTokens) / Number(totalComputeLimitTokens)
        : 0

    return NextResponse.json({
      projectId: authorizedProject?.id ?? 'global',
      npcs: {
        total: characters.length,
        withSpecializationActive: specializationActiveCount,
        withActiveLoop: activeLoops,
      },
      compute: {
        totalChatTurns: totalTurnCount,
        llmTokensConsumed: totalComputeUsageTokens.toString(),
        llmTokensLimit: totalComputeLimitTokens.toString(),
        llmTokensRemaining: remainingComputeTokens.toString(),
        usageRatio: Number.isFinite(usageRatio) ? Number(usageRatio.toFixed(4)) : 0,
        estimatedCost: `~$${(Number(totalComputeUsageTokens) * 0.00000015).toFixed(4)} USD`,
        totalPreferencesStored: totalPreferences,
        pendingActionsInQueue: pendingActions,
        note: 'Token counters are sourced from runtime usage accounting. Cost estimate still depends on provider pricing.',
      },
      period: {
        since: 'all-time',
        asOf: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error('[API] System usage error:', error)
    return NextResponse.json({ error: 'Failed to fetch usage metrics' }, { status: 500 })
  }
}