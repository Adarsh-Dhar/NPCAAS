import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateApiKey } from '@/lib/api-key-store'
import { executeWriteTransaction } from '@/lib/tx-orchestrator'
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

/**
 * POST /api/npcs/:id/wallet/interact
 * Command the NPC to interact with an arbitrary smart contract.
 *
 * Body (two modes):
 *
 * Mode A — raw calldata:
 * {
 *   contractAddress: string   // target contract
 *   calldata: string          // ABI-encoded hex calldata
 *   value?: string            // optional native token value (ether units)
 * }
 *
 * Mode B — ABI + args (auto-encode):
 * {
 *   contractAddress: string
 *   abi: any[]                // fragment or full ABI array
 *   functionName: string
 *   args?: any[]
 *   value?: string
 * }
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

    const body = await request.json()
    const { contractAddress, calldata, abi, functionName, args = [], value } = body

    if (!contractAddress || !ethers.isAddress(contractAddress)) {
      return NextResponse.json({ error: 'Valid contractAddress is required' }, { status: 400 })
    }

    let encodedCalldata: string

    if (calldata) {
      // Mode A: raw calldata
      if (typeof calldata !== 'string' || !calldata.startsWith('0x')) {
        return NextResponse.json({ error: 'calldata must be a hex string starting with 0x' }, { status: 400 })
      }
      encodedCalldata = calldata
    } else if (abi && functionName) {
      // Mode B: encode from ABI
      try {
        const iface = new ethers.Interface(Array.isArray(abi) ? abi : [abi])
        encodedCalldata = iface.encodeFunctionData(functionName, args)
      } catch (encodeError) {
        return NextResponse.json(
          { error: `ABI encoding failed: ${encodeError instanceof Error ? encodeError.message : 'unknown'}` },
          { status: 400 }
        )
      }
    } else {
      return NextResponse.json(
        { error: 'Provide either (calldata) or (abi + functionName)' },
        { status: 400 }
      )
    }

    const parsedValue = value
      ? ethers.parseEther(value.toString()).toString()
      : '0'

    const ownerId = character.smartAccountId ?? `character:${character.id}`

    const execution = await executeWriteTransaction({
      to: contractAddress,
      value: parsedValue,
      data: encodedCalldata,
      ownerId,
    })

    return NextResponse.json({
      success: true,
      npcId: id,
      contractAddress,
      functionName: functionName ?? '(raw calldata)',
      mode: execution.mode,
      sponsored: execution.sponsored,
      txHash: execution.txHash,
      userOpHash: execution.userOpHash,
      status: execution.status,
      sponsorError: execution.sponsorError,
    })
  } catch (error) {
    console.error('[API] Wallet interact error:', error)
    return NextResponse.json({ error: 'Failed to execute contract interaction' }, { status: 500 })
  }
}