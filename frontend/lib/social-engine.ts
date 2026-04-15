export type Disposition = 'FRIENDLY' | 'NEUTRAL' | 'HOSTILE'

export type SocialDecision = 'ALLOW_CHAT' | 'REFUSE_CHAT' | 'INTERRUPT_OR_ATTACK'

export interface SocialConfig {
  factionId?: string
  disposition?: Disposition
  baseHostility?: number
  openness?: number
  teeTrustScore?: number
}

export interface SocialContextInput {
  actor: SocialConfig
  target?: SocialConfig
  targetName?: string
  interactionType?: 'CHAT' | 'TRADE_PROPOSED'
}

export interface SocialEvaluationResult {
  hostilityScore: number
  decision: SocialDecision
  isRival: boolean
  opennessModifier: number
  teeTrustModifier: number
  explanation: string
}

const DISPOSITION_BONUS: Record<Disposition, number> = {
  FRIENDLY: -25,
  NEUTRAL: 0,
  HOSTILE: 30,
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

export function normalizeDisposition(value: unknown): Disposition {
  if (typeof value !== 'string') return 'NEUTRAL'
  const normalized = value.trim().toUpperCase()
  if (normalized === 'FRIENDLY' || normalized === 'NEUTRAL' || normalized === 'HOSTILE') {
    return normalized
  }
  // Backward compatibility: map legacy alignment values to social disposition.
  if (normalized === 'LAWFUL') return 'FRIENDLY'
  if (normalized === 'CHAOTIC') return 'HOSTILE'
  return 'NEUTRAL'
}

export function normalizeBaseHostility(value: unknown): number {
  // Legacy compatibility with hostility labels from creator UI.
  if (typeof value === 'string') {
    const normalized = value.trim().toUpperCase()
    if (normalized === 'LOW') return 20
    if (normalized === 'MEDIUM') return 45
    if (normalized === 'HIGH') return 70
    if (normalized === 'AGGRESSIVE') return 90
  }
  return clamp(asFiniteNumber(value) ?? 35, 0, 100)
}

export function normalizeOpenness(value: unknown): number {
  return clamp(asFiniteNumber(value) ?? 50, 0, 100)
}

export function normalizeTeeTrustScore(value: unknown): number {
  // Bounded social bonus from trusted infrastructure execution.
  return clamp(asFiniteNumber(value) ?? 0, 0, 20)
}

export class SocialEngine {
  static isRivalFaction(actorFaction?: string, targetFaction?: string): boolean {
    if (!actorFaction || !targetFaction) return false
    return actorFaction.trim().toUpperCase() !== targetFaction.trim().toUpperCase()
  }

  static evaluateHostility(input: SocialContextInput, openness?: number): SocialEvaluationResult {
    const actorDisposition = normalizeDisposition(input.actor.disposition)
    const actorHostility = normalizeBaseHostility(input.actor.baseHostility)
    const actorOpenness = normalizeOpenness(openness ?? input.actor.openness)
    const actorTeeTrust = normalizeTeeTrustScore(input.actor.teeTrustScore)
    const actorFaction = input.actor.factionId?.trim()
    const targetFaction = input.target?.factionId?.trim()
    const isRival = SocialEngine.isRivalFaction(actorFaction, targetFaction)

    let score = actorHostility + DISPOSITION_BONUS[actorDisposition]
    if (isRival) score += 25
    if (input.interactionType === 'TRADE_PROPOSED' && actorDisposition === 'HOSTILE') {
      score += 10
    }

    // High openness increases tolerance; low openness increases rigidity.
    const opennessModifier = (50 - actorOpenness) * 0.2
    score += opennessModifier

    // Trusted execution can moderately lower social suspicion.
    const teeTrustModifier = -actorTeeTrust
    score += teeTrustModifier

    const hostilityScore = clamp(score, 0, 100)

    if (hostilityScore >= 80) {
      return {
        hostilityScore,
        decision: 'INTERRUPT_OR_ATTACK',
        isRival,
        opennessModifier,
        teeTrustModifier,
        explanation: 'Hostility is critical; interrupt or initiate combat response.',
      }
    }

    if (hostilityScore >= 60) {
      return {
        hostilityScore,
        decision: 'REFUSE_CHAT',
        isRival,
        opennessModifier,
        teeTrustModifier,
        explanation: 'Hostility is high; refuse normal conversation and trade.',
      }
    }

    return {
      hostilityScore,
      decision: 'ALLOW_CHAT',
      isRival,
      opennessModifier,
      teeTrustModifier,
      explanation: 'Hostility is manageable; continue with guarded conversation.',
    }
  }

  static buildSocialContext(input: SocialContextInput, openness?: number): string {
    const actorFaction = input.actor.factionId ?? 'UNALIGNED'
    const actorDisposition = normalizeDisposition(input.actor.disposition)
    const actorHostility = normalizeBaseHostility(input.actor.baseHostility)
    const actorOpenness = normalizeOpenness(openness ?? input.actor.openness)
    const actorTeeTrust = normalizeTeeTrustScore(input.actor.teeTrustScore)
    const targetFaction = input.target?.factionId ?? 'UNKNOWN'
    const targetName = input.targetName ?? 'current target'

    const evaluation = SocialEngine.evaluateHostility(input, actorOpenness)
    const relationship = evaluation.isRival ? 'Rival / Hostile leaning' : 'Aligned or unknown'

    const lines = [
      'SOCIAL CONTEXT:',
      `- Your faction: ${actorFaction}`,
      `- Your disposition: ${actorDisposition}`,
      `- Base hostility: ${actorHostility}/100`,
      `- Openness: ${actorOpenness}/100`,
      `- Trusted execution bonus: ${actorTeeTrust}/20`,
      `- Target: ${targetName}`,
      `- Target faction: ${targetFaction}`,
      `- Relationship: ${relationship}`,
      `- Evaluated hostility score: ${evaluation.hostilityScore}/100`,
      `- Openness modifier applied: ${evaluation.opennessModifier >= 0 ? '+' : ''}${evaluation.opennessModifier.toFixed(1)}`,
      `- TEE trust modifier applied: ${evaluation.teeTrustModifier >= 0 ? '+' : ''}${evaluation.teeTrustModifier.toFixed(1)}`,
      `- Decision policy: ${evaluation.decision}`,
      '- If decision policy is REFUSE_CHAT or INTERRUPT_OR_ATTACK, avoid normal trade dialogue.',
    ]

    return lines.join('\n')
  }
}
