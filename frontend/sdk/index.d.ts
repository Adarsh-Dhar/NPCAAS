export interface TradeIntent {
  item: string
  price: number
  currency: string
}

export interface ChatResponse {
  success: boolean
  response: string
  characterId: string
  tradeIntent?: TradeIntent
  specializationActive?: boolean
  pendingSpecialization?: boolean
  timestamp: string
  projectId?: string
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

export declare class GuildCraftClient {
  private apiKey: string
  private baseUrl: string

  constructor(apiKey: string, baseUrl?: string)

  chat(characterId: string, message: string): Promise<ChatResponse>
  executeTransaction(
    characterId: string,
    tradeIntent: TradeIntent
  ): Promise<ExecuteTransactionResponse>
}
