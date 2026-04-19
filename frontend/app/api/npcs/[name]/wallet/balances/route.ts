import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { resolveProjectAndCharacter } from '@/lib/npc-resolver'

const KITE_RPC = process.env.KITE_AA_RPC_URL ?? 'https://rpc-testnet.gokite.ai'

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function name() view returns (string)',
]

/**
 * GET /api/npcs/[name]/wallet/balances
 * Fetch native gas tokens and ERC20 token balances.
 * ?tokens=0xABC,0xDEF  (optional comma-separated ERC20 addresses)
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
    const provider = new ethers.JsonRpcProvider(KITE_RPC)
    const walletAddress = character.walletAddress

    let nativeBalance = '0'
    let nativeBalanceFormatted = '0'
    try {
      const raw = await provider.getBalance(walletAddress)
      nativeBalance = raw.toString()
      nativeBalanceFormatted = ethers.formatEther(raw)
    } catch (err) {
      console.warn('[wallet/balances] Native balance fetch failed:', err)
    }

    const url = new URL(request.url)
    const tokenAddresses = url.searchParams
      .get('tokens')
      ?.split(',')
      .map((t) => t.trim())
      .filter((t) => ethers.isAddress(t)) ?? []

    const tokenBalances: Array<{
      address: string
      name: string
      symbol: string
      decimals: number
      balance: string
      balanceFormatted: string
    }> = []

    for (const tokenAddr of tokenAddresses) {
      try {
        const contract = new ethers.Contract(tokenAddr, ERC20_ABI, provider)
        const [balance, symbol, decimals, tokenName] = await Promise.all([
          contract.balanceOf(walletAddress),
          contract.symbol(),
          contract.decimals(),
          contract.name(),
        ])
        tokenBalances.push({
          address: tokenAddr,
          name: tokenName,
          symbol,
          decimals: Number(decimals),
          balance: balance.toString(),
          balanceFormatted: ethers.formatUnits(balance, decimals),
        })
      } catch (err) {
        console.warn(`[wallet/balances] ERC20 fetch failed for ${tokenAddr}:`, err)
        tokenBalances.push({
          address: tokenAddr,
          name: 'Unknown',
          symbol: 'UNK',
          decimals: 18,
          balance: '0',
          balanceFormatted: '0',
        })
      }
    }

    return NextResponse.json({
      npcId: character.id,
      npcName: character.name,
      walletAddress,
      chainId: character.aaChainId,
      native: { symbol: 'PYUSD', balance: nativeBalance, balanceFormatted: nativeBalanceFormatted },
      tokens: tokenBalances,
      fetchedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[API] Wallet balances error:', error)
    return NextResponse.json({ error: 'Failed to fetch wallet balances' }, { status: 500 })
  }
}