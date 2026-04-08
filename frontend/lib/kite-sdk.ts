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

interface AgentContext {
  characterName?: string
  systemPrompt?: string
  openness?: number
  specializationActive?: boolean
  adaptationSummary?: string
  preferences?: string[]
  turnCount?: number
  canTrade?: boolean
}

function normalizePrompt(systemPrompt?: string) {
  return (systemPrompt || '').replace(/\s+/g, ' ').trim()
}

function toTitleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function cleanSubject(value: string) {
  return value
    .replace(/^(?:a|an|the|my|your|this|that|these|those)\s+/i, '')
    .replace(/\b(?:seller|merchant|trader|vendor|dealer|shopkeeper|broker)\b.*$/i, '')
    .replace(/\b(?:who|that|which|with|for|to|and|but|while)\b.*$/i, '')
    .replace(/[^a-z0-9' -]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractTradeSubject(systemPrompt?: string) {
  const prompt = normalizePrompt(systemPrompt)
  if (!prompt) {
    return 'Goods'
  }

  const clauses = prompt.split(/[.;\n]/)
  const rolePattern = /\b(seller|merchant|trader|vendor|dealer|shopkeeper|broker)[a-z0-9]*\b/i

  for (const clause of clauses) {
    const sellerMatch = clause.match(
      /\b([a-z][a-z0-9' -]{0,60}?)\s+(?:seller|merchant|trader|vendor|dealer|shopkeeper|broker)\b/i
    )
    if (sellerMatch) {
      const subject = cleanSubject(sellerMatch[1])
      if (subject) {
        return toTitleCase(subject)
      }
    }

    const sellMatch = clause.match(
      /\b(?:sell|selling|trade|trading|deal in|stock|stocking|carry|carrying|offer|offering|provide|providing)\s+(?:a|an|the|some)?\s*([a-z][a-z0-9' -]{1,60})/i
    )
    if (sellMatch) {
      const subject = cleanSubject(sellMatch[1])
      if (subject) {
        return toTitleCase(subject)
      }
    }

    const ofMatch = clause.match(
      /\b(?:seller|merchant|trader|vendor|dealer|shopkeeper|broker)\s+(?:of|for|in)\s+([a-z][a-z0-9' -]{1,60})/i
    )
    if (ofMatch) {
      const subject = cleanSubject(ofMatch[1])
      if (subject) {
        return toTitleCase(subject)
      }
    }

    const noisyRoleMatch = clause.match(rolePattern)
    if (noisyRoleMatch) {
      const beforeRole = clause.slice(0, noisyRoleMatch.index).trim()
      const subject = cleanSubject(beforeRole.split(/[,;:\n]/).pop() || beforeRole)
      if (subject) {
        return toTitleCase(subject)
      }
    }
  }

  return 'Goods'
}

function derivePersona(systemPrompt?: string) {
  const prompt = normalizePrompt(systemPrompt)
  const itemName = extractTradeSubject(systemPrompt)

  return {
    isMerchant:
      /\b(merchant|seller|trader|vendor|dealer|shopkeeper|broker|shop|store|market|sell|selling|trade|trading|deal in|stock|stocking|carry|carrying|offer|offering|provide|providing)\b/i.test(
        prompt
      ) || itemName !== 'Goods',
    wantsHighPrice:
      /\b(expensive|premium|luxury|high price|highest price|markup|profit|maximize value|as much as you can|charge more)\b/i.test(
        prompt
      ),
    isFairTrader:
      /\b(fair|fairly|negotiate fairly|reasonable|honest|balanced|steady reputation)\b/i.test(
        prompt
      ),
    nameLine: /\badarsh\b/i.test(prompt) ? 'Adarsh' : 'the NPC',
    itemName,
    roleSummary: prompt || 'a helpful NPC',
  }
}

function extractRoleIdentity(systemPrompt?: string) {
  const prompt = normalizePrompt(systemPrompt)
  if (!prompt) {
    return {
      name: '',
      mission: '',
      roleSummary: '',
      hasCustomRole: false,
    }
  }

  const roleMatch = prompt.match(
    /\byou are\s+([^,.!?\n]+?)(?:\s+(?:who|that|and)\b|[,.!?]|$)/i
  )
  const missionMatch = prompt.match(
    /\b(?:need to|must|trying to|tasked to|goal is to|mission is to)\s+([^.!?\n]{8,200})/i
  )

  const extractedName = roleMatch ? cleanSubject(roleMatch[1]) : ''
  const name = extractedName ? toTitleCase(extractedName) : ''
  const mission = missionMatch ? missionMatch[1].trim() : ''

  return {
    name,
    mission,
    roleSummary: prompt,
    hasCustomRole: true,
  }
}

function buildRoleplayReply(message: string, systemPrompt?: string): string | null {
  const role = extractRoleIdentity(systemPrompt)
  if (!role.hasCustomRole) {
    return null
  }

  const lowerMessage = message.toLowerCase().trim()
  const identityLine = role.name ? `I am ${role.name}.` : 'I have a role to fulfill.'
  const missionLine = role.mission ? `My mission is to ${role.mission}.` : ''

  if (/\b(who are you|what are you|your name)\b/i.test(lowerMessage)) {
    return [identityLine, missionLine].filter(Boolean).join(' ')
  }

  if (/^(hi|hello|hey|yo)\b/i.test(lowerMessage)) {
    return [
      identityLine,
      missionLine,
      'Tell me how you want to proceed, and I will stay in character.',
    ]
      .filter(Boolean)
      .join(' ')
  }

  if (/\b(what do you do|what now|help|plan|quest|mission)\b/i.test(lowerMessage)) {
    return [
      missionLine || 'I will stay aligned with my configured role.',
      'Ask me for strategy, next steps, or negotiation in-character.',
    ]
      .filter(Boolean)
      .join(' ')
  }

  return [
    identityLine,
    missionLine || 'I will continue in the role you configured.',
  ]
    .filter(Boolean)
    .join(' ')
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
  async chat(message: string, context: AgentContext = {}): Promise<ChatResponse> {
    // Simulate agent processing
    await new Promise((resolve) => setTimeout(resolve, 300))

    const lowerMessage = message.toLowerCase()
    const hasTradeKeyword =
      lowerMessage.includes('buy') ||
      lowerMessage.includes('trade') ||
      lowerMessage.includes('sell')

    const effectiveOpenness =
      typeof context.openness === 'number' ? context.openness : 50
    const persona = derivePersona(context.systemPrompt)
    const personaSummary = persona.isMerchant
      ? persona.wantsHighPrice
        ? `${persona.nameLine} is configured as a ${persona.itemName.toLowerCase()} seller who pushes for premium pricing and quality-first deals.`
        : `${persona.nameLine} is configured as a ${persona.itemName.toLowerCase()} seller who prefers fair bargains and a strong reputation.`
      : persona.roleSummary
    const styleHints = [
      context.systemPrompt ? `Persona: ${context.systemPrompt}` : '',
      context.adaptationSummary ? `Known preferences: ${context.adaptationSummary}` : '',
      context.turnCount
        ? `Conversation depth: ${context.turnCount} turns`
        : '',
    ]
      .filter(Boolean)
      .join(' | ')

    const preferenceHint =
      context.preferences && context.preferences.length > 0
        ? `I will keep in mind your priorities: ${context.preferences.slice(0, 3).join(', ')}.`
        : ''

    const merchantVoice = persona.isMerchant
      ? persona.wantsHighPrice
        ? `I am ${persona.nameLine}, and I set my ${persona.itemName.toLowerCase()} prices high because quality commands a premium.`
        : `I am ${persona.nameLine}, a ${persona.itemName.toLowerCase()} seller who values a clean deal and a steady reputation.`
      : ''

    if (hasTradeKeyword && context.canTrade !== false) {
      const price = persona.wantsHighPrice
        ? effectiveOpenness >= 70
          ? 15
          : effectiveOpenness <= 30
            ? 22
            : 18
        : effectiveOpenness >= 70
          ? 9
          : effectiveOpenness <= 30
            ? 12
            : 10
      return {
        text: context.specializationActive
          ? `${merchantVoice || `Based on your goals, I can offer this ${persona.itemName}`} for ${price} KITE_USD. ${preferenceHint} Do we have a deal?`
          : `${merchantVoice || `I can offer you this ${persona.itemName}`} for ${price} KITE_USD. Do we have a deal?`,
        tradeIntent: {
          item: persona.itemName,
          price,
          currency: 'KITE_USD',
        },
      }
    }

    if (hasTradeKeyword && context.canTrade === false) {
      return {
        text: 'Trading is currently disabled for this NPC. Ask about lore, strategy, or guidance instead.',
      }
    }

    if (context.specializationActive) {
      const focusLine =
        effectiveOpenness >= 70
          ? 'I can explore unconventional strategies if you want to experiment.'
          : effectiveOpenness <= 30
            ? 'I will keep recommendations conservative and predictable.'
            : 'I will balance practical choices with selective experimentation.'

      const personaLine = persona.isMerchant
        ? persona.wantsHighPrice
          ? `My priority is to maximize value while keeping customers convinced the ${persona.itemName.toLowerCase()} is worth the price.`
          : 'My priority is to maintain trust, move inventory, and protect my reputation.'
        : `I will stay aligned with your configured role: ${personaSummary}.`

      return {
        text: [
          `Understood. I will respond as ${context.characterName || 'your NPC'} with your configured cognitive profile.`,
          personaSummary ? `Persona summary: ${personaSummary}.` : '',
          personaLine,
          focusLine,
          preferenceHint,
          styleHints ? `Context lock: ${styleHints}` : '',
        ]
          .filter(Boolean)
          .join(' '),
      }
    }

    // Return random NPC dialogue
    if (persona.isMerchant) {
      const subject = persona.itemName.toLowerCase()
      const merchantReplies = persona.wantsHighPrice
        ? [
            `I carry ${subject}s worthy of a premium. If you want the finest one, you will pay for the craftsmanship.`,
            `My ${subject}s are not cheap, because cheap stock is a poor bargain in the long run.`,
            `If you need a ${subject}, I can sell you one, but I will not undersell quality.`,
          ]
        : [
            `I keep a fine selection of ${subject}s for travelers who value reliability.`,
            `A good ${subject} and a fair deal can keep everyone satisfied.`,
            `My shop is open if you are looking for ${subject}s and a straightforward bargain.`,
          ]

      return {
        text: merchantReplies[Math.floor(Math.random() * merchantReplies.length)],
      }
    }

    const roleplayReply = buildRoleplayReply(message, context.systemPrompt)
    if (roleplayReply) {
      return {
        text: roleplayReply,
      }
    }

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
