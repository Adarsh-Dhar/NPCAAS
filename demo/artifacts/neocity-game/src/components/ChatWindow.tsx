// src/components/ChatWindow.tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Send, X } from 'lucide-react'
import { getCharacterByName, getClient, isSdkReady } from '@/lib/sdk'
import { formatNpcDisplayName, normalizeNpcName } from '@/lib/protocolBabel'
import { getPlayerState } from '@/lib/playerState'

export interface TradeIntent {
  item: string
  price: number
  currency: string
}

export interface ChatWindowProps {
  npcId: string
  npcName: string
  onClose: () => void
  onTradeIntent?: (trade: TradeIntent) => void
}

interface Message {
  role: 'user' | 'npc' | 'system'
  text: string
  action?: string
  timestamp: Date
}

interface ParsedNpcAction {
  action: string
  text: string
}

interface AegisGateUnlockedDetail {
  npcName?: string
  text?: string
  action?: string
  worldEvent?: string
}

interface ParsedGameEvent {
  eventName: string | null
  clean: string
}

const NPC_GREETINGS: Record<string, string> = {
  VINNIE_DELUCA: 'Vinnie is barking over the radio. Keep it moving, quartermaster.',
  SVETLANA_MOROZOVA: 'Svetlana waits, expression unchanged. Speak once and clearly.',
  DIEGO_VARGAS: 'Diego raises a glass and laughs. Impress him or move along.',
  THE_CURATOR: 'The Curator watches with polite suspicion.',
  REMY_BOUDREAUX: 'Remy checks his watch. Transit window is closing.',
  DON_CARLO: 'Don Carlo opens a secure ledger tab. Full amount first, then movement.',
  PAPA_KOFI: 'Papa Kofi nods slowly. He has seen this port burn before.',
}

const BROKER_CANONICAL_NAME = 'DON_CARLO'
const BROKER_BRIEFCASE_PRICE = 16500
const BROKER_BRIEFCASE_CURRENCY = 'PYUSD'
const BROKER_BRIEFCASE_ITEM = 'Brokered Briefcase Settlement'
const MIDNIGHT_GAME_ID = 'THE_MIDNIGHT_MANIFEST'
const MIDNIGHT_PLAYER_ID_KEY = 'midnight.manifest.player.id'
const MIDNIGHT_SESSION_KEY_PREFIX = 'midnight.manifest.session'

function nextClientId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function getOrCreatePlayerId() {
  if (typeof window === 'undefined') return 'anonymous'

  const existing = window.localStorage.getItem(MIDNIGHT_PLAYER_ID_KEY)
  if (existing && existing.trim().length > 0) return existing

  const created = nextClientId()
  window.localStorage.setItem(MIDNIGHT_PLAYER_ID_KEY, created)
  return created
}

function getOrCreateSessionId(playerId: string, npcName: string) {
  if (typeof window === 'undefined') return nextClientId()

  const normalizedNpc = normalizeNpcName(npcName)
  const storageKey = `${MIDNIGHT_SESSION_KEY_PREFIX}:${MIDNIGHT_GAME_ID}:${playerId}:${normalizedNpc}`
  const existing = window.localStorage.getItem(storageKey)
  if (existing && existing.trim().length > 0) return existing

  const created = nextClientId()
  window.localStorage.setItem(storageKey, created)
  return created
}

function extractTradeIntent(text: string): { clean: string; trade: TradeIntent | null } {
  const match = text.match(/\[\[TRADE:(\{.*?\})\]\]/s)
  if (!match) return { clean: text, trade: null }
  try {
    const trade = JSON.parse(match[1]) as TradeIntent
    return { clean: text.replace(match[0], '').trim(), trade }
  } catch {
    return { clean: text, trade: null }
  }
}

function extractGameEvent(text: string): ParsedGameEvent {
  const match = text.match(/\[\[EVENT:([A-Z0-9_]+)\]\]/)
  if (!match) return { eventName: null, clean: text }

  const clean = text.replace(/\[\[EVENT:[A-Z0-9_]+\]\]/g, '').replace(/\s{2,}/g, ' ').trim()
  return { eventName: match[1], clean }
}

function extractJsonObjects(rawText: string): string[] {
  const chunks: string[] = []
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false

  for (let i = 0; i < rawText.length; i += 1) {
    const ch = rawText[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === '\\') {
      escaped = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === '{') {
      if (depth === 0) start = i
      depth += 1
      continue
    }
    if (ch === '}') {
      if (depth === 0) continue
      depth -= 1
      if (depth === 0 && start !== -1) {
        chunks.push(rawText.slice(start, i + 1))
        start = -1
      }
    }
  }

  return chunks
}

function parseAgentResponse(rawText: string): ParsedNpcAction[] {
  const jsonChunks = extractJsonObjects(rawText)
  const parsed: ParsedNpcAction[] = []

  for (const chunk of jsonChunks) {
    try {
      const obj = JSON.parse(chunk) as { action?: unknown; text?: unknown; message?: unknown }
      const textValue =
        typeof obj.text === 'string'
          ? obj.text
          : typeof obj.message === 'string'
            ? obj.message
            : ''
      if (!textValue.trim()) continue

      const actionValue =
        typeof obj.action === 'string' && obj.action.trim() ? obj.action.trim() : 'speaks'

      parsed.push({ action: actionValue, text: textValue.trim() })
    } catch {
      // Ignore malformed chunks and continue parsing other blocks.
    }
  }

  if (parsed.length > 0) return parsed

  const fallback = rawText.trim()
  return [{ action: 'speaks', text: fallback || rawText }]
}

function inferBrokerBriefcaseTradeIntent(input: {
  npcName: string
  userText: string
  npcText: string
}): TradeIntent | null {
  if (normalizeNpcName(input.npcName) !== BROKER_CANONICAL_NAME) return null

  const user = input.userText.toLowerCase()
  const npc = input.npcText.toLowerCase()

  const wantsTransfer = /\b(briefcase|transfer|handoff|handover|buy|deal|price|route|pay|payment|send|wire|offer)\b/.test(user)
  const userCommitsToPrice =
    ((/\b16,?500\b/.test(user) || /\b1[7-9],?\d{3}\b/.test(user) || /\b[2-9]\d{4,}\b/.test(user)) && /\b(pyusd|kite\s*usd|usd)\b/.test(user)) ||
    (/\bpay\b/.test(user) && /\bnow\b/.test(user))

  const mentionsBrokerOffer =
    ((/\b16500\b/.test(npc) || /\b16,500\b/.test(npc) || /\bat\s+least\b/.test(npc)) &&
      (/\bpyusd\b/.test(npc) || /\bcredits\b/.test(npc) || /\bfee\b/.test(npc) || /\bcommission\b/.test(npc)))

  const asksForSettlementProof =
    (/wallet\s+address/.test(npc) || /transaction\s+hash/.test(npc)) &&
    (/sent\s+the\s+payment/.test(npc) || /finalize\s+the\s+transaction/.test(npc) || /once\s+you've\s+sent/.test(npc))

  if (!(mentionsBrokerOffer || asksForSettlementProof)) return null
  if (!(wantsTransfer || userCommitsToPrice)) return null

  return {
    item: BROKER_BRIEFCASE_ITEM,
    price: BROKER_BRIEFCASE_PRICE,
    currency: BROKER_BRIEFCASE_CURRENCY,
  }
}

function inferSvetlanaBriefcaseEvent(input: {
  npcName: string
  userText: string
  npcText: string
}): string | null {
  if (normalizeNpcName(input.npcName) !== 'SVETLANA_MOROZOVA') return null

  const combined = `${input.userText} ${input.npcText}`.toLowerCase()
  const mentionsBriefcase = /\bbriefcase\b/.test(combined)
  const mentionsSensitiveContents = /gold briefcase|quantum drive|access codes/.test(combined)

  return mentionsBriefcase || mentionsSensitiveContents ? 'BRIEFCASE_LOCATED' : null
}

export function ChatWindow({ npcId, npcName, onClose, onTradeIntent }: ChatWindowProps) {
  const npcDisplayName = formatNpcDisplayName(npcName)
  const [playerId] = useState<string>(() => getOrCreatePlayerId())
  const [sessionId, setSessionId] = useState<string>(() => getOrCreateSessionId(getOrCreatePlayerId(), npcName))
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'npc',
      text: NPC_GREETINGS[normalizeNpcName(npcName)] ?? '...',
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [sdkActive, setSdkActive] = useState<boolean>(() => isSdkReady())
  const [characterId, setCharacterId] = useState<string | null>(null)
  const [charLookupError, setCharLookupError] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setSessionId(getOrCreateSessionId(playerId, npcName))
  }, [npcName, playerId])

  useEffect(() => {
    let mounted = true

    void (async () => {
      if (!isSdkReady()) return

      try {
        let char = await getCharacterByName(npcName)
        if (!char) char = await getCharacterByName(npcId)

        if (!mounted) return

        if (char) {
          setCharacterId(char.id)
          setCharLookupError(null)
        } else {
          setCharLookupError(`No GuildCraft character found for ${npcName}.`)
        }
      } catch {
        if (mounted) {
          setCharLookupError('Error loading characters.')
        }
      }
    })()

    return () => {
      mounted = false
    }
  }, [npcName, npcId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setSdkActive(isSdkReady())
  }, [])

  useEffect(() => {
    const handleSystemRelay = (event: Event) => {
      const detail = (event as CustomEvent<AegisGateUnlockedDetail>).detail
      const incomingName = detail?.npcName ? normalizeNpcName(detail.npcName) : ''
      const currentName = normalizeNpcName(npcName)

      if (!incomingName || incomingName !== currentName) return

      const text =
        typeof detail?.text === 'string' && detail.text.trim()
          ? detail.text
          : 'Radio static spikes across the port as the route shifts in your favor.'
      const action =
        typeof detail?.action === 'string' && detail.action.trim()
          ? detail.action
          : 'authorizes firewall release'

      setMessages((prev) => [
        ...prev,
        {
          role: 'npc',
          text,
          action,
          timestamp: new Date(),
        },
      ])
    }

    window.addEventListener('midnight-system-relay', handleSystemRelay)
    return () => window.removeEventListener('midnight-system-relay', handleSystemRelay)
  }, [npcName])

  const sendViaSdk = useCallback(
    async (userText: string): Promise<boolean> => {
      const client = getClient()
      if (!client || !characterId) return false

      try {
        const response = (await client.chat(characterId, userText, {
          npcName,
          characterId,
          sessionId,
          playerId,
          gameId: MIDNIGHT_GAME_ID,
          recentPaymentProofs: getPlayerState().recentPaymentProofs,
        })) as {
          response?: string
          action?: string | null
          tradeIntent?: TradeIntent | null
          worldEvent?: string | null
        }

        const rawText = String(response.response ?? '').trim()
        const { clean, trade } = extractTradeIntent(rawText)
        const eventExtraction = extractGameEvent(clean)
        const parsedResponses = parseAgentResponse(eventExtraction.clean)
        const primary = parsedResponses[0] ?? {
          action: response.action ?? 'speaks',
          text: eventExtraction.clean || clean || rawText,
        }

        const inferredTradeIntent = inferBrokerBriefcaseTradeIntent({
          npcName,
          userText,
          npcText: primary.text,
        })
        const resolvedTradeIntent =
          response.tradeIntent ?? trade ?? inferredTradeIntent
        if (resolvedTradeIntent) onTradeIntent?.(resolvedTradeIntent)

        setMessages((prev) => [
          ...prev,
          { role: 'npc', text: primary.text, action: response.action ?? primary.action, timestamp: new Date() },
        ])

        window.dispatchEvent(
          new CustomEvent('npc-action', {
            detail: {
              npcId,
              npcName,
              text: primary.text,
              action: response.action ?? primary.action,
            },
          })
        )

        const dispatchedEvents = new Set<string>()
        const inferredBriefcaseEvent = inferSvetlanaBriefcaseEvent({
          npcName,
          userText,
          npcText: primary.text,
        })

        if (response.worldEvent) {
          window.dispatchEvent(
            new CustomEvent('NPC_SYSTEM_EVENT', {
              detail: {
                eventName: response.worldEvent,
                npcName,
              },
            })
          )
          dispatchedEvents.add(response.worldEvent)
        }

        // Keep parsing [[EVENT:...]] as a compatibility fallback for older payloads.
        if (eventExtraction.eventName && !dispatchedEvents.has(eventExtraction.eventName)) {
          window.dispatchEvent(
            new CustomEvent('NPC_SYSTEM_EVENT', {
              detail: {
                eventName: eventExtraction.eventName,
                npcName,
              },
            })
          )
          dispatchedEvents.add(eventExtraction.eventName)
        }

        if (inferredBriefcaseEvent && !dispatchedEvents.has(inferredBriefcaseEvent)) {
          window.dispatchEvent(
            new CustomEvent('NPC_SYSTEM_EVENT', {
              detail: {
                eventName: inferredBriefcaseEvent,
                npcName,
              },
            })
          )
          dispatchedEvents.add(inferredBriefcaseEvent)
        }

        return true
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Chat failed'
        setMessages((prev) => [...prev, { role: 'system', text: message, timestamp: new Date() }])
        return false
      }
    },
    [characterId, npcId, npcName, onTradeIntent, playerId, sessionId]
  )

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || isThinking) return

    setMessages((prev) => [...prev, { role: 'user', text, timestamp: new Date() }])
    setInput('')
    setIsThinking(true)

    try {
      if (!isSdkReady() || !characterId) {
        const errMsg = isSdkReady()
          ? `No character named "${npcName}" found. Create a character with this name in GuildCraft.`
          : `GuildCraft SDK not configured. Set VITE_GC_API_KEY in demo/.env to enable live chat.`
        setMessages((prev) => [...prev, { role: 'system', text: errMsg, timestamp: new Date() }])
        return
      }

      const ok = await sendViaSdk(text)
      if (!ok) {
        setMessages((prev) => [
          ...prev,
          { role: 'system', text: '[SDK chat failed — check console for details]', timestamp: new Date() },
        ])
      }
    } finally {
      setIsThinking(false)
    }
  }, [input, isThinking, sdkActive, characterId, sendViaSdk, npcName])

  function handleKeyDown(e: React.KeyboardEvent) {
    e.stopPropagation()
    try {
      (e.nativeEvent as unknown as KeyboardEvent).stopImmediatePropagation?.()
    } catch {
      // ignore
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage()
    }
    if (e.key === 'Escape') onClose()
  }

  const busy = isThinking
  const sendDisabled = !input.trim() || !sdkActive || busy

  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-lg"
      style={{
        background: 'rgba(6, 8, 22, 0.97)',
        border: '1px solid rgba(103,232,249,0.32)',
        boxShadow: '0 0 26px rgba(56,189,248,0.2), inset 0 0 26px rgba(0,0,0,0.52)',
        fontFamily: 'monospace',
      }}
    >
      <div className="flex flex-shrink-0 items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(103,232,249,0.2)' }}>
        <div>
          <div className="flex items-center gap-2 text-sm font-bold tracking-widest text-cyan-200">
            {npcDisplayName}
            {sdkActive && characterId && (
              <span className="rounded border border-cyan-300/30 bg-cyan-400/10 px-1.5 py-0.5 text-xs text-cyan-100">
                live
              </span>
            )}
          </div>
          <div className="mt-1 text-[10px] text-blue-200/70">Backend-driven NPC conversation.</div>
        </div>

        <button onClick={onClose} className="rounded p-1 hover:bg-white/10" aria-label="Close chat" title="Close (Esc)">
          <X size={16} color="#00ffff" />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3 text-sm">
        {messages.map((message, index) => (
          <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-lg border px-3 py-2 ${
                message.role === 'user'
                  ? 'border-cyan-300/40 bg-cyan-500/12 text-cyan-100'
                  : message.role === 'system'
                    ? 'border-purple-300/40 bg-purple-500/12 text-purple-100'
                    : 'border-blue-300/25 bg-blue-500/10 text-blue-50'
              }`}
            >
              {message.role === 'npc' && (
                <div className="mb-1 text-[10px] uppercase tracking-wider opacity-70">
                  {npcDisplayName}
                  {message.action && message.action !== 'speaks' && <span className="ml-2 text-cyan-200">• {message.action}</span>}
                </div>
              )}
              {message.role === 'system' && <div className="mb-1 text-[10px] uppercase tracking-wider opacity-70">system</div>}
              <div className="whitespace-pre-wrap leading-relaxed">{message.text}</div>
            </div>
          </div>
        ))}

        {isThinking && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/60">
              <Loader2 size={14} className="animate-spin" />
              {npcDisplayName} is thinking...
            </div>
          </div>
        )}

        {charLookupError && (
          <div className="rounded border border-purple-300/30 bg-purple-500/12 p-2 text-[11px] text-purple-200">
            {charLookupError}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="flex-shrink-0 border-t border-white/10 p-3">
        <div className="flex items-end gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${npcDisplayName}...`}
            disabled={!sdkActive || busy}
            className="flex-1 rounded-lg border border-blue-200/20 bg-black/50 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/50 disabled:opacity-60"
          />
          <button
            onClick={() => void sendMessage()}
            disabled={sendDisabled}
            className="flex items-center gap-2 rounded-lg border border-blue-300/40 bg-blue-500/15 px-3 py-2 text-sm text-cyan-100 hover:bg-blue-500/25 disabled:opacity-50 disabled:hover:bg-blue-500/15"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Send
          </button>
        </div>
      </div>
    </div>
  )
}