/**
 * GuildCraft SDK
 * Drop this file into any game project to connect NPCs to your GuildCraft backend.
 *
 * Usage:
 *   const gc = new GuildCraftClient("gc_live_your_key_here")
 *   const reply = await gc.chat("char_abc123", "I want to buy a sword")
 */

export interface TradeIntent {
  item: string
  price: number
  currency: string
}

export interface Character {
  id: string
  projectId: string
  name: string
  walletAddress?: string
  config: Record<string, any>
  isDeployedOnChain?: boolean
  deploymentTxHash?: string
  createdAt: string
}

export interface ChatResponse {
  success: boolean
  response: string
  characterId: string
  tradeIntent?: TradeIntent
  timestamp: string
}

export interface ExecuteTransactionResponse {
  success: boolean
  mode: 'sponsored' | 'fallback'
  sponsored: boolean
  txHash: string
  status: 'pending' | 'success'
  message: string
  sponsorError?: string
}

export class GuildCraftClient {
  private apiKey: string
  private baseUrl: string

  constructor(apiKey: string, baseUrl = 'http://localhost:3000/api') {
    if (!apiKey || !apiKey.startsWith('gc_live_')) {
      throw new Error('Invalid GuildCraft API key. It must start with gc_live_')
    }
    this.apiKey = apiKey
    this.baseUrl = baseUrl
  }

  /**
   * Fetch all characters for this project.
   */
  async getCharacters(): Promise<Character[]> {
    const response = await fetch(`${this.baseUrl}/characters`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
    })

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}))
      throw new Error(
        `GuildCraft API error ${response.status}: ${
          (errorBody as { error?: string }).error ?? response.statusText
        }`
      )
    }

    return response.json() as Promise<Character[]>
  }

  /**
   * Send a player message to an NPC character and get an AI response.
   * @param characterId  The character ID from your GuildCraft dashboard
   * @param message      The player's input text
   */
  async chat(characterId: string, message: string): Promise<ChatResponse> {
    const response = await fetch(`${this.baseUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ characterId, message }),
    })

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}))
      throw new Error(
        `GuildCraft API error ${response.status}: ${
          (errorBody as { error?: string }).error ?? response.statusText
        }`
      )
    }

    return response.json() as Promise<ChatResponse>
  }

  /**
   * Execute a write transaction for a character.
   * Sponsor-first: the backend attempts gasless execution via Kite AA.
   */
  async executeTransaction(
    characterId: string,
    tradeIntent: TradeIntent
  ): Promise<ExecuteTransactionResponse> {
    const response = await fetch(`${this.baseUrl}/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ characterId, tradeIntent }),
    })

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}))
      throw new Error(
        `GuildCraft API error ${response.status}: ${
          (errorBody as { error?: string }).error ?? response.statusText
        }`
      )
    }

    return response.json() as Promise<ExecuteTransactionResponse>
  }
}
