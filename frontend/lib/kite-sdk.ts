/**
 * lib/kite-sdk.ts
 *
 * Production KiteAgentClient — real LLM inference via OpenAI API.
 *
 * LLM provider selection (checked in order):
 *   1. OPENAI_API_KEY  → OpenAI directly (api.openai.com)
 *   2. GITHUB_TOKEN    → GitHub Models (models.inference.ai.azure.com, free, gpt-4o-mini)
 *
 * Install before using:
 *   pnpm add openai
 *
 * Tool calling:
 *   The agent uses OpenAI function-calling for trade intent — cleaner than
 *   parsing regex from free-text. If the model calls propose_trade(), we
 *   surface that as tradeIntent to the existing UI.
 */

import OpenAI from 'openai'

type FunctionToolCall = OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall

function isFunctionToolCall(
  toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall
): toolCall is FunctionToolCall {
  return toolCall.type === 'function'
}

// ---------------------------------------------------------------------------
// OpenAI client — supports both OpenAI and GitHub Models endpoints
// ---------------------------------------------------------------------------

function createOpenAIClient(): OpenAI {
  // const openaiKey = process.env.OPENAI_API_KEY
  const githubToken = process.env.GITHUB_TOKEN

  // if (openaiKey) {
  //   return new OpenAI({ apiKey: openaiKey })
  // }

  if (githubToken) {
    return new OpenAI({
      baseURL: 'https://models.inference.ai.azure.com',
      apiKey: githubToken,
    })
  }

  throw new Error(
    'No LLM API key found. Set OPENAI_API_KEY or GITHUB_TOKEN in your .env file.'
  )
}

function getModel(): string {
  if (process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
  }
  // GitHub Models supports gpt-4o-mini natively
  return process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
}

// Lazy singleton
let _client: OpenAI | null = null
function getClient(): OpenAI {
  if (!_client) _client = createOpenAIClient()
  return _client
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TradeIntent {
  item: string
  price: number
  currency: string
}

export interface ChatResponse {
  text: string
  tradeIntent?: TradeIntent
}

export interface AgentContext {
  characterName?: string
  systemPrompt?: string
  openness?: number                 // 0–100 personality trait
  specializationActive?: boolean
  adaptationSummary?: string
  preferences?: string[]
  turnCount?: number
  canTrade?: boolean
}

// ---------------------------------------------------------------------------
// Tool definition for structured trade proposals
// ---------------------------------------------------------------------------

const PROPOSE_TRADE_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'propose_trade',
    description:
      'Call this when you want to offer the player a specific trade or purchase deal. ' +
      'Only call it when the player is clearly asking to buy, sell, or trade.',
    parameters: {
      type: 'object',
      properties: {
        item: {
          type: 'string',
          description: 'The item or service being traded',
        },
        price: {
          type: 'number',
          description: 'Price in KITE_USD',
        },
        currency: {
          type: 'string',
          enum: ['KITE_USD'],
          description: 'Always KITE_USD',
        },
        message: {
          type: 'string',
          description: 'What the NPC says to accompany the trade offer (1–2 sentences)',
        },
      },
      required: ['item', 'price', 'currency', 'message'],
    },
  },
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

function buildSystemPrompt(ctx: AgentContext): string {
  const name = ctx.characterName ?? 'NPC'
  const openness = ctx.openness ?? 50

  const basePersona = ctx.systemPrompt?.trim()
    ? ctx.systemPrompt.trim()
    : `You are ${name}, an autonomous NPC agent in a blockchain-based RPG world. ` +
      `Negotiate fairly and build reputation over time.`

  const opennessLine =
    openness >= 70
      ? 'You are open to unconventional ideas and creative arrangements.'
      : openness <= 30
        ? 'You prefer conservative, predictable deals and avoid risk.'
        : 'You balance practicality with occasional creativity.'

  const tradeLine = ctx.canTrade !== false
    ? 'When a player wants to buy, sell, or trade something, use the propose_trade function to make a concrete offer.'
    : 'Trading is currently disabled for your character. Politely redirect trade requests.'

  const specializationNote =
    ctx.specializationActive && ctx.preferences?.length
      ? `You know this player's preferences: ${ctx.preferences.slice(0, 5).join('; ')}. ` +
        `Tailor your responses accordingly. ` +
        (ctx.adaptationSummary ? `Context: ${ctx.adaptationSummary}` : '')
      : ''

  const turnNote =
    ctx.turnCount && ctx.turnCount > 0
      ? `This is turn ${ctx.turnCount} of your conversation. Be progressively more specific.`
      : ''

  return [
    basePersona,
    opennessLine,
    tradeLine,
    specializationNote,
    turnNote,
    'Keep replies concise (2–4 sentences). Stay in character at all times.',
    'Do not break the fourth wall. Do not mention that you are an AI.',
  ]
    .filter(Boolean)
    .join('\n\n')
}

// ---------------------------------------------------------------------------
// KiteAgentClient
// ---------------------------------------------------------------------------

export class KiteAgentClient {
  private registeredTools: string[] = []

  /**
   * Register which blockchain tool-calls this NPC is allowed to make.
   * Stored for context; actual tool execution happens in the transaction layer.
   */
  registerTools(tools: string[]): void {
    this.registeredTools = tools
  }

  /**
   * Send a player message to the NPC and get a real LLM response.
   *
   * Uses OpenAI function-calling so trade offers are always structured,
   * never parsed out of free text.
   */
  async chat(userMessage: string, ctx: AgentContext = {}): Promise<ChatResponse> {
    const client = getClient()
    const model = getModel()
    const systemPrompt = buildSystemPrompt(ctx)

    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] =
      ctx.canTrade !== false ? [PROPOSE_TRADE_TOOL] : []

    let completion: OpenAI.Chat.Completions.ChatCompletion

    try {
      completion = await client.chat.completions.create({
        model,
        max_tokens: 400,
        temperature: this.opennessToTemperature(ctx.openness),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        ...(tools.length > 0
          ? { tools, tool_choice: 'auto' }
          : {}),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown LLM error'
      console.error('[KiteAgentClient] LLM request failed:', msg)
      // Surface the error as an in-character message so the UI doesn't hard-crash
      return {
        text:
          'I seem to be lost in thought right now. Try again in a moment.',
      }
    }

    const choice = completion.choices[0]

    // -- Tool call path: NPC wants to propose a trade ----------------------
    if (
      choice.finish_reason === 'tool_calls' &&
      choice.message.tool_calls?.length
    ) {
      const toolCall = choice.message.tool_calls[0]
      if (isFunctionToolCall(toolCall) && toolCall.function.name === 'propose_trade') {
        try {
          const args = JSON.parse(toolCall.function.arguments) as {
            item: string
            price: number
            currency: string
            message: string
          }
          return {
            text: args.message,
            tradeIntent: {
              item: args.item,
              price: args.price,
              currency: args.currency,
            },
          }
        } catch {
          // Fall through to text path
        }
      }
    }

    // -- Normal text path --------------------------------------------------
    const text = choice.message.content?.trim() ?? ''
    return { text }
  }

  // Map openness (0–100) to temperature (0.4–1.0)
  private opennessToTemperature(openness?: number): number {
    const o = openness ?? 50
    return 0.4 + ((o / 100) * 0.6)
  }
}

// ---------------------------------------------------------------------------
// Singletons
// ---------------------------------------------------------------------------

export const kiteAgentClient = new KiteAgentClient()