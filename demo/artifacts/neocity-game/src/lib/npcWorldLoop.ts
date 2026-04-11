// src/lib/npcWorldLoop.ts
// Subscribes to world events from the server via polling, then injects
// them into a local in-memory event store so the UI can react.

import { getClient, isSdkReady, loadCharacters, getCharacterByName } from '@/lib/sdk'
import type { TradeIntent } from '@/components/ChatWindow'

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
  private lastPollAt: string | null = null

  subscribe(handler: WorldEventHandler) {
    this.handlers.push(handler)
    return () => {
      this.handlers = this.handlers.filter(h => h !== handler)
    }
  }

  start(pollIntervalMs = 4000) {
    if (this.intervalId) return
    this.intervalId = setInterval(() => this.poll(), pollIntervalMs)
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
      // Poll the environment state to pick up recent NPC logs
      // In production you'd use WebSockets or SSE; polling is fine for a demo
      const state = await client.getEnvironmentState(['npcs'])
      // No-op for now — extend to fetch recent NpcLog entries
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