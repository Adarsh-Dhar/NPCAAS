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

const normalizeAdaptation = (config: any, existing: any = {}) => ({
  specializationActive: Boolean(existing.specializationActive),
  turnCount: typeof existing.turnCount === 'number' ? existing.turnCount : 0,
  preferences: Array.isArray(existing.preferences) ? existing.preferences : [],
  summary:
    typeof existing.summary === 'string' && existing.summary.trim()
      ? existing.summary
      : 'No adaptation history yet.',
  lastUpdatedAt: new Date().toISOString(),
  pendingSection2: existing.pendingSection2,
  configSnapshot: {
    systemPrompt: typeof config?.systemPrompt === 'string' ? config.systemPrompt : '',
    openness: typeof config?.openness === 'number' ? config.openness : 50,
  },
})

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
      adaptation: {
        specializationActive: false,
        turnCount: 0,
        preferences: [],
        summary: 'No adaptation history yet.',
        lastUpdatedAt: new Date().toISOString(),
      },
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
 * PATCH /api/characters
 * Updates an existing deployed NPC configuration
 */
export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    let project: { id: string } | null = null

    if (authHeader) {
      if (!authHeader.startsWith('Bearer ')) {
        return NextResponse.json(
          { error: 'Missing or malformed Authorization header. Use: Bearer gc_live_...' },
          { status: 401 }
        )
      }

      const apiKey = authHeader.replace('Bearer ', '').trim()
      project = await validateApiKey(apiKey)

      if (!project) {
        return NextResponse.json(
          { error: 'Invalid API key' },
          { status: 401 }
        )
      }
    }

    const body = await request.json()
    const { projectId, characterId, config } = body

    if (!projectId || !characterId || !config) {
      return NextResponse.json(
        { error: 'projectId, characterId, and config are required' },
        { status: 400 }
      )
    }

    if (project && project.id !== projectId) {
      return NextResponse.json(
        { error: 'Character project does not match API key project' },
        { status: 403 }
      )
    }

    const characters = readCharacters()
    const character = characters[characterId]

    if (!character) {
      return NextResponse.json(
        { error: 'Character not found' },
        { status: 404 }
      )
    }

    if (character.projectId !== projectId) {
      return NextResponse.json(
        { error: 'Character not accessible for this project' },
        { status: 403 }
      )
    }

    character.config = config
    character.adaptation = normalizeAdaptation(config, character.adaptation)
    characters[characterId] = character
    writeCharacters(characters)

    return NextResponse.json({
      message: `Updated ${character.name} configuration`,
      character,
    })
  } catch (error) {
    console.error('[API] Character update error:', error)
    return NextResponse.json(
      { error: 'Failed to update character' },
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
