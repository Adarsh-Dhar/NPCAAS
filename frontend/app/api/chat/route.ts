import { NextRequest, NextResponse } from 'next/server'
import { kiteAgentClient } from '@/lib/kite-sdk'

/**
 * POST /api/chat
 * Process a chat message from the user to the NPC agent
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { characterId, message } = body

    if (!characterId || !message) {
      return NextResponse.json(
        { error: 'characterId and message are required' },
        { status: 400 }
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
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[API] Chat error:', error)
    return NextResponse.json(
      { error: 'Failed to process chat request' },
      { status: 500 }
    )
  }
}
