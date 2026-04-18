export interface PlayerInventoryItem {
  name: string
  quantity: number
}

export interface MissionSnapshot {
  phase: 1 | 2 | 3
  chipsDelivered: number
  cratesMislabeled: number
  diegoIntelRevealed: boolean
  bodyguardIntelRevealed: boolean
  briefcaseLocated: boolean
  briefcaseTransferred: boolean
  escapeRouteOpened: boolean
  frenzyActive: boolean
  artifactIntercepted: boolean
}

export interface PlayerStateSnapshot {
  inventory: PlayerInventoryItem[]
  escrowFunded: boolean
  lastEventType?: string
  lastEventAt?: string
  mission: MissionSnapshot
}

type PlayerStateListener = (snapshot: PlayerStateSnapshot) => void

let state: PlayerStateSnapshot = {
  inventory: [],
  escrowFunded: false,
  mission: {
    phase: 1,
    chipsDelivered: 0,
    cratesMislabeled: 0,
    diegoIntelRevealed: false,
    bodyguardIntelRevealed: false,
    briefcaseLocated: false,
    briefcaseTransferred: false,
    escapeRouteOpened: false,
    frenzyActive: false,
    artifactIntercepted: false,
  },
}

const listeners = new Set<PlayerStateListener>()

export function getPlayerState(): PlayerStateSnapshot {
  return {
    inventory: state.inventory.map((item) => ({ ...item })),
    escrowFunded: state.escrowFunded,
    lastEventType: state.lastEventType,
    lastEventAt: state.lastEventAt,
    mission: {
      ...state.mission,
    },
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

export function patchMissionState(
  patch: Partial<MissionSnapshot>,
  eventType = 'MISSION_UPDATE'
) {
  state = {
    ...state,
    mission: {
      ...state.mission,
      ...patch,
    },
    lastEventType: eventType,
    lastEventAt: new Date().toISOString(),
  }
  notify()
}

export function setMissionPhase(phase: 1 | 2 | 3) {
  patchMissionState({ phase }, `PHASE_${phase}_STARTED`)
}

export function incrementChipDelivered() {
  patchMissionState(
    { chipsDelivered: state.mission.chipsDelivered + 1 },
    'CHIP_DELIVERED'
  )
}

export function incrementMislabeledCrate() {
  patchMissionState(
    { cratesMislabeled: state.mission.cratesMislabeled + 1 },
    'CRATE_MISLABELED'
  )
}