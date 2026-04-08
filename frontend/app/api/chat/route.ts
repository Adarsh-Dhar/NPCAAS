import { NextRequest, NextResponse } from 'next/server'
import { kiteAgentClient } from '@/lib/kite-sdk'
import { validateApiKey } from '@/lib/api-key-store'

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:8080',
  'https://your-game-studio.com',
]

function getCorsHeaders(origin: string | null) {
  const allowedOrigin =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin')
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  })
}

/**
 * POST /api/chat
 * Process a chat message from the user to the NPC agent
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  const authHeader = request.headers.get('Authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Missing or malformed Authorization header. Use: Bearer gc_live_...' },
      { status: 401, headers: corsHeaders }
    )
  }

  const apiKey = authHeader.replace('Bearer ', '').trim()
  const project = await validateApiKey(apiKey)

  if (!project) {
    return NextResponse.json(
      { error: 'Invalid API key' },
      { status: 401, headers: corsHeaders }
    )
  }

  try {
    const body = await request.json()
    const { characterId, message } = body

    if (!characterId || !message) {
      return NextResponse.json(
        { error: 'characterId and message are required' },
        { status: 400, headers: corsHeaders }
      )
    }

    // Step 1: Instantiate KiteAgentClient
    const agent = kiteAgentClient

    // Step 2: Register tools available to the agent
    agent.registerTools([
      'get_payer_addr',
      'approve_payment',
      'check_inventory',
      'execute_trade',
    ])

    // Step 3: Call agent.chat() with the user's message
    const agentResponse = await agent.chat(message)

    // Step 4: Return the response with optional tradeIntent
    return NextResponse.json(
      {
        success: true,
        response: agentResponse.text,
        characterId,
        tradeIntent: agentResponse.tradeIntent,
        timestamp: new Date().toISOString(),
        projectId: project.id,
      },
      { status: 200, headers: corsHeaders }
    )
  } catch (error) {
    console.error('[API] Chat error:', error)
    return NextResponse.json(
      { error: 'Failed to process chat request' },
      { status: 500, headers: corsHeaders }
    )
  }
}
