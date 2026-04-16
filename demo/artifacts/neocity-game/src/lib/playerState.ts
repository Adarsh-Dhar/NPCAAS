export interface PlayerInventoryItem {
  name: string
  quantity: number
}

export interface PlayerStateSnapshot {
  inventory: PlayerInventoryItem[]
  escrowFunded: boolean
  lastEventType?: string
  lastEventAt?: string
}

type PlayerStateListener = (snapshot: PlayerStateSnapshot) => void

let state: PlayerStateSnapshot = {
  inventory: [],
  escrowFunded: false,
}

const listeners = new Set<PlayerStateListener>()

export function getPlayerState(): PlayerStateSnapshot {
  return {
    inventory: state.inventory.map((item) => ({ ...item })),
    escrowFunded: state.escrowFunded,
    lastEventType: state.lastEventType,
    lastEventAt: state.lastEventAt,
  }
}

export function subscribePlayerState(listener: PlayerStateListener) {
  listeners.add(listener)
  listener(getPlayerState())
  return () => {
    listeners.delete(listener)
  }
}

function notify() {
  const snapshot = getPlayerState()
  for (const listener of listeners) {
    try {
      listener(snapshot)
    } catch {
      // Ignore individual listener failures.
    }
  }
}

export function setPlayerInventory(inventory: PlayerInventoryItem[]) {
  state = {
    ...state,
    inventory: inventory.map((item) => ({ ...item })),
    lastEventAt: new Date().toISOString(),
    lastEventType: 'INVENTORY_UPDATE',
  }
  notify()
}

export function setEscrowFunded(escrowFunded: boolean) {
  state = {
    ...state,
    escrowFunded,
    lastEventAt: new Date().toISOString(),
    lastEventType: escrowFunded ? 'ESCROW_FUNDED' : 'ESCROW_RELEASED',
  }
  notify()
}

export function emitPlayerEvent(eventType: string) {
  state = {
    ...state,
    lastEventType: eventType,
    lastEventAt: new Date().toISOString(),
  }
  notify()
}