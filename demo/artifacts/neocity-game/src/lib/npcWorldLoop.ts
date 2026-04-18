// src/lib/npcWorldLoop.ts
// Subscribes to world events from the server via polling, then injects
// them into a local in-memory event store so the UI can react.

import { getClient } from '@/lib/sdk'
import type { TradeIntent } from '../components/ChatWindow'
import { PROTOCOL_BABEL_NODE_NAMES } from '@/lib/protocolBabel'

export interface WorldEvent {
  sourceId: string
  sourceName: string
  actionType: string
  payload: Record<string, unknown>
  timestamp: string
}

type WorldEventHandler = (event: WorldEvent) => void

class NpcWorldLoop {
  private handlers: WorldEventHandler[] = []
  private intervalId: ReturnType<typeof setInterval> | null = null
  private tickCount = 0
  private readonly loopNpcNames = [...PROTOCOL_BABEL_NODE_NAMES]

  subscribe(handler: WorldEventHandler) {
    this.handlers.push(handler)
    return () => {
      this.handlers = this.handlers.filter(h => h !== handler)
    }
  }

  start(pollIntervalMs = 4000) {
    if (this.intervalId) return
    this.intervalId = setInterval(() => void this.poll(), pollIntervalMs)
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  /** Trigger a world event from the client side (when player executes a trade) */
  localBroadcast(event: WorldEvent) {
    this.dispatch(event)
  }

  private async poll() {
    const client = getClient()
    if (!client) return

    try {
      this.tickCount += 1

      for (const npcName of this.loopNpcNames) {
        let loopResult: { loop?: unknown } = {}
        try {
          loopResult = await client.startNpcLoop(npcName, {
            schedule: '*/10 * * * * *',
            events: ['TRADE', 'CHAT', 'PAYMENT_SENT'],
            tasks: ['monitor-wallets', 'negotiate-trade', 'broadcast-auction-updates'],
          })
        } catch {
          // Keep the local event stream alive even if loop scheduling fails.
        }

        this.dispatch({
          sourceId: npcName,
          sourceName: npcName,
          actionType: 'LOOP_TICK',
          payload: { tick: this.tickCount, loop: loopResult.loop },
          timestamp: new Date().toISOString(),
        })

        const actionQueue = await client.getNpcActionQueue(npcName)
        if (actionQueue?.queueLength === 0 && this.tickCount % 2 === 0) {
          const target = this.loopNpcNames[(this.tickCount + this.loopNpcNames.indexOf(npcName) + 1) % this.loopNpcNames.length]
          await client.queueNpcAction(npcName, {
            type: 'TRADE',
            description: `Auction directive: ${npcName} should negotiate with ${target}`,
            payload: { type: 'TRADE', target, item: 'Port consignment' },
          })

          this.dispatch({
            sourceId: npcName,
            sourceName: npcName,
            actionType: 'ACTION_QUEUED',
            payload: { target, item: 'Raw Data' },
            timestamp: new Date().toISOString(),
          })
        }

        if (this.tickCount % 3 === 0) {
          const counterparty = this.loopNpcNames[(this.loopNpcNames.indexOf(npcName) + 2) % this.loopNpcNames.length]
          this.dispatch({
            sourceId: npcName,
            sourceName: npcName,
            actionType: 'PAYMENT_SENT',
            payload: {
              to: counterparty,
              amount: 2500 + this.tickCount * 10,
              currency: 'KITE_USD',
              item: 'Auction partial settlement',
            },
            timestamp: new Date().toISOString(),
          })
        }

        if (this.tickCount % 4 === 0) {
          const target = this.loopNpcNames[(this.loopNpcNames.indexOf(npcName) + 1) % this.loopNpcNames.length]
          this.dispatch({
            sourceId: npcName,
            sourceName: npcName,
            actionType: 'CHAT',
            payload: {
              to: target,
              message: 'Confirm route window and crate escrow status.',
            },
            timestamp: new Date().toISOString(),
          })
        }
      }
    } catch {
      // ignore poll failures silently
    }
  }

  private dispatch(event: WorldEvent) {
    for (const h of this.handlers) {
      try { h(event) } catch { /* ignore individual handler errors */ }
    }
  }

  /** Let one NPC speak to another from the game client */
  async npcSpeak(
    initiatorId: string,
    targetName: string,
    message: string,
    tradeIntent?: TradeIntent
  ) {
    const client = getClient()
    if (!client) throw new Error('SDK not ready')

    const result = await client.npcInteract(initiatorId, targetName, message, tradeIntent)

    // Broadcast the interaction locally so the UI can show it
    this.localBroadcast({
      sourceId: result.interaction.from.id,
      sourceName: result.interaction.from.name,
      actionType: 'CHAT',
      payload: {
        to: result.interaction.to.name,
        message,
        response: result.targetResponse.text,
        action: result.targetResponse.action,
        tradeIntent,
        txResult: result.interaction.txResult,
        counterTrade: result.targetResponse.counterTrade,
      },
      timestamp: result.timestamp,
    })

    return result
  }
}

export const worldLoop = new NpcWorldLoop()