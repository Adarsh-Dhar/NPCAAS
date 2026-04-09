/**
 * lib/kite-sdk.ts
 *
 * Production KiteAgentClient — real LLM inference via OpenAI API.
 * Responses are structured JSON: { action: string, text: string }
 */

import OpenAI from 'openai'

type FunctionToolCall = OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall

function isFunctionToolCall(
  toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall
): toolCall is FunctionToolCall {
  return toolCall.type === 'function'
}

function createOpenAIClient(): OpenAI {
  const githubToken = process.env.GITHUB_TOKEN

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
  return process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
}

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
  action?: string        // NEW: physical action / expression (separate from dialogue)
  tradeIntent?: TradeIntent
}

export interface AgentContext {
  characterName?: string
  systemPrompt?: string
  openness?: number
  specializationActive?: boolean
  adaptationSummary?: string
  preferences?: string[]
  turnCount?: number
  canTrade?: boolean
}

// ---------------------------------------------------------------------------
// Tool definition — now includes action field
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
          description: 'Spoken dialogue accompanying the trade offer (1–2 sentences, no asterisk actions)',
        },
        action: {
          type: 'string',
          description: 'Brief physical action or expression under 8 words, e.g. "rubs hands together eagerly"',
        },
      },
      required: ['item', 'price', 'currency', 'message', 'action'],
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

  const jsonFormatInstructions = `
CRITICAL OUTPUT FORMAT — you must always respond with valid JSON:
{
  "action": "<brief physical action or expression, max 8 words, e.g. 'waves hand warmly' or 'scratches chin thoughtfully' or 'leans forward with excitement'>",
  "text": "<spoken dialogue only, 2–3 sentences, absolutely no asterisks or stage directions>"
}
Never include asterisk actions (*like this*) in the text field. Keep action and text strictly separate.`

  return [
    basePersona,
    opennessLine,
    tradeLine,
    specializationNote,
    turnNote,
    'Stay in character at all times. Do not break the fourth wall or mention being an AI.',
    jsonFormatInstructions,
  ]
    .filter(Boolean)
    .join('\n\n')
}

// ---------------------------------------------------------------------------
// JSON response parser
// ---------------------------------------------------------------------------

function parseStructuredResponse(content: string): { text: string; action?: string } {
  try {
    // Strip markdown code fences if present
    const clean = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(clean)
    return {
      text: typeof parsed.text === 'string' ? parsed.text.trim() : content,
      action: typeof parsed.action === 'string' ? parsed.action.trim() : undefined,
    }
  } catch {
    // Fallback: try to extract action from asterisks if JSON parse fails
    const actionMatch = content.match(/\*([^*]+)\*/g)
    const action = actionMatch
      ? actionMatch[0].replace(/\*/g, '').trim()
      : undefined
    const text = content.replace(/\*[^*]+\*/g, '').trim()
    return { text: text || content, action }
  }
}

// ---------------------------------------------------------------------------
// KiteAgentClient
// ---------------------------------------------------------------------------

export class KiteAgentClient {
  private registeredTools: string[] = []

  registerTools(tools: string[]): void {
    this.registeredTools = tools
  }

  async chat(userMessage: string, ctx: AgentContext = {}): Promise<ChatResponse> {
    const client = getClient()
    const model = getModel()
    const systemPrompt = buildSystemPrompt(ctx)

    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] =
      ctx.canTrade !== false ? [PROPOSE_TRADE_TOOL] : []

    // Use json_object response format when no tools (tools + json_object can conflict on some models)
    const responseFormat = tools.length === 0
      ? { response_format: { type: 'json_object' as const } }
      : {}

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
        ...(tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
        ...responseFormat,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown LLM error'
      console.error('[KiteAgentClient] LLM request failed:', msg)
      return {
        text: 'I seem to be lost in thought right now. Try again in a moment.',
        action: 'looks away distractedly',
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
            action?: string
          }
          return {
            text: args.message,
            action: args.action ?? 'presents item with a flourish',
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

    // -- Normal text path: parse structured JSON ---------------------------
    const rawContent = choice.message.content?.trim() ?? ''
    const { text, action } = parseStructuredResponse(rawContent)
    return { text, action }
  }

  private opennessToTemperature(openness?: number): number {
    const o = openness ?? 50
    return 0.4 + ((o / 100) * 0.6)
  }
}

export const kiteAgentClient = new KiteAgentClient()