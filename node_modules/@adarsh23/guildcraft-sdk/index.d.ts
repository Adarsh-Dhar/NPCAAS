export interface TradeIntent {
  item: string;
  price: number;
  currency: string;
}

export interface Character {
  id: string;
  projectId: string;
  name: string;
  walletAddress?: string;
  config: Record<string, any>;
  isDeployedOnChain?: boolean;
  deploymentTxHash?: string;
  createdAt: string;
}

export interface ChatResponse {
  success: boolean;
  response: string;
  characterId: string;
  tradeIntent?: TradeIntent;
  timestamp: string;
}

export class GuildCraftClient {
  constructor(apiKey: string, baseUrl?: string);
  getCharacters(): Promise<Character[]>;
  chat(characterId: string, message: string): Promise<ChatResponse>;
}
