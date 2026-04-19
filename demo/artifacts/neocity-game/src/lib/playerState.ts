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
  recentPaymentProofs: PaymentProof[]
  mission: MissionSnapshot
}

export interface PaymentProof {
  txHash?: string
  signature?: string
  userOpHash?: string
  amount: number
  currency: string
  item?: string
  recipientName?: string
  recipientWallet?: string
  senderWallet?: string
  mode: string
  confirmedAt: string
}

type PlayerStateListener = (snapshot: PlayerStateSnapshot) => void

const STORAGE_KEY = 'neocity.playerState.v1'
const MAX_PAYMENT_PROOFS = 20

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function parsePaymentProof(value: unknown): PaymentProof | null {
  if (!value || typeof value !== 'object') return null
  const payload = value as Record<string, unknown>

  const amount = typeof payload.amount === 'number' && Number.isFinite(payload.amount)
    ? payload.amount
    : Number(payload.amount)

  const currency = normalizeOptionalString(payload.currency)
  const mode = normalizeOptionalString(payload.mode)
  const confirmedAt = normalizeOptionalString(payload.confirmedAt)

  if (!Number.isFinite(amount) || amount <= 0 || !currency || !mode || !confirmedAt) {
    return null
  }

  return {
    txHash: normalizeOptionalString(payload.txHash),
    signature: normalizeOptionalString(payload.signature),
    userOpHash: normalizeOptionalString(payload.userOpHash),
    amount,
    currency: currency.toUpperCase(),
    item: normalizeOptionalString(payload.item),
    recipientName: normalizeOptionalString(payload.recipientName),
    recipientWallet: normalizeOptionalString(payload.recipientWallet),
    senderWallet: normalizeOptionalString(payload.senderWallet),
    mode,
    confirmedAt,
  }
}

function sanitizeRecentPaymentProofs(value: unknown): PaymentProof[] {
  if (!Array.isArray(value)) return []

  const parsed: PaymentProof[] = []
  const seen = new Set<string>()

  for (const entry of value) {
    const proof = parsePaymentProof(entry)
    if (!proof) continue
    const key = proof.txHash ?? proof.userOpHash ?? proof.signature
    if (!key || seen.has(key)) continue
    seen.add(key)
    parsed.push(proof)
    if (parsed.length >= MAX_PAYMENT_PROOFS) break
  }

  return parsed
}

function getDefaultState(): PlayerStateSnapshot {
  return {
    inventory: [],
    escrowFunded: false,
    recentPaymentProofs: [],
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
}

function loadPersistedState(): PlayerStateSnapshot {
  if (typeof window === 'undefined') {
    return getDefaultState()
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return getDefaultState()

    const parsed = JSON.parse(raw) as Partial<PlayerStateSnapshot> | null
    if (!parsed || typeof parsed !== 'object') return getDefaultState()

    return {
      inventory: Array.isArray(parsed.inventory)
        ? parsed.inventory
            .filter((item): item is PlayerInventoryItem => {
              return !!item && typeof item.name === 'string' && typeof item.quantity === 'number'
            })
            .map((item) => ({ name: item.name, quantity: item.quantity }))
        : [],
      escrowFunded: typeof parsed.escrowFunded === 'boolean' ? parsed.escrowFunded : false,
      lastEventType: typeof parsed.lastEventType === 'string' ? parsed.lastEventType : undefined,
      lastEventAt: typeof parsed.lastEventAt === 'string' ? parsed.lastEventAt : undefined,
      recentPaymentProofs: sanitizeRecentPaymentProofs(parsed.recentPaymentProofs),
      mission: {
        ...getDefaultState().mission,
        ...(parsed.mission && typeof parsed.mission === 'object' ? parsed.mission : {}),
      },
    }
  } catch {
    return getDefaultState()
  }
}

function persistState() {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore storage failures; the in-memory state still works for the session.
  }
}

let state: PlayerStateSnapshot = loadPersistedState()

const listeners = new Set<PlayerStateListener>()

export function getPlayerState(): PlayerStateSnapshot {
  return {
    inventory: state.inventory.map((item) => ({ ...item })),
    escrowFunded: state.escrowFunded,
    lastEventType: state.lastEventType,
    lastEventAt: state.lastEventAt,
    recentPaymentProofs: state.recentPaymentProofs.map((proof) => ({ ...proof })),
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
  persistState()
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

export function recordPaymentProof(input: PaymentProof) {
  const proof = parsePaymentProof(input)
  if (!proof) return

  const uniqueKey = proof.txHash ?? proof.userOpHash ?? proof.signature
  if (!uniqueKey) return

  const nextProofs = [proof]
  for (const existing of state.recentPaymentProofs) {
    const existingKey = existing.txHash ?? existing.userOpHash ?? existing.signature
    if (!existingKey || existingKey === uniqueKey) continue
    nextProofs.push(existing)
    if (nextProofs.length >= MAX_PAYMENT_PROOFS) break
  }

  state = {
    ...state,
    recentPaymentProofs: nextProofs,
    lastEventType: 'PAYMENT_SENT',
    lastEventAt: proof.confirmedAt,
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