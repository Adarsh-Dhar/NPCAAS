// frontend/lib/npcEventBus.ts
// In-process Pub/Sub for NPC-to-NPC communication.
// For multi-server setups, swap EventEmitter for Redis Pub/Sub.

import { EventEmitter } from 'events'

export interface WorldEvent {
  sourceId: string       // character.id of the NPC that acted
  sourceName: string     // character.name for display
  actionType:
    | 'CHAT'
    | 'PAYMENT_SENT'
    | 'TRADE_PROPOSED'
    | 'TRADE_ACCEPTED'
    | 'ITEM_TRANSFERRED'
    | 'BROADCAST'
    | 'HOSTILITY_TRIGGERED'
  payload: Record<string, unknown>
  timestamp: string
}

class NpcEventBus extends EventEmitter {
  private static instance: NpcEventBus | null = null

  static getInstance(): NpcEventBus {
    if (!NpcEventBus.instance) {
      NpcEventBus.instance = new NpcEventBus()
      NpcEventBus.instance.setMaxListeners(100) // support many NPCs
    }
    return NpcEventBus.instance
  }

  broadcast(event: WorldEvent) {
    console.log(`[EventBus] ${event.sourceName} → ${event.actionType}`, event.payload)
    this.emit('world_event', event)
  }

  subscribeNpc(
    npcId: string,
    handler: (event: WorldEvent) => void
  ): () => void {
    const wrapped = (event: WorldEvent) => {
      if (event.sourceId === npcId) return // ignore own actions
      handler(event)
    }
    this.on('world_event', wrapped)
    // return unsubscribe function
    return () => this.off('world_event', wrapped)
  }
}

export const eventBus = NpcEventBus.getInstance()