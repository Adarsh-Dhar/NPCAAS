import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/lib/generated/prisma/client'
import {
  normalizeBaseHostility,
  normalizeDisposition,
  type Disposition,
} from '@/lib/social-engine'

interface SocialSnapshot {
  factionId?: string
  disposition: Disposition
  baseHostility: number
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function asSocialSnapshot(config: unknown): SocialSnapshot {
  const payload = asRecord(config)
  const factionIdRaw = payload.factionId ?? payload.factions
  const factionId = typeof factionIdRaw === 'string' && factionIdRaw.trim() ? factionIdRaw.trim() : undefined

  return {
    factionId,
    disposition: normalizeDisposition(payload.disposition),
    baseHostility: normalizeBaseHostility(payload.baseHostility ?? payload.hostility),
  }
}

async function updateCharacterSocialConfig(
  characterId: string,
  updater: (current: SocialSnapshot) => SocialSnapshot,
  eventType: string,
  details: Record<string, unknown>
): Promise<SocialSnapshot> {
  const character = await (prisma.character as any).findUnique({
    where: { id: characterId },
    select: { id: true, config: true },
  })

  if (!character) {
    throw new Error('Character not found for social mutation.')
  }

  const current = asSocialSnapshot(character.config)
  const next = updater(current)
  const existingConfig = asRecord(character.config)

  const nextConfig: Record<string, unknown> = {
    ...existingConfig,
    factionId: next.factionId,
    disposition: next.disposition,
    baseHostility: next.baseHostility,
    factions: next.factionId,
  }

  await prisma.character.update({
    where: { id: characterId },
    data: { config: nextConfig as unknown as Prisma.InputJsonValue },
  })

  await (prisma as any).npcLog.create({
    data: {
      characterId,
      eventType,
      details,
    },
  })

  return next
}

export async function joinFaction(
  characterId: string,
  factionId: string
): Promise<SocialSnapshot> {
  const nextFaction = factionId.trim().toUpperCase().replace(/\s+/g, '_')
  if (!nextFaction) {
    throw new Error('Faction id is required.')
  }

  return updateCharacterSocialConfig(
    characterId,
    (current) => ({
      ...current,
      factionId: nextFaction,
      disposition: current.disposition === 'HOSTILE' ? 'NEUTRAL' : current.disposition,
    }),
    'SOCIAL_JOIN_FACTION',
    { factionId: nextFaction }
  )
}

export async function betrayAlly(
  characterId: string,
  factionId: string,
  reason?: string
): Promise<SocialSnapshot> {
  const targetFaction = factionId.trim().toUpperCase().replace(/\s+/g, '_')

  return updateCharacterSocialConfig(
    characterId,
    (current) => {
      const hostilityBoost = Math.min(current.baseHostility + 20, 100)
      const nextDisposition: Disposition = hostilityBoost >= 65 ? 'HOSTILE' : 'NEUTRAL'
      const nextFaction = current.factionId === targetFaction ? undefined : current.factionId

      return {
        factionId: nextFaction,
        disposition: nextDisposition,
        baseHostility: hostilityBoost,
      }
    },
    'SOCIAL_BETRAY_ALLY',
    { factionId: targetFaction, reason: reason ?? 'No reason provided' }
  )
}

export async function declareHostility(
  characterId: string,
  targetFactionId: string,
  severity: number
): Promise<SocialSnapshot> {
  const targetFaction = targetFactionId.trim().toUpperCase().replace(/\s+/g, '_')
  const hostility = normalizeBaseHostility(severity)

  return updateCharacterSocialConfig(
    characterId,
    (current) => ({
      ...current,
      disposition: 'HOSTILE',
      baseHostility: Math.max(current.baseHostility, hostility),
    }),
    'SOCIAL_DECLARE_HOSTILITY',
    { targetFactionId: targetFaction, severity: hostility }
  )
}
