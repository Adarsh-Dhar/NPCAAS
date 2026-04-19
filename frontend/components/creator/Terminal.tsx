'use client'

import { useState, useRef, useEffect } from 'react'
import RetroInput from '@/components/ui/RetroInput'
import RetroButton from '@/components/ui/RetroButton'
import { useWallet } from '@/components/WalletContext'

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
  mode?: 'sponsored' | 'fallback' | 'user-paid'
  error?: string
}

export default function Terminal({ characterId, onAction }: TerminalProps) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'agent',
      text: 'Secure channel online. Send a message to begin broker dialogue.',
      action: 'waves hand in greeting',
      id: '1',
    },
  ])
  const [loading, setLoading] = useState(false)
  const [specializationState, setSpecializationState] = useState<'inactive' | 'pending' | 'active'>('inactive')
  const [transactionState, setTransactionState] = useState<{ [key: string]: TransactionResult }>({})
  const scrollRef = useRef<HTMLDivElement>(null)
  const { address, onKiteNetwork, switchToKite } = useWallet()

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

      // --- NEW LOGIC: User-Paid Transaction via MetaMask ---
      if (payload.mode === 'user-paid' && payload.txRequest) {
        if (!address) {
          setTransactionState((prev) => ({
            ...prev,
            [messageId]: { status: 'failed', error: 'Please connect your Web3 wallet first to execute trades.' },
          }))
          setMessages((prev) => [
            ...prev,
            { role: 'system', text: 'Please connect your Web3 wallet to execute trades.', id: `tx_err_${Date.now()}` },
          ])
          return
        }

        if (!onKiteNetwork) {
          await switchToKite()
        }

        const provider = (window as any).ethereum
        if (!provider || typeof provider.request !== 'function') {
          setTransactionState((prev) => ({
            ...prev,
            [messageId]: { status: 'failed', error: 'No Web3 wallet detected. Please install MetaMask.' },
          }))
          setMessages((prev) => [
            ...prev,
            { role: 'system', text: 'No Web3 wallet detected. Please install MetaMask or another injected wallet.', id: `tx_err_${Date.now()}` },
          ])
          return
        }

        // Convert the base-10 Wei string to a Hex string for MetaMask
        let valueInHex = '0x0'
        try {
          if (payload.txRequest.value) {
            valueInHex = '0x' + BigInt(payload.txRequest.value).toString(16)
          }
        } catch (e) {
          // If value is already hex (0x...), use it; otherwise fallback to 0
          if (typeof payload.txRequest.value === 'string' && payload.txRequest.value.startsWith('0x')) {
            valueInHex = payload.txRequest.value
          } else {
            valueInHex = '0x0'
          }
        }

        // Add the sender's address and the hex-formatted value
        const txParams = {
          ...payload.txRequest,
          from: address,
          value: valueInHex,
        }

        try {
          const txHash = await provider.request({
            method: 'eth_sendTransaction',
            params: [txParams],
          }) as string

          setTransactionState((prev) => ({
            ...prev,
            [messageId]: { status: 'success', mode: 'user-paid', txHash },
          }))

          setMessages((prev) => [
            ...prev,
            {
              role: 'system',
              text: 'Trade accepted! Transaction sent via your wallet.',
              id: `tx_${Date.now()}`,
              txHash,
            },
          ])
          return
        } catch (err: any) {
          // Handle user rejection differently for a clearer UX
          const code = err?.code
          if (code === 4001) {
            setTransactionState((prev) => ({
              ...prev,
              [messageId]: { status: 'failed', error: 'Transaction cancelled by user.' },
            }))
            setMessages((prev) => [
              ...prev,
              { role: 'system', text: 'Transaction cancelled by user.', id: `tx_cancelled_${Date.now()}` },
            ])
            return
          }

          // Unknown wallet error — surface friendly message
          setTransactionState((prev) => ({
            ...prev,
            [messageId]: { status: 'failed', error: err instanceof Error ? err.message : 'Wallet transaction failed.' },
          }))
          setMessages((prev) => [
            ...prev,
            { role: 'system', text: `Transaction failed: ${err?.message ?? 'Unknown wallet error'}`, id: `tx_err_${Date.now()}` },
          ])
          return
        }
      }
      // -----------------------------------------------------

      // Handle fallback/failed sponsorships
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

      // Handle successful sponsorships
      setTransactionState((prev) => ({
        ...prev,
        [messageId]: {
          status: 'success',
          mode: 'sponsored',
          txHash: typeof payload.txHash === 'string' ? payload.txHash : undefined,
        },
      }))
      if (typeof payload.txHash === 'string') {
        setMessages((prev) => [
          ...prev,
          {
            role: 'system',
            text: 'Trade accepted successfully (Gas Sponsored).',
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
                    ? 'text-blue-200 bg-blue-950/30 border border-blue-400/30 rounded px-2 py-2'
                    : 'text-purple-200 bg-purple-950/30 border border-purple-400/30 rounded px-2 py-2'
              }
            >
              {msg.text}
            </div>

            {/* Trade offer button */}
            {msg.tradeIntent && (
              <div className="mt-2 ml-2">
                <RetroButton
                  variant={transactionState[msg.id]?.status === 'success' ? 'blue' : 'purple'}
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
                          <div className="mt-1 text-[10px] text-blue-300">
                            Tx: {transactionState[msg.id]?.txHash?.slice(0, 16)}...
                          </div>
                        )}
                {transactionState[msg.id]?.status === 'failed' && (
                  <div className="mt-1 text-[10px] text-purple-300">
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
                  <RetroButton variant="blue" size="sm" className="text-xs">
                    VIEW ON EXPLORER
                  </RetroButton>
                </a>
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="text-blue-300 animate-pulse">Thinking...</div>
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