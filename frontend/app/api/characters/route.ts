import { NextRequest, NextResponse } from 'next/server'
import { kiteAAProvider } from '@/lib/kite-sdk'
import { validateApiKey } from '@/lib/api-key-store'
import * as fs from 'fs'
import * as path from 'path'

// Get characters storage file path
const getStoragePath = () => {
  const storagePath = path.join(process.cwd(), 'tmp', 'characters.json')
  return storagePath
}

// Ensure tmp directory exists
const ensureStorageDir = () => {
  const dir = path.join(process.cwd(), 'tmp')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

// Read characters from storage
const readCharacters = (): Record<string, any> => {
  try {
    ensureStorageDir()
    const storagePath = getStoragePath()
    if (fs.existsSync(storagePath)) {
      const data = fs.readFileSync(storagePath, 'utf-8')
      return JSON.parse(data)
    }
  } catch (error) {
    console.error('[API] Failed to read characters:', error)
  }
  return {}
}

// Write characters to storage
const writeCharacters = (characters: Record<string, any>) => {
  try {
    ensureStorageDir()
    const storagePath = getStoragePath()
    fs.writeFileSync(storagePath, JSON.stringify(characters, null, 2), 'utf-8')
  } catch (error) {
    console.error('[API] Failed to write characters:', error)
  }
}

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

    const characters = readCharacters()
    characters[characterId] = character
    writeCharacters(characters)

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
 * Fetch characters by API key (Bearer token authentication)
 */
export async function GET(request: NextRequest) {
  try {
    // --- Authenticate via API Key ---
    const authHeader = request.headers.get('Authorization')

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or malformed Authorization header. Use: Bearer gc_live_...' },
        { status: 401 }
      )
    }

    const apiKey = authHeader.replace('Bearer ', '').trim()
    const project = await validateApiKey(apiKey)

    if (!project) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      )
    }

    // --- Fetch characters for this project ---
    const characters = readCharacters()
    const chars = Object.values(characters).filter(
      (c: any) => c.projectId === project.id
    )

    return NextResponse.json(chars)
  } catch (error) {
    console.error('[API] Character fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch characters' },
      { status: 500 }
    )
  }
}

// Export for use in other routes
export { readCharacters, writeCharacters }
