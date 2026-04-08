/**
 * Kite SDK Mock
 * Simulates @gokite/aa-sdk and @gokite/ai-sdk for local development
 */

// Mock smart account interface
interface SmartAccount {
  address: string
  chainId: number
}

// Mock transaction sponsorship response
interface SponsoredTx {
  txHash: string
  status: 'pending' | 'success'
}

// Mock chat response with optional trade intent
interface ChatResponse {
  text: string
  tradeIntent?: {
    item: string
    price: number
    currency: string
  }
}

// NPC dialogue responses (non-trade)
const npcDialogues = [
  "Greetings, traveler. How may I assist you today?",
  "The markets are bustling today. Any particular wares you seek?",
  "I've heard rumors of great opportunities in the eastern kingdoms.",
  "My contacts tell me times are changing for the better.",
  "The guild prospers when we all work together.",
  "What brings you to my humble establishment?",
]

/**
 * KiteAAProvider - Simulates account abstraction and transaction sponsorship
 */
export class KiteAAProvider {
  private chainId: number = 42161 // Arbitrum

  /**
   * Generate a mock smart account with deterministic address
   */
  async createSmartAccount(): Promise<SmartAccount> {
    // Generate a mock but realistic-looking EVM address
    const randomHex = Math.random().toString(16).slice(2).padEnd(40, '0')
    const address = `0x${randomHex.slice(0, 40)}`

    return {
      address,
      chainId: this.chainId,
    }
  }

  /**
   * Simulate sponsoring a transaction via Paymaster
   */
  async sponsorTransaction(
    userOp: Record<string, unknown>
  ): Promise<SponsoredTx> {
    // Simulate async operation
    await new Promise((resolve) => setTimeout(resolve, 500))

    const txHash = `0x${Math.random().toString(16).slice(2).padEnd(64, '0')}`

    return {
      txHash,
      status: 'success',
    }
  }
}

/**
 * KiteAgentClient - Simulates AI agent with tool registration and chat
 */
export class KiteAgentClient {
  private registeredTools: string[] = []

  /**
   * Register tools that the agent can use
   */
  registerTools(tools: string[]): void {
    this.registeredTools = tools
    console.log(`[Kite Agent] Registered tools: ${tools.join(', ')}`)
  }

  /**
   * Chat with the agent
   * Detects trade keywords and returns appropriate response
   */
  async chat(message: string): Promise<ChatResponse> {
    // Simulate agent processing
    await new Promise((resolve) => setTimeout(resolve, 300))

    const lowerMessage = message.toLowerCase()
    const hasTradeKeyword =
      lowerMessage.includes('buy') ||
      lowerMessage.includes('trade') ||
      lowerMessage.includes('sell')

    if (hasTradeKeyword) {
      return {
        text: 'I can offer you this Iron Sword for 10 KITE_USD. Do we have a deal?',
        tradeIntent: {
          item: 'Iron Sword',
          price: 10,
          currency: 'KITE_USD',
        },
      }
    }

    // Return random NPC dialogue
    const randomDialogue =
      npcDialogues[Math.floor(Math.random() * npcDialogues.length)]
    return {
      text: randomDialogue,
    }
  }
}

// Export singletons for convenience
export const kiteAAProvider = new KiteAAProvider()
export const kiteAgentClient = new KiteAgentClient()
