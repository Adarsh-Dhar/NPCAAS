import { NextRequest, NextResponse } from 'next/server'
import { kiteAAProvider } from '@/lib/kite-sdk'

// Mock database for characters
const mockCharacters: Map<string, any> = new Map()

/**
 * POST /api/characters
 * Deploys a new NPC to Kite Chain using Kite AA
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { projectId, name, config } = body

    if (!projectId || !name || !config) {
      return NextResponse.json(
        { error: 'projectId, name, and config are required' },
        { status: 400 }
      )
    }

    // Step 1: Instantiate KiteAAProvider
    const aaProvider = kiteAAProvider

    // Step 2: Create smart account (wallet) for the NPC
    const smartAccount = await aaProvider.createSmartAccount()
    const walletAddress = smartAccount.address

    // Step 3: Sponsor a transaction to fund the account
    const sponsorResult = await aaProvider.sponsorTransaction({
      to: walletAddress,
      value: '1000000000000000000', // 1 token in wei
      data: '0x',
    })

    // Step 4: Build and store character
    const characterId = `char_${Math.random().toString(36).substring(2, 11)}`
    const character = {
      id: characterId,
      projectId,
      name,
      walletAddress,
      config,
      isDeployedOnChain: true,
      deploymentTxHash: sponsorResult.txHash,
      createdAt: new Date().toISOString(),
    }

    mockCharacters.set(characterId, character)

    return NextResponse.json(
      {
        message: `Deployed ${name} to Kite Chain with wallet ${walletAddress.slice(0, 6)}...`,
        character,
        walletAddress,
        txHash: sponsorResult.txHash,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[API] Character deployment error:', error)
    return NextResponse.json(
      { error: 'Failed to deploy character' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/characters
 * Fetch characters by project ID
 */
export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get('projectId')

    if (projectId) {
      const chars = Array.from(mockCharacters.values()).filter(
        (c) => c.projectId === projectId
      )
      return NextResponse.json({ characters: chars, count: chars.length })
    }

    const characters = Array.from(mockCharacters.values())
    return NextResponse.json({ characters, count: characters.length })
  } catch (error) {
    console.error('[API] Character fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch characters' },
      { status: 500 }
    )
  }
}
