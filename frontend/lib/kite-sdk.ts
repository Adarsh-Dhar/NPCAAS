/**
 * lib/kite-sdk.ts
 *
 * Production KiteAgentClient — real LLM inference via OpenAI-compatible API.
 *
 * Exports two chat methods:
 *   chat()       — standard request/response (existing behaviour)
 *   chatStream() — returns a ReadableStream<string> of SSE-formatted chunks
 *                  for the /api/chat/stream route
 *
 * Response format (structured JSON):
 *   { "action": "<physical action, max 8 words>", "text": "<spoken dialogue>" }
 */

import OpenAI from 'openai'
import { executeWriteTransaction } from '@/lib/tx-orchestrator'
import { betrayAlly, declareHostility, joinFaction } from '@/lib/social-state-store'

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

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface ChatResponse {
  text: string
  action?: string
  tradeIntent?: TradeIntent
  usage?: TokenUsage
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
  characterId?: string
  baseCapital?: number
  pricingAlgorithm?: string
  marginPercentage?: number
  currentMarketRate?: number
  liveWalletBalance?: string
  factionId?: string
  disposition?: 'FRIENDLY' | 'NEUTRAL' | 'HOSTILE'
  baseHostility?: number
  teeExecution?: 'ENABLED' | 'DISABLED'
  projectId?: string
}

/** SSE event shape emitted by chatStream(). */
export interface StreamEvent {
  type: 'text_delta' | 'action' | 'trade_intent' | 'done' | 'error'
  delta?: string       // incremental text token (type=text_delta)
  action?: string      // physical action (type=action)
  tradeIntent?: TradeIntent // (type=trade_intent)
  usage?: TokenUsage
  error?: string       // (type=error)
  final?: ChatResponse // (type=done) — full assembled response
}

// ---------------------------------------------------------------------------
// Tool definition
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
        item:     { type: 'string',  description: 'The item or service being traded' },
        price:    { type: 'number',  description: 'Price in KITE_USD' },
        currency: { type: 'string',  enum: ['KITE_USD'] },
        message:  { type: 'string',  description: 'Spoken dialogue (1–2 sentences, no asterisk actions)' },
        action:   { type: 'string',  description: 'Physical action, max 8 words' },
      },
      required: ['item', 'price', 'currency', 'message', 'action'],
    },
  },
}

const EXECUTE_TRADE_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'execute_trade',
    description:
      'Call this to autonomously sign and send a blockchain transaction transferring funds to another character.',
    parameters: {
      type: 'object',
      properties: {
        targetAddress: { type: 'string', description: 'The blockchain wallet address of the recipient' },
        amount: { type: 'number', description: 'The amount of currency to send' },
      },
      required: ['targetAddress', 'amount'],
    },
  },
}

const JOIN_FACTION_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'join_faction',
    description: 'Join or align with a specific faction and persist it to NPC social state.',
    parameters: {
      type: 'object',
      properties: {
        factionId: { type: 'string', description: 'Faction identifier to join.' },
      },
      required: ['factionId'],
    },
  },
}

const BETRAY_ALLY_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'betray_ally',
    description: 'Break alignment with a faction and increase hostility.',
    parameters: {
      type: 'object',
      properties: {
        factionId: { type: 'string', description: 'Faction identifier that is being betrayed.' },
        reason: { type: 'string', description: 'Short reason for betrayal.' },
      },
      required: ['factionId'],
    },
  },
}

const DECLARE_HOSTILITY_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'declare_hostility',
    description: 'Declare hostility toward a faction and increase hostility threshold.',
    parameters: {
      type: 'object',
      properties: {
        targetFactionId: { type: 'string', description: 'Faction to mark as hostile.' },
        severity: { type: 'number', description: 'Hostility intensity from 0 to 100.' },
      },
      required: ['targetFactionId', 'severity'],
    },
  },
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

function buildSystemPrompt(ctx: AgentContext): string {
  const name     = ctx.characterName ?? 'NPC'
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

  const actionStyleLine =
    openness >= 70
      ? 'Action style: use expressive, curious physical actions (e.g., "gestures animatedly", "inspects gear with intrigue").'
      : openness <= 30
        ? 'Action style: use formal, restrained physical actions (e.g., "stands at attention", "nods curtly").'
        : 'Action style: use measured, practical physical actions.'

  const tradeLine = ctx.canTrade !== false
    ? 'When a player wants to buy, sell, or trade something, use the propose_trade function.'
    : 'Trading is currently disabled. Politely redirect trade requests.'

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

  const economicLines: string[] = []
  if (ctx.pricingAlgorithm) {
    economicLines.push(`Pricing algorithm: ${ctx.pricingAlgorithm}.`)
  }
  if (typeof ctx.marginPercentage === 'number') {
    economicLines.push(`Margin target: ${ctx.marginPercentage}%.`)
  }
  if (typeof ctx.baseCapital === 'number') {
    economicLines.push(`Starting treasury: ${ctx.baseCapital} KITE.`)
  }
  if (typeof ctx.currentMarketRate === 'number') {
    economicLines.push(`Live market rate: ${ctx.currentMarketRate} KITE.`)
  }
  if (ctx.liveWalletBalance) {
    economicLines.push(`Live wallet balance: ${ctx.liveWalletBalance} KITE.`)
  }
  if (economicLines.length > 0) {
    economicLines.push('Follow these economic constraints and do not propose underpriced trades.')
  }
  const economicNote = economicLines.join(' ')

  const socialLines: string[] = []
  if (ctx.factionId) socialLines.push(`Faction: ${ctx.factionId}.`)
  if (ctx.disposition) socialLines.push(`Disposition: ${ctx.disposition}.`)
  if (typeof ctx.baseHostility === 'number') {
    socialLines.push(`Base hostility: ${ctx.baseHostility}/100.`)
  }
  if (socialLines.length > 0) {
    socialLines.push('Respect this social state when deciding whether to trade or escalate.')
  }
  const socialNote = socialLines.join(' ')

  const jsonFormatInstructions = `
CRITICAL OUTPUT FORMAT — always respond with valid JSON:
{
  "action": "<brief physical action, max 8 words, e.g. 'waves hand warmly'>",
  "text": "<spoken dialogue only, 2–3 sentences, no asterisk actions>"
}
Never include asterisk actions (*like this*) in the text field.`

  return [basePersona, opennessLine, actionStyleLine, tradeLine, specializationNote, turnNote, socialNote, economicNote,
    'Stay in character. Do not mention being an AI.', jsonFormatInstructions]
    .filter(Boolean)
    .join('\n\n')
}

// ---------------------------------------------------------------------------
// JSON response parser
// ---------------------------------------------------------------------------

function parseStructuredResponse(content: string): { text: string; action?: string } {
  try {
    const clean = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(clean)
    return {
      text:   typeof parsed.text   === 'string' ? parsed.text.trim()   : content,
      action: typeof parsed.action === 'string' ? parsed.action.trim() : undefined,
    }
  } catch {
    const actionMatch = content.match(/\*([^*]+)\*/g)
    const action = actionMatch ? actionMatch[0].replace(/\*/g, '').trim() : undefined
    const text   = content.replace(/\*[^*]+\*/g, '').trim()
    return { text: text || content, action }
  }
}

function toTokenUsage(usage: OpenAI.Completions.CompletionUsage | null | undefined): TokenUsage | undefined {
  if (!usage) return undefined
  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  }
}

// ---------------------------------------------------------------------------
// SSE frame encoder
// ---------------------------------------------------------------------------

/** Encodes a StreamEvent as a valid Server-Sent Events frame. */
export function encodeSSEFrame(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

// ---------------------------------------------------------------------------
// KiteAgentClient
// ---------------------------------------------------------------------------

export class KiteAgentClient {
  private registeredTools: string[] = []

  registerTools(tools: string[]): void {
    this.registeredTools = tools
  }

  private resolveTools(ctx: AgentContext): OpenAI.Chat.Completions.ChatCompletionTool[] {
    const allowed = new Set(this.registeredTools)
    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = []

    if (ctx.canTrade !== false && allowed.has('propose_trade')) {
      tools.push(PROPOSE_TRADE_TOOL)
    }
    if (allowed.has('execute_trade')) {
      tools.push(EXECUTE_TRADE_TOOL)
    }
    if (allowed.has('join_faction')) {
      tools.push(JOIN_FACTION_TOOL)
    }
    if (allowed.has('betray_ally')) {
      tools.push(BETRAY_ALLY_TOOL)
    }
    if (allowed.has('declare_hostility')) {
      tools.push(DECLARE_HOSTILITY_TOOL)
    }

    return tools
  }

  // ── Standard (blocking) chat ─────────────────────────────────────────────

  async chat(userMessage: string, ctx: AgentContext = {}): Promise<ChatResponse> {
    const client = getClient()
    const model  = getModel()
    const systemPrompt = buildSystemPrompt(ctx)
    const tools = this.resolveTools(ctx)

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
          { role: 'user',   content: userMessage },
        ],
        ...(tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
        ...responseFormat,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown LLM error'
      console.error('[KiteAgentClient] LLM request failed:', msg, err)
      return {
        text:   `LLM error: ${msg}`,
        action: 'looks away distractedly',
      }
    }

    const choice = completion.choices[0]
    const usage = toTokenUsage(completion.usage)

    if (
      choice.finish_reason === 'tool_calls' &&
      choice.message.tool_calls?.length
    ) {
      const toolCall = choice.message.tool_calls[0]

      // Map an on-chain execution tool to the tx-orchestrator
      if (isFunctionToolCall(toolCall) && toolCall.function.name === 'execute_trade') {
        try {
          const args = JSON.parse(toolCall.function.arguments) as {
            targetAddress?: string
            amount?: number | string
            memo?: string
            ownerId?: string
          }
          const targetAddress = args.targetAddress ?? (args as any).to ?? ''
          const amountStr = typeof args.amount === 'number' ? String(args.amount) : (args.amount ?? '0')
          const ownerId = ctx.characterId
          if (!ownerId) {
            return { text: 'Transaction aborted: I do not know my own identity.', action: 'shakes head', usage }
          }
          try {
            const txResult = await executeWriteTransaction({
              to: targetAddress,
              value: amountStr,
              data: '0x',
              ownerId,
              teeExecution: ctx.teeExecution,
              projectId: ctx.projectId,
            })
            return { text: `Transaction successful. Hash: ${txResult.txHash}`, action: 'nods approvingly', usage }
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown transaction error'
            return { text: `Transaction failed: ${msg}`, action: 'shakes head sadly', usage }
          }
        } catch { /* fall through */ }
      }

      if (isFunctionToolCall(toolCall) && toolCall.function.name === 'propose_trade') {
        try {
          const args = JSON.parse(toolCall.function.arguments) as {
            item: string; price: number; currency: string; message: string; action?: string
          }
          return {
            text:   args.message,
            action: args.action ?? 'presents item with a flourish',
            tradeIntent: { item: args.item, price: args.price, currency: args.currency },
            usage,
          }
        } catch { /* fall through */ }
      }

      if (isFunctionToolCall(toolCall) && toolCall.function.name === 'join_faction') {
        try {
          const args = JSON.parse(toolCall.function.arguments) as { factionId?: string }
          if (!ctx.characterId) {
            return { text: 'Cannot join faction: missing character identity.', action: 'pauses cautiously', usage }
          }
          if (!args.factionId) {
            return { text: 'Cannot join faction: factionId missing.', action: 'tilts head in confusion', usage }
          }
          const snapshot = await joinFaction(ctx.characterId, args.factionId)
          return {
            text: `Joined faction ${snapshot.factionId ?? 'UNALIGNED'} and updated social standing.`,
            action: 'marks allegiance in ledger',
            usage,
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown social mutation error'
          return { text: `Failed to join faction: ${msg}`, action: 'grimaces slightly', usage }
        }
      }

      if (isFunctionToolCall(toolCall) && toolCall.function.name === 'betray_ally') {
        try {
          const args = JSON.parse(toolCall.function.arguments) as { factionId?: string; reason?: string }
          if (!ctx.characterId) {
            return { text: 'Cannot betray ally: missing character identity.', action: 'steps back silently', usage }
          }
          if (!args.factionId) {
            return { text: 'Cannot betray ally: factionId missing.', action: 'stares in silence', usage }
          }
          const snapshot = await betrayAlly(ctx.characterId, args.factionId, args.reason)
          return {
            text: `Alliance with ${args.factionId} is broken. Disposition is now ${snapshot.disposition}.`,
            action: 'burns an old pact',
            usage,
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown social mutation error'
          return { text: `Failed to betray ally: ${msg}`, action: 'looks conflicted', usage }
        }
      }

      if (isFunctionToolCall(toolCall) && toolCall.function.name === 'declare_hostility') {
        try {
          const args = JSON.parse(toolCall.function.arguments) as {
            targetFactionId?: string
            severity?: number
          }
          if (!ctx.characterId) {
            return { text: 'Cannot declare hostility: missing character identity.', action: 'crosses arms', usage }
          }
          if (!args.targetFactionId) {
            return { text: 'Cannot declare hostility: targetFactionId missing.', action: 'narrows gaze', usage }
          }
          const snapshot = await declareHostility(
            ctx.characterId,
            args.targetFactionId,
            typeof args.severity === 'number' ? args.severity : 75
          )
          return {
            text: `Hostility declared toward ${args.targetFactionId}. Hostility is now ${snapshot.baseHostility}/100.`,
            action: 'issues a public threat',
            usage,
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown social mutation error'
          return { text: `Failed to declare hostility: ${msg}`, action: 'clenches jaw', usage }
        }
      }
    }

    const rawContent = choice.message.content?.trim() ?? ''
    const { text, action } = parseStructuredResponse(rawContent)
    return { text, action, usage }
  }

  // ── Streaming chat ────────────────────────────────────────────────────────

  /**
   * Returns a ReadableStream that emits SSE-formatted frames:
   *
   *   data: {"type":"text_delta","delta":"Hello"}\n\n
   *   data: {"type":"action","action":"waves hand"}\n\n
   *   data: {"type":"done","final":{...}}\n\n
   *
   * The caller is responsible for piping this into a Response with the
   * appropriate Content-Type: text/event-stream header.
   *
   * NOTE: If the NPC decides to call the `propose_trade` tool, streaming
   * is not possible (tool calls are returned only after the full response is
   * generated).  In that case, a single non-streaming done frame is emitted.
   */
  chatStream(userMessage: string, ctx: AgentContext = {}): ReadableStream<string> {
    const client = getClient()
    const model  = getModel()
    const systemPrompt = buildSystemPrompt(ctx)
    const tools = this.resolveTools(ctx)
    const temp = this.opennessToTemperature(ctx.openness)

    return new ReadableStream<string>({
      start: async (controller) => {
        const enqueue = (event: StreamEvent) => {
          controller.enqueue(encodeSSEFrame(event))
        }

        try {
          // ── Tool-call path: must use non-streaming for tool_choice ──────
          if (tools.length > 0) {
            const completion = await client.chat.completions.create({
              model,
              max_tokens: 400,
              temperature: temp,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user',   content: userMessage },
              ],
              tools,
              tool_choice: 'auto',
            })

            const choice = completion.choices[0]
            const usage = toTokenUsage(completion.usage)

            if (
              choice.finish_reason === 'tool_calls' &&
              choice.message.tool_calls?.length
            ) {
              const toolCall = choice.message.tool_calls[0]
              if (isFunctionToolCall(toolCall) && toolCall.function.name === 'execute_trade') {
                const args = JSON.parse(toolCall.function.arguments) as {
                  targetAddress?: string; amount?: number | string; memo?: string; ownerId?: string
                }
                const ownerId = ctx.characterId
                const amountStr = typeof args.amount === 'number' ? String(args.amount) : (args.amount ?? '0')
                if (!ownerId) {
                  const final: ChatResponse = { text: 'Transaction aborted: I do not know my own identity.', action: 'shakes head', usage }
                  enqueue({ type: 'done', final })
                  controller.close()
                  return
                }
                try {
                  const txResult = await executeWriteTransaction({
                    to: args.targetAddress ?? '',
                    value: amountStr,
                    data: '0x',
                    ownerId,
                    teeExecution: ctx.teeExecution,
                    projectId: ctx.projectId,
                  })
                  const final: ChatResponse = { text: `Transaction successful. Hash: ${txResult.txHash}`, action: 'nods approvingly', usage }
                  if (final.action) enqueue({ type: 'action', action: final.action })
                  enqueue({ type: 'text_delta', delta: final.text })
                  enqueue({ type: 'done', final })
                  controller.close()
                  return
                } catch (err) {
                  const errorMsg = err instanceof Error ? err.message : 'Transaction error'
                  const final: ChatResponse = { text: `Transaction failed: ${errorMsg}`, action: 'shakes head', usage }
                  enqueue({ type: 'done', final })
                  controller.close()
                  return
                }
              }
              if (isFunctionToolCall(toolCall) && toolCall.function.name === 'propose_trade') {
                const args = JSON.parse(toolCall.function.arguments) as {
                  item: string; price: number; currency: string; message: string; action?: string
                }
                const final: ChatResponse = {
                  text:   args.message,
                  action: args.action ?? 'presents item with a flourish',
                  tradeIntent: { item: args.item, price: args.price, currency: args.currency },
                  usage,
                }
                if (final.action) enqueue({ type: 'action', action: final.action })
                // Emit the text as a single delta so clients render it progressively
                enqueue({ type: 'text_delta', delta: final.text })
                if (final.tradeIntent) enqueue({ type: 'trade_intent', tradeIntent: final.tradeIntent })
                enqueue({ type: 'done', final })
                controller.close()
                return
              }
              if (isFunctionToolCall(toolCall) && toolCall.function.name === 'join_faction') {
                const args = JSON.parse(toolCall.function.arguments) as { factionId?: string }
                if (!ctx.characterId || !args.factionId) {
                  const final: ChatResponse = {
                    text: 'Cannot join faction: character identity or factionId missing.',
                    action: 'hesitates briefly',
                    usage,
                  }
                  enqueue({ type: 'done', final })
                  controller.close()
                  return
                }
                const snapshot = await joinFaction(ctx.characterId, args.factionId)
                const final: ChatResponse = {
                  text: `Joined faction ${snapshot.factionId ?? 'UNALIGNED'} and updated social standing.`,
                  action: 'marks allegiance in ledger',
                  usage,
                }
                enqueue({ type: 'action', action: final.action })
                enqueue({ type: 'text_delta', delta: final.text })
                enqueue({ type: 'done', final })
                controller.close()
                return
              }

              if (isFunctionToolCall(toolCall) && toolCall.function.name === 'betray_ally') {
                const args = JSON.parse(toolCall.function.arguments) as { factionId?: string; reason?: string }
                if (!ctx.characterId || !args.factionId) {
                  const final: ChatResponse = {
                    text: 'Cannot betray ally: character identity or factionId missing.',
                    action: 'looks conflicted',
                    usage,
                  }
                  enqueue({ type: 'done', final })
                  controller.close()
                  return
                }
                const snapshot = await betrayAlly(ctx.characterId, args.factionId, args.reason)
                const final: ChatResponse = {
                  text: `Alliance with ${args.factionId} is broken. Disposition is now ${snapshot.disposition}.`,
                  action: 'burns an old pact',
                  usage,
                }
                enqueue({ type: 'action', action: final.action })
                enqueue({ type: 'text_delta', delta: final.text })
                enqueue({ type: 'done', final })
                controller.close()
                return
              }

              if (isFunctionToolCall(toolCall) && toolCall.function.name === 'declare_hostility') {
                const args = JSON.parse(toolCall.function.arguments) as {
                  targetFactionId?: string
                  severity?: number
                }
                if (!ctx.characterId || !args.targetFactionId) {
                  const final: ChatResponse = {
                    text: 'Cannot declare hostility: character identity or targetFactionId missing.',
                    action: 'narrows gaze',
                    usage,
                  }
                  enqueue({ type: 'done', final })
                  controller.close()
                  return
                }
                const snapshot = await declareHostility(
                  ctx.characterId,
                  args.targetFactionId,
                  typeof args.severity === 'number' ? args.severity : 75
                )
                const final: ChatResponse = {
                  text: `Hostility declared toward ${args.targetFactionId}. Hostility is now ${snapshot.baseHostility}/100.`,
                  action: 'issues a public threat',
                  usage,
                }
                enqueue({ type: 'action', action: final.action })
                enqueue({ type: 'text_delta', delta: final.text })
                enqueue({ type: 'done', final })
                controller.close()
                return
              }
            }

            // Fell through — no tool call; emit as text
            const rawContent = choice.message.content?.trim() ?? ''
            const { text, action } = parseStructuredResponse(rawContent)
            if (action) enqueue({ type: 'action', action })
            enqueue({ type: 'text_delta', delta: text })
            const final: ChatResponse = { text, action, usage }
            enqueue({ type: 'done', final })
            controller.close()
            return
          }

          // ── Streaming path: no tools, pure text JSON ─────────────────────
          const stream = await client.chat.completions.create({
            model,
            max_tokens: 400,
            temperature: temp,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user',   content: userMessage },
            ],
            stream: true,
            response_format: { type: 'json_object' },
            stream_options: { include_usage: true },
          })

          let accumulated = ''
          let streamUsage: TokenUsage | undefined

          for await (const chunk of stream) {
            if (chunk.usage) {
              streamUsage = toTokenUsage(chunk.usage)
            }
            const delta = chunk.choices[0]?.delta?.content ?? ''
            if (!delta) continue

            accumulated += delta
            // Stream raw tokens as they arrive — clients can buffer until done
            enqueue({ type: 'text_delta', delta })
          }

          // Parse the fully assembled JSON to extract action + clean text
          const { text, action } = parseStructuredResponse(accumulated)
          if (action) enqueue({ type: 'action', action })
          const final: ChatResponse = { text, action, usage: streamUsage }
          enqueue({ type: 'done', final })
          controller.close()
        } catch (err) {
          const error = err instanceof Error ? err.message : 'LLM stream error'
          console.error('[KiteAgentClient] stream error:', error)
          enqueue({ type: 'error', error })
          controller.close()
        }
      },
    })
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private opennessToTemperature(openness?: number): number {
    const o = openness ?? 50
    return 0.4 + ((o / 100) * 0.6)
  }
}

export const kiteAgentClient = new KiteAgentClient()