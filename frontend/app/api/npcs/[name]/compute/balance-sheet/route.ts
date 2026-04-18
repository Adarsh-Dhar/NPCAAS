import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { prisma } from '@/lib/prisma'

const RPC_URL = process.env.KITE_RPC_URL || 'https://rpc-testnet.gokite.ai'
const COMPUTE_TOKEN_PRICE_USD = 0.00000015 // $0.00000015 per token

type ComputeLog = {
  id: string
  eventType: string
  createdAt: Date
  kiteUsdAmount: { toString: () => string } | null
  computeTokensAwarded: { toString: () => string } | null
  tokensUsed: { toString: () => string } | null
  estUsdCost: { toString: () => string } | null
  balanceAfter: { toString: () => string } | null
  txHash: string | null
}

interface Transaction {
  id: string
  type: string
  timestamp: string
  kiteUsdAmount?: number
  computeTokensAwarded?: number
  tokensUsed?: number
  estUsdCost?: number
  balanceAfter: number
  txHash?: string | null
}

interface BalanceSheetResponse {
  success: boolean
  error?: string
  currentBalance?: {
    computeLimitTokens: number
    computeUsageTokens: number
    remainingTokens: number
    kiteUsdWalletBalance: string
    estimatedComputePurchaseable: number
  }
  transactions?: Transaction[]
  stats?: {
    totalRechargeUsd: number
    totalRechargeTokens: number
    totalSpendTokens: number
    totalSpendUsd: string
    averageTokensPerChat: number
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { name: string } }
): Promise<NextResponse<BalanceSheetResponse>> {
  try {
    const { name } = params
    const searchParams = request.nextUrl.searchParams
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500)
    const type = searchParams.get('type') // 'COMPUTE_SPEND', 'COMPUTE_RECHARGE', or null for all

    // Fetch NPC character
    const character = await prisma.character.findFirst({
      where: { name },
    })

    if (!character) {
      return NextResponse.json(
        { success: false, error: 'NPC not found.' },
        { status: 404 }
      )
    }

    // Fetch live wallet balance from RPC
    let walletBalance = '0'
    try {
      const provider = new ethers.JsonRpcProvider(RPC_URL)
      const rawBalance = await provider.getBalance(character.walletAddress)
      walletBalance = ethers.formatEther(rawBalance)
    } catch (err) {
      console.error('Failed to fetch wallet balance:', err)
      // Continue with 0 balance if RPC fails
    }

    // Fetch transaction history
    const logs = (await prisma.npcLog.findMany({
      where: {
        characterId: character.id,
        eventType: type || { in: ['COMPUTE_SPEND', 'COMPUTE_RECHARGE'] },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })) as ComputeLog[]

    // Transform logs into transactions
    const transactions: Transaction[] = logs.map((log: ComputeLog) => ({
      id: log.id,
      type: log.eventType,
      timestamp: log.createdAt.toISOString(),
      kiteUsdAmount: log.kiteUsdAmount ? parseFloat(log.kiteUsdAmount.toString()) : undefined,
      computeTokensAwarded: log.computeTokensAwarded ? parseInt(log.computeTokensAwarded.toString()) : undefined,
      tokensUsed: log.tokensUsed ? parseInt(log.tokensUsed.toString()) : undefined,
      estUsdCost: log.estUsdCost ? parseFloat(log.estUsdCost.toString()) : undefined,
      balanceAfter: log.balanceAfter ? parseInt(log.balanceAfter.toString()) : 0,
      txHash: log.txHash,
    }))

    // Calculate statistics
    const recharges = logs.filter((l: ComputeLog) => l.eventType === 'COMPUTE_RECHARGE')
    const spends = logs.filter((l: ComputeLog) => l.eventType === 'COMPUTE_SPEND')

    const totalRechargeUsd = recharges.reduce((sum: number, log: ComputeLog) => {
      return sum + (log.kiteUsdAmount ? parseFloat(log.kiteUsdAmount.toString()) : 0)
    }, 0)

    const totalRechargeTokens = recharges.reduce((sum: number, log: ComputeLog) => {
      return sum + (log.computeTokensAwarded ? parseInt(log.computeTokensAwarded.toString()) : 0)
    }, 0)

    const totalSpendTokens = spends.reduce((sum: number, log: ComputeLog) => {
      return sum + (log.tokensUsed ? parseInt(log.tokensUsed.toString()) : 0)
    }, 0)

    const totalSpendUsd = (totalSpendTokens * COMPUTE_TOKEN_PRICE_USD).toFixed(8)

    const averageTokensPerChat = spends.length > 0 ? Math.round(totalSpendTokens / spends.length) : 0

    const remainingTokens = character.computeLimitTokens - character.computeUsageTokens
    const walletBalanceNum = parseFloat(walletBalance)
    const estimatedComputePurchaseable = Math.floor(walletBalanceNum * 1000) // 1 USD = 1000 tokens

    return NextResponse.json({
      success: true,
      currentBalance: {
        computeLimitTokens: parseInt(character.computeLimitTokens.toString()),
        computeUsageTokens: parseInt(character.computeUsageTokens.toString()),
        remainingTokens: parseInt(remainingTokens.toString()),
        kiteUsdWalletBalance: walletBalance,
        estimatedComputePurchaseable,
      },
      transactions: transactions.reverse(), // Return in ascending order (oldest first)
      stats: {
        totalRechargeUsd,
        totalRechargeTokens,
        totalSpendTokens,
        totalSpendUsd,
        averageTokensPerChat,
      },
    })
  } catch (error) {
    console.error('Balance sheet error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
