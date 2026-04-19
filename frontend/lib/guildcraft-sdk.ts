/**
 * GuildCraft SDK (internal TypeScript copy)
 * The published npm package (@adarsh23/guildcraft-sdk) is the canonical JS version.
 * This file keeps the internal server-side types in sync.
 */

export interface TradeIntent {
  item: string
  price: number
  currency: string
}

export interface Character {
  id: string
  name: string
  walletAddress: string
  isDeployedOnChain: boolean
  config?: Record<string, any>
}

export interface ChatResponse {
  success: boolean
  response: string
  action?: string
  characterId: string
  tradeIntent?: TradeIntent
  specializationActive?: boolean
  pendingSpecialization?: boolean
  timestamp: string
  projectId?: string
}

export interface TxRequest {
  to: string
  value: string
  data: string
}

export interface ExecuteTransactionResponse {
  success: boolean
  mode: 'sponsored' | 'fallback' | 'user-paid'
  sponsored: boolean
  txHash?: string
  txRequest?: TxRequest
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

  async getCharacters(): Promise<Character[]> {
    const response = await fetch(`${this.baseUrl}/characters`, {
      method: 'GET',
      headers: {
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