// src/components/ChatWindow.tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Send, X } from 'lucide-react'
import { getCharacterByName, getClient, isSdkReady } from '@/lib/sdk'
import { formatNpcDisplayName, normalizeNpcName } from '@/lib/protocolBabel'

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

const NPC_GREETINGS: Record<string, string> = {
  FORGE_9: 'Forge-9 online. State the request and the payment path.',
  THE_WEAVER: 'The Weaver is listening. Bring terms, not noise.',
  AEGIS_PRIME: 'Aegis-Prime acknowledges the uplink. Speak clearly.',
  VEX: 'Vex is awake. Keep the exchange concise.',
  SILICATE: 'Silicate online. Supply chain status required.',
  NODE_ALPHA: 'Node-Alpha connected. Escrow state pending.',
  NODE_OMEGA: 'Node-Omega online. Complete the transaction.',
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

export function ChatWindow({ npcId, npcName, onClose, onTradeIntent }: ChatWindowProps) {
  const npcDisplayName = formatNpcDisplayName(npcName)
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

  const sendViaSdk = useCallback(
    async (userText: string): Promise<boolean> => {
      const client = getClient()
      if (!client || !characterId) return false

      try {
        const response = (await client.chat(characterId, userText, {
          npcName,
          characterId,
        })) as {
          response?: string
          action?: string | null
          tradeIntent?: TradeIntent | null
        }

        const rawText = String(response.response ?? '').trim()
        const { clean, trade } = extractTradeIntent(rawText)
        const parsedResponses = parseAgentResponse(clean)
        const primary = parsedResponses[0] ?? { action: response.action ?? 'speaks', text: clean || rawText }

        if (response.tradeIntent) onTradeIntent?.(response.tradeIntent)
        if (trade) onTradeIntent?.(trade)

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

        return true
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Chat failed'
        setMessages((prev) => [...prev, { role: 'system', text: message, timestamp: new Date() }])
        return false
      }
    },
    [characterId, npcId, npcName, onTradeIntent]
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

  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-lg"
      style={{
        background: 'rgba(5, 5, 15, 0.97)',
        border: '1px solid rgba(0,255,255,0.27)',
        boxShadow: '0 0 30px rgba(0,255,255,0.14), inset 0 0 30px rgba(0,0,0,0.5)',
        fontFamily: 'monospace',
      }}
    >
      <div className="flex flex-shrink-0 items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(0,255,255,0.15)' }}>
        <div>
          <div className="flex items-center gap-2 text-sm font-bold tracking-widest text-cyan-300">
            {npcDisplayName}
            {sdkActive && characterId && (
              <span className="rounded border border-cyan-400/20 bg-cyan-500/10 px-1.5 py-0.5 text-xs text-cyan-200">
                live
              </span>
            )}
          </div>
          <div className="mt-1 text-[10px] text-cyan-200/70">Backend-driven NPC conversation.</div>
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
                  ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100'
                  : message.role === 'system'
                    ? 'border-yellow-400/30 bg-yellow-500/10 text-yellow-100'
                    : 'border-white/10 bg-white/5 text-white'
              }`}
            >
              {message.role === 'npc' && (
                <div className="mb-1 text-[10px] uppercase tracking-wider opacity-70">
                  {npcDisplayName}
                  {message.action && message.action !== 'speaks' && <span className="ml-2 text-cyan-300">• {message.action}</span>}
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
          <div className="rounded border border-yellow-400/20 bg-yellow-500/10 p-2 text-[11px] text-yellow-300">
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
            className="flex-1 rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/40 disabled:opacity-60"
          />
          <button
            onClick={() => void sendMessage()}
            disabled={!input.trim() || !sdkActive || busy}
            className="flex items-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-50 disabled:hover:bg-cyan-500/10"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Send
          </button>
        </div>
      </div>
    </div>
  )
}