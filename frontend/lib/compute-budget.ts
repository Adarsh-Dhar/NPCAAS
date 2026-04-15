const DEFAULT_LIMIT_TOKENS = BigInt(5000)
const ZERO = BigInt(0)
const RESET_WINDOW_MS = 24 * 60 * 60 * 1000

export interface ComputeBudgetSnapshot {
  usageTokens: bigint
  limitTokens: bigint
  lastResetAt: Date
}

export interface ComputeBudgetDecision {
  allowed: boolean
  remainingTokens: bigint
  usageTokens: bigint
  limitTokens: bigint
  resetAt: Date
}

function parseBigIntLike(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.max(0, Math.floor(value)))
  if (typeof value === 'string' && value.trim()) {
    try {
      return BigInt(value)
    } catch {
      return null
    }
  }
  return null
}

export function parseComputeLimit(value: unknown): bigint {
  const parsed = parseBigIntLike(value)
  if (parsed === null || parsed <= ZERO) return DEFAULT_LIMIT_TOKENS
  return parsed
}

export function parseComputeUsage(value: unknown): bigint {
  const parsed = parseBigIntLike(value)
  if (parsed === null || parsed < ZERO) return ZERO
  return parsed
}

export function parseResetAt(value: unknown): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return new Date()
}

export function shouldResetBudget(lastResetAt: Date, now = new Date()): boolean {
  return now.getTime() - lastResetAt.getTime() >= RESET_WINDOW_MS
}

export function evaluateComputeBudget(snapshot: ComputeBudgetSnapshot): ComputeBudgetDecision {
  const remainingTokens = snapshot.limitTokens > snapshot.usageTokens
    ? snapshot.limitTokens - snapshot.usageTokens
    : ZERO

  return {
    allowed: snapshot.usageTokens < snapshot.limitTokens,
    remainingTokens,
    usageTokens: snapshot.usageTokens,
    limitTokens: snapshot.limitTokens,
    resetAt: snapshot.lastResetAt,
  }
}

export function bigintToNumberSafe(value: bigint): number {
  const max = BigInt(Number.MAX_SAFE_INTEGER)
  return Number(value > max ? max : value)
}

export function serializeBudget(decision: ComputeBudgetDecision) {
  return {
    allowed: decision.allowed,
    remainingTokens: decision.remainingTokens.toString(),
    usageTokens: decision.usageTokens.toString(),
    limitTokens: decision.limitTokens.toString(),
    resetAt: decision.resetAt.toISOString(),
  }
}
