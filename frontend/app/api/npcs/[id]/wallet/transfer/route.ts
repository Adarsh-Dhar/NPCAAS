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

// Minimal ERC-20 ABI for transfer
const ERC20_TRANSFER_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
]

// Minimal ERC-721 ABI for transfer
const ERC721_TRANSFER_ABI = [
  'function safeTransferFrom(address from, address to, uint256 tokenId)',
]

/**
 * POST /api/npcs/:id/wallet/transfer
 * Command the NPC to send tokens or NFTs to a specific address.
 *
 * Body:
 * {
 *   to: string              // recipient address
 *   type: "native" | "erc20" | "erc721"
 *   amount?: string         // for native/erc20 (human-readable, e.g. "1.5")
 *   tokenAddress?: string   // for erc20/erc721
 *   tokenId?: string        // for erc721
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
    const { to, type = 'native', amount, tokenAddress, tokenId } = body

    if (!to || !ethers.isAddress(to)) {
      return NextResponse.json({ error: 'Valid recipient address (to) is required' }, { status: 400 })
    }

    const ownerId = character.smartAccountId ?? `character:${character.id}`
    let txInput: { to: string; value: string; data?: string }

    if (type === 'native') {
      if (!amount) return NextResponse.json({ error: 'amount is required for native transfers' }, { status: 400 })
      txInput = {
        to,
        value: ethers.parseEther(amount.toString()).toString(),
        data: '0x',
      }
    } else if (type === 'erc20') {
      if (!tokenAddress || !ethers.isAddress(tokenAddress)) {
        return NextResponse.json({ error: 'Valid tokenAddress is required for ERC-20 transfers' }, { status: 400 })
      }
      if (!amount) return NextResponse.json({ error: 'amount is required for ERC-20 transfers' }, { status: 400 })

      const KITE_RPC = process.env.KITE_AA_RPC_URL ?? 'https://rpc-testnet.gokite.ai'
      const provider = new ethers.JsonRpcProvider(KITE_RPC)
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_TRANSFER_ABI, provider)
      const decimals = await tokenContract.decimals().catch(() => 18)
      const parsedAmount = ethers.parseUnits(amount.toString(), decimals)
      const callData = tokenContract.interface.encodeFunctionData('transfer', [to, parsedAmount])

      txInput = { to: tokenAddress, value: '0', data: callData }
    } else if (type === 'erc721') {
      if (!tokenAddress || !ethers.isAddress(tokenAddress)) {
        return NextResponse.json({ error: 'Valid tokenAddress is required for ERC-721 transfers' }, { status: 400 })
      }
      if (!tokenId) return NextResponse.json({ error: 'tokenId is required for ERC-721 transfers' }, { status: 400 })

      const nftInterface = new ethers.Interface(ERC721_TRANSFER_ABI)
      const callData = nftInterface.encodeFunctionData('safeTransferFrom', [
        character.walletAddress,
        to,
        BigInt(tokenId),
      ])

      txInput = { to: tokenAddress, value: '0', data: callData }
    } else {
      return NextResponse.json({ error: 'type must be one of: native, erc20, erc721' }, { status: 400 })
    }

    const execution = await executeWriteTransaction({ ...txInput, ownerId })

    return NextResponse.json({
      success: true,
      npcId: id,
      transfer: { to, type, amount, tokenAddress, tokenId },
      mode: execution.mode,
      sponsored: execution.sponsored,
      txHash: execution.txHash,
      status: execution.status,
    })
  } catch (error) {
    console.error('[API] Wallet transfer error:', error)
    return NextResponse.json({ error: 'Failed to execute transfer' }, { status: 500 })
  }
}