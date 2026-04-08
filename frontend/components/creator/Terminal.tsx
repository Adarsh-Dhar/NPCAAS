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
  tradeIntent?: TradeIntent
  id: string
}

interface TerminalProps {
  characterId?: string
}

export default function Terminal({ characterId }: TerminalProps) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([
    { role: 'system', text: '> TERMINAL INITIALIZED', id: '1' },
    { role: 'system', text: '> AWAITING AGENT COMMANDS...', id: '2' },
    { role: 'agent', text: 'Ready to negotiate trades with other NPCs', id: '3' },
  ])
  const [loading, setLoading] = useState(false)
  const [transactionState, setTransactionState] = useState<{
    [key: string]: 'pending' | 'signing' | 'success'
  }>({})
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSendMessage = async () => {
    if (!input.trim() || !characterId) return

    const userMessage = input.trim()
    setInput('')
    const userId = `msg_${Date.now()}`

    // Add user message to terminal
    setMessages((prev) => [
      ...prev,
      { role: 'user', text: `> ${userMessage}`, id: userId },
    ])

    setLoading(true)

    try {
      // Call the chat API with just the message string
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId,
          message: userMessage,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        const agentId = `msg_${Date.now()}_agent`
        setMessages((prev) => [
          ...prev,
          {
            role: 'agent',
            text: data.response,
            tradeIntent: data.tradeIntent,
            id: agentId,
          },
        ])

        // Mark trade intent message as pending if it exists
        if (data.tradeIntent) {
          setTransactionState((prev) => ({
            ...prev,
            [agentId]: 'pending',
          }))
        }
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'system',
            text: '> ERROR: FAILED TO PROCESS COMMAND',
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
          text: '> ERROR: CONNECTION FAILED',
          id: `err_${Date.now()}`,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleAcceptTrade = async (messageId: string) => {
    // Step 1: Change state to signing
    setTransactionState((prev) => ({
      ...prev,
      [messageId]: 'signing',
    }))

    try {
      // Step 2: Simulate signing delay (2 seconds)
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Step 3: Change state to success
      setTransactionState((prev) => ({
        ...prev,
        [messageId]: 'success',
      }))
    } catch (error) {
      console.error('Trade error:', error)
      setTransactionState((prev) => ({
        ...prev,
        [messageId]: 'pending',
      }))
    }
  }

  return (
    <div className="retro-card-blue flex flex-col h-full bg-gray-950">
      {/* Header */}
      <div className="text-xs font-bold uppercase text-white mb-3 pb-2 border-b-2 border-blue-400">
        COMMAND LINE INTERFACE
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto mb-3 space-y-2 font-mono text-xs pr-2"
      >
        {messages.map((msg) => (
          <div key={msg.id}>
            {/* Message text */}
            <div
              className={
                msg.role === 'system'
                  ? 'text-cyan-400'
                  : msg.role === 'user'
                    ? 'text-yellow-400'
                    : 'text-green-400'
              }
            >
              {msg.text}
            </div>

            {/* Trade intent button */}
            {msg.tradeIntent && (
              <div className="mt-2 ml-2">
                <RetroButton
                  variant={
                    transactionState[msg.id] === 'success'
                      ? 'green'
                      : 'magenta'
                  }
                  size="sm"
                  onClick={() => handleAcceptTrade(msg.id)}
                  disabled={
                    transactionState[msg.id] === 'signing' ||
                    transactionState[msg.id] === 'success'
                  }
                  className="text-xs"
                >
                  {transactionState[msg.id] === 'signing'
                    ? 'SIGNING VIA PAYMASTER...'
                    : transactionState[msg.id] === 'success'
                      ? 'TRANSACTION SUCCESS: ITEM RECEIVED'
                      : 'ACCEPT TRADE'}
                </RetroButton>
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="text-cyan-400 animate-pulse">
            {'> PROCESSING_INPUT...'}
          </div>
        )}
      </div>

      {/* Input */}
      <RetroInput
        borderColor="blue"
        placeholder={
          characterId
            ? 'Negotiate a trade...'
            : 'Create a game first...'
        }
        value={input}
        onChange={(e) => setInput(e.target.value)}
        className="text-xs font-mono"
        disabled={loading || !characterId}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !loading && characterId) {
            handleSendMessage()
          }
        }}
      />
    </div>
  )
}
