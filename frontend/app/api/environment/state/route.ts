import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey } from '@/lib/api-key-store'
import { ethers } from 'ethers'

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

const KITE_RPC = process.env.KITE_AA_RPC_URL ?? 'https://rpc-testnet.gokite.ai'

/**
 * GET /api/environment/state
 * Read the global environment state.
 * Returns: network info, gas fees, online NPCs, NPC count per project.
 *
 * Query params:
 *   ?include=gas,npcs,network  (comma-separated, default: all)
 */
export async function GET(request: NextRequest) {
  try {
    const authorizedProject = await resolveAuthorizedProject(request)
    if (authorizedProject instanceof NextResponse) return authorizedProject

    const url = new URL(request.url)
    const include = url.searchParams.get('include')?.split(',') ?? ['gas', 'npcs', 'network']

    const state: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
    }

    // Network + gas
    if (include.includes('gas') || include.includes('network')) {
      try {
        const provider = new ethers.JsonRpcProvider(KITE_RPC)
        const [feeData, blockNumber, network] = await Promise.all([
          provider.getFeeData(),
          provider.getBlockNumber(),
          provider.getNetwork(),
        ])

        if (include.includes('network')) {
          state.network = {
            chainId: network.chainId.toString(),
            name: network.name,
            blockNumber,
            rpcUrl: KITE_RPC,
          }
        }

        if (include.includes('gas')) {
          state.gas = {
            gasPrice: feeData.gasPrice?.toString() ?? null,
            gasPriceGwei: feeData.gasPrice
              ? ethers.formatUnits(feeData.gasPrice, 'gwei')
              : null,
            maxFeePerGas: feeData.maxFeePerGas?.toString() ?? null,
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString() ?? null,
          }
        }
      } catch (rpcErr) {
        state.network = { error: 'RPC unavailable', rpcUrl: KITE_RPC }
        state.gas = { error: 'Unable to fetch gas data' }
      }
    }

    // NPC state
    if (include.includes('npcs')) {
      const where = authorizedProject
        ? { projects: { some: { id: authorizedProject.id } } }
        : {}

      const characters = await (prisma.character as any).findMany({
        where,
        include: { projects: { select: { id: true } } },
        orderBy: { createdAt: 'desc' as const },
      })

      const onlineNpcs = characters.filter((c: any) => {
        const config = asRecord(c.config)
        const loop = asRecord(config.autonomousLoop)
        return Boolean(loop.active)
      })

      state.npcs = {
        total: characters.length,
        online: onlineNpcs.length,
        sleeping: characters.length - onlineNpcs.length,
        onlineIds: onlineNpcs.map((c: any) => c.id),
      }
    }

    return NextResponse.json(state)
  } catch (error) {
    console.error('[API] Environment state error:', error)
    return NextResponse.json({ error: 'Failed to fetch environment state' }, { status: 500 })
  }
}