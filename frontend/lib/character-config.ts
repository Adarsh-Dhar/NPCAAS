export interface Section2Profile {
  systemPrompt: string
  openness: number
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function normalizeCharacterConfig(value: unknown): Record<string, unknown> {
  const payload = asRecord(value)
  const baseCapital = payload.baseCapital ?? payload.capital
  const factionId = payload.factionId ?? payload.factions
  const baseHostility = payload.baseHostility ?? payload.hostility

  const normalized: Record<string, unknown> = {
    ...payload,
  }

  if (baseCapital !== undefined) normalized.baseCapital = baseCapital
  if (typeof payload.pricingAlgorithm === 'string') normalized.pricingAlgorithm = payload.pricingAlgorithm
  if (payload.marginPercentage !== undefined) normalized.marginPercentage = payload.marginPercentage
  if (typeof payload.systemPrompt === 'string') normalized.systemPrompt = payload.systemPrompt

  const openness = asNumber(payload.openness)
  if (openness !== undefined) normalized.openness = clamp(openness, 0, 100)

  if (typeof factionId === 'string' && factionId.trim()) normalized.factionId = factionId.trim()
  if (baseHostility !== undefined) normalized.baseHostility = baseHostility

  const disposition = asString(payload.disposition)
  if (disposition && disposition.trim()) normalized.disposition = disposition.trim().toUpperCase()

  const canTrade = asBoolean(payload.canTrade)
  if (canTrade !== undefined) normalized.canTrade = canTrade
  const canMove = asBoolean(payload.canMove)
  if (canMove !== undefined) normalized.canMove = canMove
  const canCraft = asBoolean(payload.canCraft)
  if (canCraft !== undefined) normalized.canCraft = canCraft
  const interGameTransactionsEnabled = asBoolean(payload.interGameTransactionsEnabled)
  if (interGameTransactionsEnabled !== undefined) {
    normalized.interGameTransactionsEnabled = interGameTransactionsEnabled
  }

  const teeExecution = asString(payload.teeExecution)
  if (teeExecution) normalized.teeExecution = teeExecution.toUpperCase() === 'ENABLED' ? 'ENABLED' : 'DISABLED'

  const allowDbFetch = asBoolean(payload.allowDbFetch)
  if (allowDbFetch !== undefined) normalized.allowDbFetch = allowDbFetch
  if (typeof payload.dbEndpoint === 'string' && payload.dbEndpoint.trim()) normalized.dbEndpoint = payload.dbEndpoint.trim()

  if (Array.isArray(payload.inventory)) normalized.inventory = payload.inventory

  delete normalized.capital
  delete normalized.factions
  delete normalized.hostility

  return normalized
}

export function toCanonicalSection2Profile(value: unknown): Section2Profile | undefined {
  const payload = asRecord(value)
  const systemPrompt = asString(payload.systemPrompt)?.trim()
  const openness = asNumber(payload.openness)

  if (!systemPrompt || openness === undefined) return undefined

  return {
    systemPrompt,
    openness: clamp(openness, 0, 100),
  }
}

export function normalizeAdaptationState(input: {
  adaptation: unknown
  config: unknown
}): Record<string, unknown> {
  const adaptation = asRecord(input.adaptation)
  const config = normalizeCharacterConfig(input.config)

  const specializationActive = Boolean(adaptation.specializationActive)
  const turnCount = asNumber(adaptation.turnCount) ?? 0
  const preferences = Array.isArray(adaptation.preferences)
    ? adaptation.preferences.filter((entry): entry is string => typeof entry === 'string')
    : []
  const pendingSection2 = toCanonicalSection2Profile(adaptation.pendingSection2)
  const snapshotPrompt = asString(config.systemPrompt) ?? ''
  const snapshotOpenness = asNumber(config.openness) ?? 50

  const effectivePrompt = snapshotPrompt
  const effectiveOpenness = snapshotOpenness

  const normalized: Record<string, unknown> = {
    specializationActive,
    turnCount,
    preferences,
    summary:
      typeof adaptation.summary === 'string' && adaptation.summary.trim()
        ? adaptation.summary
        : 'No adaptation history yet.',
    lastUpdatedAt:
      typeof adaptation.lastUpdatedAt === 'string' && adaptation.lastUpdatedAt.trim()
        ? adaptation.lastUpdatedAt
        : new Date().toISOString(),
    configSnapshot: {
      systemPrompt: snapshotPrompt,
      openness: clamp(snapshotOpenness, 0, 100),
    },
    effectiveSection2: {
      systemPrompt: effectivePrompt,
      openness: clamp(effectiveOpenness, 0, 100),
      specializationActive,
      pendingSpecialization: Boolean(pendingSection2),
    },
  }

  if (pendingSection2) {
    normalized.pendingSection2 = pendingSection2
  }

  return normalized
}
