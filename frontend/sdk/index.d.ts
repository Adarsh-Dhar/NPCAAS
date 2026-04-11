// @adarsh23/guildcraft-sdk  v2.0.0  —  TypeScript declarations

// ---------------------------------------------------------------------------
// Core entity types
// ---------------------------------------------------------------------------

export interface TradeIntent {
  item: string
  price: number
  currency: string
}

export interface Character {
  id: string
  name: string
  walletAddress: string
  aaChainId: number
  aaProvider: string
  smartAccountId?: string
  smartAccountStatus: string
  config: Record<string, unknown>
  adaptation: Record<string, unknown>
  isDeployedOnChain: boolean
  deploymentTxHash?: string
  projectIds: string[]
  createdAt: string
}

export interface Project {
  id: string
  name: string
  apiKey: string
  characterCount?: number
  createdAt: string
}

// ---------------------------------------------------------------------------
// Chat types
// ---------------------------------------------------------------------------

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

/** Event shape emitted by chatStream() async generator. */
export interface StreamEvent {
  type: 'text_delta' | 'action' | 'trade_intent' | 'done' | 'error'
  delta?: string
  action?: string
  tradeIntent?: TradeIntent
  error?: string
  final?: {
    text: string
    action?: string
    tradeIntent?: TradeIntent
  }
}

// ---------------------------------------------------------------------------
// Transaction types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// NPC types
// ---------------------------------------------------------------------------

export interface QueuedAction {
  id: string
  type: string
  description: string
  payload: Record<string, unknown>
  status: 'pending' | 'processing' | 'completed' | 'failed'
  scheduledFor: string | null
  enqueuedAt: string
}

export interface NpcMemory {
  summary: string
  preferences: string[]
  turnCount: number
  specializationActive: boolean
  lastUpdatedAt?: string
  topicRelevance?: string[]
}

export interface NpcLog {
  id: string
  type: string
  timestamp: string
  summary: string
  details?: Record<string, unknown>
}

export interface WalletBalance {
  npcId: string
  walletAddress: string
  chainId: number
  native: { symbol: string; balance: string; balanceFormatted: string }
  tokens: Array<{
    address: string
    name: string
    symbol: string
    decimals: number
    balance: string
    balanceFormatted: string
  }>
  fetchedAt: string
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export declare class GuildCraftError extends Error {
  name: 'GuildCraftError'
  status: number
  body: unknown
  constructor(message: string, status: number, body: unknown)
}

// ---------------------------------------------------------------------------
// GuildCraftClient
// ---------------------------------------------------------------------------

export declare class GuildCraftClient {
  constructor(apiKey: string, baseUrl?: string)

  // Characters
  getCharacters(): Promise<Character[]>
  getCharacter(characterId: string): Promise<{ character: Character; projects: Project[] }>
  deployCharacter(params: {
    name: string
    config: Record<string, unknown>
    gameIds?: string[]
  }): Promise<{ message: string; character: Character; walletAddress: string }>
  updateCharacter(params: {
    characterId: string
    name?: string
    config: Record<string, unknown>
  }): Promise<{ message: string; character: Character }>

  // Games
  createGame(name: string): Promise<Project>
  getGames(): Promise<Project[]>
  getGameCharacters(gameId: string): Promise<{ game: { id: string; name: string }; characters: Character[] }>
  assignCharactersToGame(
    gameId: string,
    characterIds: string | string[]
  ): Promise<{ message: string; gameId: string; assignedCharacterIds: string[] }>

  // Chat
  chat(characterId: string, message: string, opts?: { npcName?: string; characterId?: string }): Promise<ChatResponse>
  chatStream(
    characterId: string,
    message: string,
    opts?: { npcName?: string; characterId?: string }
  ): AsyncGenerator<StreamEvent, void, undefined>
  executeTransaction(
    characterId: string,
    tradeIntent: TradeIntent
  ): Promise<ExecuteTransactionResponse>

  // NPC Memory
  getMemory(npcId: string, topic?: string): Promise<{ npcId: string; memory: NpcMemory; configSnapshot: Record<string, unknown> }>
  injectMemory(
    npcId: string,
    payload: {
      facts?: string | string[]
      rules?: string | string[]
      backstory?: string | string[]
      preferences?: string | string[]
    }
  ): Promise<{ message: string; npcId: string; injectedCount: number; totalPreferences: number }>
  clearMemory(npcId: string, scope?: 'short' | 'long' | 'all'): Promise<{ message: string; npcId: string; scope: string }>

  // NPC Logs
  getLogs(
    npcId: string,
    opts?: { limit?: number; type?: string; since?: string }
  ): Promise<{ npcId: string; npcName: string; totalLogs: number; returnedLogs: number; logs: NpcLog[] }>

  // NPC Autonomous Loop
  startLoop(
    npcId: string,
    config?: { schedule?: string; events?: string[]; tasks?: string[] }
  ): Promise<{ message: string; npcId: string; loop: Record<string, unknown> }>
  stopLoop(npcId: string): Promise<{ message: string; npcId: string; loop: Record<string, unknown> }>

  // NPC Action Queue
  getActionQueue(npcId: string): Promise<{ npcId: string; loopActive: boolean; queue: QueuedAction[]; queueLength: number }>
  enqueueAction(
    npcId: string,
    action: { type: string; description: string; payload?: Record<string, unknown>; scheduledFor?: string }
  ): Promise<{ message: string; npcId: string; action: QueuedAction; queueLength: number }>
  vetoAction(npcId: string, actionId: string): Promise<{ message: string; npcId: string; vetoedAction: QueuedAction; remainingQueueLength: number }>

  // NPC Clone
  cloneNpc(npcId: string, name?: string): Promise<{ message: string; clone: { id: string; name: string; walletAddress: string; clonedFrom: string; projectIds: string[]; createdAt: string } }>

  // NPC Event Trigger
  triggerEvent(
    npcId: string,
    payload: { event: string; asset?: string; data?: Record<string, unknown>; recordInMemory?: boolean }
  ): Promise<{ npcId: string; event: string; asset?: string; reaction: { text: string; action?: string }; recordedInMemory: boolean; triggeredAt: string }>

  // NPC Wallet
  getWalletBalances(npcId: string, tokenAddresses?: string[]): Promise<WalletBalance>

  // Environment
  getEnvironmentState(include?: string[]): Promise<Record<string, unknown>>
  broadcast(payload: {
    message: string
    room?: string
    npcIds?: string[]
    reactAsync?: boolean
  }): Promise<{ message: string; recipientCount: number; reactions: Array<{ npcId: string; npcName: string; reaction: string | null; action?: string | null }> }>

  // System
  getUsage(): Promise<Record<string, unknown>>

  // Webhooks
  registerWebhook(payload: {
    url: string
    events: string[]
    npcId?: string
    secret?: string
    description?: string
  }): Promise<{ message: string; webhook: Record<string, unknown>; supportedEvents: string[] }>
  getSupportedWebhookEvents(): Promise<{ supportedEvents: string[]; description: string }>
}