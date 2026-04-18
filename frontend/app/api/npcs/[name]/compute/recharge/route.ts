import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { prisma } from '@/lib/prisma'

// Constants
const KITE_TOKENS_PER_USD = 1000
const RPC_URL = process.env.KITE_RPC_URL || 'https://rpc-testnet.gokite.ai'
const KITE_USD_TOKEN_ADDRESS = process.env.KITE_USD_TOKEN_ADDRESS

interface RechargeRequest {
  kiteUsdAmount: number
}

interface RechargeResponse {
  success: boolean
  error?: string
  newBalance?: {
    computeLimitTokens: number
    computeUsageTokens: number
    remainingTokens: number
    kiteUsdWalletBalance: string
  }
  transaction?: {
    txHash?: string
    computeTokensAwarded: number
    timestamp: string
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { name: string } }
): Promise<NextResponse<RechargeResponse>> {
  try {
    const { name } = params
    const body: RechargeRequest = await request.json()
    const { kiteUsdAmount } = body

    // Validate input
    if (!kiteUsdAmount || kiteUsdAmount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid amount. Must be greater than 0.' },
        { status: 400 }
      )
    }

    if (kiteUsdAmount > 10000) {
      return NextResponse.json(
        { success: false, error: 'Recharge amount exceeds maximum limit (10000 USD).' },
        { status: 400 }
      )
    }

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
      return NextResponse.json(
        { success: false, error: 'Failed to verify wallet balance. Please try again.' },
        { status: 500 }
      )
    }

    // Note: In demo mode, we're simulating wallet deduction.
    // In production, this would execute an AA transaction to transfer KITE_USD.
    // For now, we check that user has enough balance (visual validation).
    const balanceNum = parseFloat(walletBalance)
    if (balanceNum < kiteUsdAmount) {
      return NextResponse.json(
        { success: false, error: `Insufficient wallet balance. Available: ${walletBalance} KITE_USD` },
        { status: 400 }
      )
    }

    const computeTokensToAward = BigInt(kiteUsdAmount * KITE_TOKENS_PER_USD)
    const priorBalance = character.computeLimitTokens
    const newBalance = priorBalance + computeTokensToAward

    // Update character compute limit (additive)
    const updatedCharacter = await prisma.character.update({
      where: { id: character.id },
      data: {
        computeLimitTokens: newBalance,
      },
    })

    // Log the recharge transaction
    const log = await prisma.npcLog.create({
      data: {
        characterId: character.id,
        eventType: 'COMPUTE_RECHARGE',
        kiteUsdAmount: parseFloat(kiteUsdAmount.toString()),
        computeTokensAwarded: computeTokensToAward,
        balanceAfter: newBalance,
        details: {
          action: 'compute_recharge',
          priorBalance: priorBalance.toString(),
          newBalance: newBalance.toString(),
          computeTokensAwarded: computeTokensToAward.toString(),
          kiteUsdAmount,
          rechargeTimestamp: new Date().toISOString(),
        },
      },
    })

    return NextResponse.json({
      success: true,
      newBalance: {
        computeLimitTokens: parseInt(newBalance.toString()),
        computeUsageTokens: parseInt(updatedCharacter.computeUsageTokens.toString()),
        remainingTokens: parseInt((newBalance - updatedCharacter.computeUsageTokens).toString()),
        kiteUsdWalletBalance: walletBalance,
      },
      transaction: {
        computeTokensAwarded: parseInt(computeTokensToAward.toString()),
        timestamp: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error('Recharge error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
