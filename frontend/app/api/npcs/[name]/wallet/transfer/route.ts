import { NextRequest, NextResponse } from 'next/server'
import { executeWriteTransaction } from '@/lib/tx-orchestrator'
import { ethers } from 'ethers'
import { resolveProjectAndCharacter } from '@/lib/npc-resolver'
import { kiteAAProvider } from '@/lib/aa-sdk'

const ERC20_TRANSFER_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
]
const ERC721_TRANSFER_ABI = [
  'function safeTransferFrom(address from, address to, uint256 tokenId)',
]

/**
 * POST /api/npcs/[name]/wallet/transfer
 * Command the NPC to send tokens or NFTs to a specific address.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await context.params
    const result = await resolveProjectAndCharacter(request, name)
    if (result instanceof NextResponse) return result

    const { character } = result
    const body = await request.json()
    const { to, type = 'native', amount, tokenAddress, tokenId } = body

    if (!to || !ethers.isAddress(to)) {
      return NextResponse.json(
        { error: 'Valid recipient address (to) is required' },
        { status: 400 }
      )
    }

    // Resolve the correct ownerId to derive the original signer.
    // Try a few candidate patterns matching how accounts were previously
    // created (e.g. `character:<name>:<timestamp>`), and pick the one that
    // reproduces the stored AA wallet address.
    async function findMatchingOwnerId() {
      const tried = new Set<string>()
      const candidates: string[] = []

      if (typeof character.smartAccountId === 'string' && character.smartAccountId.trim()) {
        candidates.push(character.smartAccountId)
      }

      // original creation used: `character:${name}:${Date.now()}` — try with createdAt
      if (character.createdAt) {
        try {
          const ts = new Date(character.createdAt).getTime()
          candidates.push(`character:${character.name}:${ts}`)
        } catch (e) {
          // ignore
        }
      }

      candidates.push(`character:${character.id}`)
      candidates.push(`character:${character.name}`)

      // Try candidates plus small timestamp offsets (in case DB createdAt vs JS Date.now differ)
      const offsets = [0, -2000, -1000, -500, 500, 1000, 2000]
      for (const base of candidates) {
        for (const off of offsets) {
          const c = base.replace(/:\d+$/,(match) => {
            // if base ends with :<digits> we will replace it below; otherwise append
            return match
          })
          let ownerCandidate = c
          // If candidate looks like character:<name>:<ts> and createdAt available, try offsets
          if (/^character:\w+:\d+$/.test(base) || base === `character:${character.name}:${new Date(character.createdAt).getTime()}`) {
            try {
              const ts = new Date(character.createdAt).getTime() + off
              ownerCandidate = `character:${character.name}:${ts}`
            } catch (e) {
              ownerCandidate = base
            }
          } else if (base.endsWith(':') || !base.includes(':')) {
            ownerCandidate = base
          }

          if (!ownerCandidate || tried.has(ownerCandidate)) continue
          tried.add(ownerCandidate)
          try {
            const candidate = await kiteAAProvider.createSmartAccount({ ownerId: ownerCandidate })
            console.debug('[ownerId-search] tried', ownerCandidate, '=>', candidate.address, 'signer:', candidate.signerAddress)
            if (candidate.address.toLowerCase() === character.walletAddress.toLowerCase()) {
              console.debug('[ownerId-search] matched ownerId', ownerCandidate)
              return ownerCandidate
            }
          } catch (e) {
            console.debug('[ownerId-search] candidate failed', ownerCandidate, e instanceof Error ? e.message : String(e))
            // ignore and try next
          }
        }
      }

      // final fallback — use stored smartAccountId if present, otherwise use character id
      return (character.smartAccountId as string) ?? `character:${character.id}`
    }

    const ownerId = await findMatchingOwnerId()
    const KITE_RPC = process.env.KITE_AA_RPC_URL ?? 'https://rpc-testnet.gokite.ai'
    let txInput: { to: string; value: string; data?: string }

    if (type === 'native') {
      if (!amount) return NextResponse.json({ error: 'amount is required for native transfers' }, { status: 400 })
      txInput = { to, value: ethers.parseEther(amount.toString()).toString(), data: '0x' }
    } else if (type === 'erc20') {
      if (!tokenAddress || !ethers.isAddress(tokenAddress)) {
        return NextResponse.json({ error: 'Valid tokenAddress is required for ERC-20 transfers' }, { status: 400 })
      }
      if (!amount) return NextResponse.json({ error: 'amount is required for ERC-20 transfers' }, { status: 400 })
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
        character.walletAddress, to, BigInt(tokenId),
      ])
      txInput = { to: tokenAddress, value: '0', data: callData }
    } else {
      return NextResponse.json({ error: 'type must be one of: native, erc20, erc721' }, { status: 400 })
    }

    const execution = await executeWriteTransaction({ ...txInput, ownerId })

    return NextResponse.json({
      success: true,
      npcId: character.id,
      npcName: character.name,
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