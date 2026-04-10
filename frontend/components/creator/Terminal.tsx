'use client'

import { useState, useRef, useEffect } from 'react'
import RetroInput from '@/components/ui/RetroInput'
import RetroButton from '@/components/ui/RetroButton'

interface TradeIntent {
  item: string
  price: number
  currency: string
}

interface Message {
  role: 'system' | 'user' | 'agent'
  text: string
  action?: string          // NEW: physical action separate from dialogue
  tradeIntent?: TradeIntent
  id: string
  txHash?: string // Optional transaction hash for explorer link
}

interface TerminalProps {
  characterId?: string
  onAction?: (action: string) => void   // NEW: callback to lift action up to LeftPanel
}

interface TransactionResult {
  status: 'pending' | 'processing' | 'success' | 'failed'
  txHash?: string
  mode?: 'sponsored' | 'fallback'
  error?: string
}

export default function Terminal({ characterId, onAction }: TerminalProps) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'agent',
      text: 'Hi, I am your NPC assistant. Chat with me naturally, and share your Section 2 cognitive layer when you want deeper specialization.',
      action: 'waves hand in greeting',
      id: '1',
    },
  ])
  const [loading, setLoading] = useState(false)
  const [specializationState, setSpecializationState] = useState<'inactive' | 'pending' | 'active'>('inactive')
  const [transactionState, setTransactionState] = useState<{ [key: string]: TransactionResult }>({})
  const scrollRef = useRef<HTMLDivElement>(null)

  // Fire the initial greeting action
  useEffect(() => {
    onAction?.('waves hand in greeting')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSendMessage = async () => {
    if (!input.trim()) return

    const userMessage = input.trim()
    setInput('')
    const userId = `msg_${Date.now()}`

    setMessages((prev) => [
      ...prev,
      { role: 'user', text: userMessage, id: userId },
    ])

    setLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId, message: userMessage }),
      })

      if (response.ok) {
        const data = await response.json()

        if (data.pendingSpecialization) {
          setSpecializationState('pending')
        } else if (data.specializationActive) {
          setSpecializationState('active')
        } else {
          setSpecializationState('inactive')
        }

        // Emit action to parent (LeftPanel → DemoAgent)
        if (data.action) {
          onAction?.(data.action)
        }

        const agentId = `msg_${Date.now()}_agent`
        setMessages((prev) => [
          ...prev,
          {
            role: 'agent',
            text: data.response,          // spoken text only
            action: data.action ?? undefined, // physical action
            tradeIntent: data.tradeIntent,
            id: agentId,
          },
        ])

        if (data.tradeIntent) {
          setTransactionState((prev) => ({
            ...prev,
            [agentId]: { status: 'pending' },
          }))
        }
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'system',
            text: 'Sorry, I could not process your message right now.',
            id: `err_${Date.now()}`,
          },
        ])
      }
    } catch (error) {
      console.error('Chat error:', error)
      setMessages((prev) => [
        ...prev,
        {
          role: 'system',
          text: 'Connection failed. Please try again.',
          id: `err_${Date.now()}`,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleAcceptTrade = async (messageId: string, tradeIntent: TradeIntent) => {
    if (!characterId) {
      setTransactionState((prev) => ({
        ...prev,
        [messageId]: {
          status: 'failed',
          error: 'Deploy the NPC first before executing trades.',
        },
      }))
      return
    }

    setTransactionState((prev) => ({ ...prev, [messageId]: { status: 'processing' } }))

    try {
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId, tradeIntent }),
      })

      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Trade execution failed.')
      }

      if (payload.mode !== 'sponsored') {
        setTransactionState((prev) => ({
          ...prev,
          [messageId]: {
            status: 'failed',
            mode: 'fallback',
            txHash: typeof payload.txHash === 'string' ? payload.txHash : undefined,
            error: 'Gas sponsorship unavailable. Fallback requires user-paid gas for this transaction.',
          },
        }))
        // Add a system message with the txHash if present
        if (typeof payload.txHash === 'string') {
          setMessages((prev) => [
            ...prev,
            {
              role: 'system',
              text: 'Trade failed: fallback mode. View transaction on explorer.',
              id: `tx_${Date.now()}`,
              txHash: payload.txHash,
            },
          ])
        }
        return
      }

      setTransactionState((prev) => ({
        ...prev,
        [messageId]: {
          status: 'success',
          mode: 'sponsored',
          txHash: typeof payload.txHash === 'string' ? payload.txHash : undefined,
        },
      }))
      // Add a system message with the txHash if present
      if (typeof payload.txHash === 'string') {
        setMessages((prev) => [
          ...prev,
          {
            role: 'system',
            text: 'Trade accepted successfully.',
            id: `tx_${Date.now()}`,
            txHash: payload.txHash,
          },
        ])
      }
    } catch (error) {
      console.error('Trade error:', error)
      setTransactionState((prev) => ({
        ...prev,
        [messageId]: {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Trade execution failed.',
        },
      }))
    }
  }

  return (
    <div className="retro-card-blue flex flex-col h-full bg-gray-950">
      <div className="text-xs font-bold uppercase text-white mb-3 pb-2 border-b-2 border-blue-400">
        NPC Chat
      </div>

      {specializationState !== 'inactive' && (
        <div className="mb-3 px-2 py-2 border border-blue-400/50 bg-black/40 text-[10px] text-blue-200">
          {specializationState === 'pending' &&
            'Mode: Section 2 parsed. Send "Activate Section 2" to apply.'}
          {specializationState === 'active' &&
            'Mode: Specialized. The NPC now adapts more tightly to your preferences each turn.'}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto mb-3 space-y-3 text-xs pr-2">
        {messages.map((msg) => (
          <div key={msg.id}>
            {/* Action line (italic, dimmer) — shown for agent messages */}
            {msg.role === 'agent' && msg.action && (
              <div className="text-green-600 italic font-mono text-[10px] mb-1 pl-1">
                *{msg.action}*
              </div>
            )}

            {/* Main message bubble */}
            <div
              className={
                msg.role === 'system'
                  ? 'text-cyan-300'
                  : msg.role === 'user'
                    ? 'text-yellow-200 bg-yellow-900/20 border border-yellow-400/30 rounded px-2 py-2'
                    : 'text-green-200 bg-green-900/20 border border-green-400/30 rounded px-2 py-2'
              }
            >
              {msg.text}
            </div>

            {/* Trade offer button */}
            {msg.tradeIntent && (
              <div className="mt-2 ml-2">
                <RetroButton
                  variant={transactionState[msg.id]?.status === 'success' ? 'green' : 'magenta'}
                  size="sm"
                  onClick={() => handleAcceptTrade(msg.id, msg.tradeIntent!)}
                  disabled={
                    transactionState[msg.id]?.status === 'processing' ||
                    transactionState[msg.id]?.status === 'success'
                  }
                  className="text-xs"
                >
                  {transactionState[msg.id]?.status === 'processing'
                    ? 'Sponsoring transaction...'
                    : transactionState[msg.id]?.status === 'success'
                      ? 'Trade accepted: item received'
                      : 'Accept trade'}
                </RetroButton>
                {transactionState[msg.id]?.status === 'success' && (
                  <div className="mt-1 text-[10px] text-green-300">
                    Sponsored tx: {transactionState[msg.id]?.txHash?.slice(0, 16)}...
                  </div>
                )}
                {transactionState[msg.id]?.status === 'failed' && (
                  <div className="mt-1 text-[10px] text-yellow-300">
                    {transactionState[msg.id]?.error}
                  </div>
                )}
              </div>
            )}

            {/* Explorer button for txHash */}
            {msg.txHash && (
              <div className="mt-3">
                <p className="text-xs text-gray-400 font-mono mb-2 break-all">
                  Tx: {msg.txHash.slice(0, 16)}...{msg.txHash.slice(-10)}
                </p>
                <a
                  href={`https://testnet.kitescan.ai/tx/${msg.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block"
                >
                  <RetroButton variant="yellow" size="sm" className="text-xs">
                    VIEW ON EXPLORER
                  </RetroButton>
                </a>
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="text-cyan-300 animate-pulse">Thinking...</div>
        )}
      </div>

      <RetroInput
        borderColor="blue"
        placeholder="Send a message..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        className="text-xs"
        disabled={loading}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !loading) handleSendMessage()
        }}
      />
      <div className="mt-2 flex justify-end">
        <RetroButton
          variant="blue"
          size="sm"
          onClick={handleSendMessage}
          disabled={loading || !input.trim()}
          className="text-xs"
        >
          {loading ? 'Sending...' : 'Send'}
        </RetroButton>
      </div>
    </div>
  )
}