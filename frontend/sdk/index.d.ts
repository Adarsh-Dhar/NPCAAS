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
  config?: any
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

export declare class GuildCraftClient {
  private apiKey: string
  private baseUrl: string

  constructor(apiKey: string, baseUrl?: string)

  getCharacters(): Promise<Character[]>
  chat(characterId: string, message: string): Promise<ChatResponse>
  executeTransaction(
    characterId: string,
    tradeIntent: TradeIntent
  ): Promise<ExecuteTransactionResponse>
}