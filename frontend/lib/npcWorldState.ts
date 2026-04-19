// frontend/lib/npcWorldState.ts
// Keeps a live registry of every active NPC so each agent can see
// who else is in the "room" before every LLM call.

export interface NpcPublicProfile {
  id: string
  name: string
  walletAddress: string
  projectId?: string
  projectIds?: string[]
  factionAffiliations?: string
  role?: string          // "scavenger", "crafter", etc.
  canTrade: boolean
  interGameTransactionsEnabled?: boolean
  smartAccountStatus?: string
  isDeployedOnChain?: boolean
  teeAttestationProof?: string | null
  config?: Record<string, unknown>
  adaptation?: Record<string, unknown>
  adaptationSummary?: string
  lastAction?: string
  lastActionAt?: string
}

class NpcWorldState {
  private registry = new Map<string, NpcPublicProfile>()

  register(profile: NpcPublicProfile) {
    const existing = this.registry.get(profile.id)
    this.registry.set(profile.id, {
      ...existing,
      ...profile,
      lastAction: profile.lastAction ?? existing?.lastAction,
      lastActionAt: profile.lastActionAt ?? existing?.lastActionAt,
    })
  }

  unregister(id: string) {
    this.registry.delete(id)
  }

  getAll(): NpcPublicProfile[] {
    return [...this.registry.values()]
  }

  getOthers(excludeId: string): NpcPublicProfile[] {
    return this.getAll().filter(p => p.id !== excludeId)
  }

  getOthersInProject(excludeId: string, projectId?: string): NpcPublicProfile[] {
    const others = this.getOthers(excludeId)
    if (!projectId) return others
    return others.filter((profile) => {
      const projectIds = profile.projectIds ?? (profile.projectId ? [profile.projectId] : [])
      return projectIds.includes(projectId)
    })
  }

  updateLastAction(id: string, action: string) {
    const profile = this.registry.get(id)
    if (profile) {
      profile.lastAction = action
      profile.lastActionAt = new Date().toISOString()
    }
  }

  private hydrateLiveState(profile: NpcPublicProfile): NpcPublicProfile {
    const live = this.registry.get(profile.id)
    if (!live) {
      return profile
    }

    return {
      ...profile,
      lastAction: profile.lastAction ?? live.lastAction,
      lastActionAt: profile.lastActionAt ?? live.lastActionAt,
    }
  }

  private formatProfile(profile: NpcPublicProfile): string {
    const projectIds = profile.projectIds ?? (profile.projectId ? [profile.projectId] : [])
    const configSummary = profile.config ? JSON.stringify(profile.config) : '{}'
    const adaptationSummary = profile.adaptation ? JSON.stringify(profile.adaptation) : '{}'

    const metadata = [
      `projects=${projectIds.length > 0 ? projectIds.join(',') : 'none'}`, 
      `wallet=${profile.walletAddress}`,
      `faction=${profile.factionAffiliations ?? 'None'}`,
      `role=${profile.role ?? 'unknown'}`,
      `canTrade=${profile.canTrade}`,
      `interGameTransactionsEnabled=${profile.interGameTransactionsEnabled !== false}`,
      `smartAccountStatus=${profile.smartAccountStatus ?? 'unknown'}`,
      `isDeployedOnChain=${profile.isDeployedOnChain ?? true}`,
      `teeAttestationProof=${profile.teeAttestationProof ? 'present' : 'missing'}`,
      `lastAction=${profile.lastAction ?? 'none'}`,
      `lastActionAt=${profile.lastActionAt ?? 'unknown'}`,
      `config=${configSummary}`,
      `adaptation=${adaptationSummary}`,
    ]

    return `- ${profile.name} (${profile.id}): ${metadata.join('; ')}`
  }

  buildWorldContextPrompt(forNpcId: string, projectId?: string, roster?: NpcPublicProfile[]): string {
    const baseOthers = roster ?? this.getOthersInProject(forNpcId, projectId)
    const others = baseOthers.map((profile) => this.hydrateLiveState(profile))
    if (others.length === 0) return ''

    const lines = others.map((npc) => this.formatProfile(npc))

    return (
      `\n\n--- SHARED ENVIRONMENT ---\n` +
      `Other NPCs currently inside this game:\n` +
      lines.join('\n') +
      `\n\nUse the in-world NPC roster as live context for decisions, diplomacy, coordination, and trade. ` +
      `When you want to address another NPC, reference them by name exactly as listed above.`
    )
  }
}

export const worldState = new NpcWorldState()