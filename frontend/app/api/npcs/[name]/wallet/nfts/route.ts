import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { resolveProjectAndCharacter } from '@/lib/npc-resolver'

const KITE_RPC = process.env.KITE_AA_RPC_URL ?? 'https://rpc-testnet.gokite.ai'

const ERC721_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
]

const ERC1155_ABI = [
  'function balanceOf(address account, uint256 id) view returns (uint256)',
  'function uri(uint256 id) view returns (string)',
]

/**
 * GET /api/npcs/[name]/wallet/nfts
 * Fetch NFTs owned by the NPC.
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
    const contractAddresses = url.searchParams
      .get('contracts')
      ?.split(',')
      .map((t) => t.trim())
      .filter((t) => ethers.isAddress(t)) ?? []

    const nftType = url.searchParams.get('type') ?? '721'
    const tokenIds = url.searchParams
      .get('tokenIds')
      ?.split(',')
      .map((t) => t.trim())
      .filter(Boolean) ?? []

    const walletAddress = character.walletAddress
    const provider = new ethers.JsonRpcProvider(KITE_RPC)

    const nfts: Array<{
      contractAddress: string
      name: string
      symbol: string
      tokenId: string
      uri: string
      type: string
    }> = []

    for (const contractAddr of contractAddresses) {
      if (nftType === '1155') {
        try {
          const contract = new ethers.Contract(contractAddr, ERC1155_ABI, provider)
          for (const tokenId of tokenIds) {
            try {
              const balance = await contract.balanceOf(walletAddress, tokenId)
              if (balance > BigInt(0)) {
                const uri = await contract.uri(tokenId).catch(() => '')
                nfts.push({ contractAddress: contractAddr, name: 'ERC-1155', symbol: '1155', tokenId, uri, type: 'ERC-1155' })
              }
            } catch { /* skip */ }
          }
        } catch (err) {
          console.warn(`[wallet/nfts] ERC-1155 check failed for ${contractAddr}:`, err)
        }
      } else {
        try {
          const contract = new ethers.Contract(contractAddr, ERC721_ABI, provider)
          const [balance, name, symbol] = await Promise.all([
            contract.balanceOf(walletAddress),
            contract.name().catch(() => 'Unknown'),
            contract.symbol().catch(() => 'NFT'),
          ])
          const count = Number(balance)
          for (let i = 0; i < count; i++) {
            try {
              const tokenId = await contract.tokenOfOwnerByIndex(walletAddress, i)
              const uri = await contract.tokenURI(tokenId).catch(() => '')
              nfts.push({ contractAddress: contractAddr, name, symbol, tokenId: tokenId.toString(), uri, type: 'ERC-721' })
            } catch { /* skip */ }
          }
        } catch (err) {
          console.warn(`[wallet/nfts] ERC-721 check failed for ${contractAddr}:`, err)
        }
      }
    }

    return NextResponse.json({
      npcId: character.id,
      npcName: character.name,
      walletAddress,
      chainId: character.aaChainId,
      nfts,
      totalCount: nfts.length,
      fetchedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[API] Wallet NFTs error:', error)
    return NextResponse.json({ error: 'Failed to fetch NFTs' }, { status: 500 })
  }
}