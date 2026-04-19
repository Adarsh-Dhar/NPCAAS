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

function deriveSignerForOwner(ownerId: string): ethers.Wallet {
  const secret = process.env.KITE_SIGNER_SECRET
  if (!secret || secret.length < 16) {
    throw new Error('KITE_SIGNER_SECRET is not set or too short.')
  }
  const privateKey = ethers.keccak256(
    ethers.toUtf8Bytes(`guildcraft:${secret}:${ownerId}`)
  )
  return new ethers.Wallet(privateKey)
}

/**
 * POST /api/npcs/:id/wallet/sign
 * Ask the NPC to cryptographically sign a message or transaction hash.
 *
 * Body:
 * {
 *   payload: string    // message or hex hash to sign
 *   type: "message" | "hash"  // default: "message"
 * }
 *
 * Note: This requires AI approval based on the NPC's persona/rules.
 * By default, signing is gated by the NPC's canTrade config flag as a proxy
 * for "allow on-chain actions". Override with allowSigning: true in config.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const authorizedProject = await resolveAuthorizedProject(request)
    if (authorizedProject instanceof NextResponse) return authorizedProject

    const character = await (prisma.character as any).findUnique({
      where: { id },
      select: {
        id: true,
        smartAccountId: true,
        config: true,
        projects: { select: { id: true } },
      },
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

    // Check NPC persona config for signing permission
    const config = character.config && typeof character.config === 'object'
      ? (character.config as Record<string, unknown>)
      : {}

    const canSign = config.allowSigning !== false && config.canTrade !== false
    if (!canSign) {
      return NextResponse.json(
        {
          error: 'This NPC is not authorized to sign payloads. Enable allowSigning in the NPC config.',
          npcId: id,
        },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { payload, type = 'message' } = body

    if (!payload || typeof payload !== 'string') {
      return NextResponse.json({ error: 'payload (string) is required' }, { status: 400 })
    }

    const ownerId = character.smartAccountId ?? `character:${character.id}`
    const signer = deriveSignerForOwner(ownerId)

    let signature: string
    if (type === 'hash') {
      // Sign raw bytes (for EIP-4337 UserOperation hashes)
      signature = await signer.signMessage(ethers.getBytes(payload))
    } else {
      // Sign as eth_sign message (prefixed)
      signature = await signer.signMessage(payload)
    }

    return NextResponse.json({
      npcId: id,
      signerAddress: signer.address,
      payload,
      type,
      signature,
      signedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[API] Wallet sign error:', error)
    return NextResponse.json({ error: 'Failed to sign payload' }, { status: 500 })
  }
}