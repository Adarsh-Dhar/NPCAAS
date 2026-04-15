import { eventBus, type WorldEvent } from '@/lib/npcEventBus'
import { prisma } from '@/lib/prisma'
import { SocialEngine, type SocialConfig } from '@/lib/social-engine'

interface NpcReactiveProfile {
  npcId: string
  npcName: string
  projectId: string
  social: SocialConfig
}

const profiles = new Map<string, NpcReactiveProfile>()
const unsubscribers = new Map<string, () => void>()

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function shouldEvaluateEvent(event: WorldEvent, projectId: string): boolean {
  if (event.actionType !== 'CHAT' && event.actionType !== 'TRADE_PROPOSED') {
    return false
  }

  const payloadProjectId = asString(event.payload.projectId)
  return payloadProjectId === projectId
}

async function enqueueHostileReaction(
  profile: NpcReactiveProfile,
  event: WorldEvent,
  hostilityScore: number,
  decision: 'REFUSE_CHAT' | 'INTERRUPT_OR_ATTACK'
): Promise<void> {
  const actionType = decision === 'INTERRUPT_OR_ATTACK' ? 'COMBAT_INIT' : 'INTERRUPT'
  const description =
    decision === 'INTERRUPT_OR_ATTACK'
      ? `Hostile intervention against ${event.sourceName} (score ${hostilityScore}).`
      : `Refused engagement with rival ${event.sourceName} (score ${hostilityScore}).`

  const existing = await (prisma as any).actionQueue.findFirst({
    where: {
      characterId: profile.npcId,
      status: 'PENDING',
      actionType,
      payload: {
        path: ['sourceId'],
        equals: event.sourceId,
      },
    },
  }).catch(() => null)

  if (existing) return

  const created = await (prisma as any).actionQueue.create({
    data: {
      characterId: profile.npcId,
      actionType,
      status: 'PENDING',
      executeAt: new Date(),
      payload: {
        description,
        sourceId: event.sourceId,
        sourceName: event.sourceName,
        sourceFactionId: asString(event.payload.sourceFactionId) ?? null,
        triggerAction: event.actionType,
        hostilityScore,
      },
    },
  })

  await (prisma as any).npcLog.create({
    data: {
      characterId: profile.npcId,
      eventType: 'HOSTILITY_TRIGGERED',
      details: {
        actionId: created.id,
        against: event.sourceName,
        triggerAction: event.actionType,
        hostilityScore,
        decision,
      },
    },
  })
}

async function handleEvent(profile: NpcReactiveProfile, event: WorldEvent): Promise<void> {
  if (!shouldEvaluateEvent(event, profile.projectId)) return

  const interactionType =
    event.actionType === 'TRADE_PROPOSED' ? 'TRADE_PROPOSED' : 'CHAT'

  const sourceFactionId = asString(event.payload.sourceFactionId)
  const evaluation = SocialEngine.evaluateHostility({
    actor: profile.social,
    target: { factionId: sourceFactionId },
    targetName: event.sourceName,
    interactionType,
  })

  if (!evaluation.isRival) return
  if (evaluation.decision === 'ALLOW_CHAT') return

  await enqueueHostileReaction(
    profile,
    event,
    evaluation.hostilityScore,
    evaluation.decision === 'INTERRUPT_OR_ATTACK' ? 'INTERRUPT_OR_ATTACK' : 'REFUSE_CHAT'
  )
}

export function ensureNpcSocialSubscription(profile: NpcReactiveProfile): void {
  profiles.set(profile.npcId, profile)

  if (unsubscribers.has(profile.npcId)) return

  const unsubscribe = eventBus.subscribeNpc(profile.npcId, (event) => {
    const activeProfile = profiles.get(profile.npcId)
    if (!activeProfile) return

    void handleEvent(activeProfile, event).catch((error) => {
      console.error('[npcSocialReactivity] Failed to process event for NPC', activeProfile.npcId, error)
    })
  })

  unsubscribers.set(profile.npcId, unsubscribe)
}

export function removeNpcSocialSubscription(npcId: string): void {
  const unsubscribe = unsubscribers.get(npcId)
  if (unsubscribe) {
    unsubscribe()
    unsubscribers.delete(npcId)
  }
  profiles.delete(npcId)
}
