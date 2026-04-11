// frontend/lib/npcWorldState.ts
// Keeps a live registry of every active NPC so each agent can see
// who else is in the "room" before every LLM call.

export interface NpcPublicProfile {
  id: string
  name: string
  walletAddress: string
  factionAffiliations?: string
  role?: string          // "scavenger", "crafter", etc.
  canTrade: boolean
  lastAction?: string
  lastActionAt?: string
}

class NpcWorldState {
  private registry = new Map<string, NpcPublicProfile>()

  register(profile: NpcPublicProfile) {
    this.registry.set(profile.id, profile)
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

  updateLastAction(id: string, action: string) {
    const profile = this.registry.get(id)
    if (profile) {
      profile.lastAction = action
      profile.lastActionAt = new Date().toISOString()
    }
  }

  buildWorldContextPrompt(forNpcId: string): string {
    const others = this.getOthers(forNpcId)
    if (others.length === 0) return ''

    const lines = others.map(npc =>
      `- ${npc.name} (role: ${npc.role ?? 'unknown'}, wallet: ${npc.walletAddress.slice(0, 8)}…, ` +
      `canTrade: ${npc.canTrade}${npc.lastAction ? `, last action: ${npc.lastAction}` : ''})`
    )

    return (
      `\n\n--- SHARED ENVIRONMENT ---\n` +
      `Other agents present in this world:\n` +
      lines.join('\n') +
      `\n\nYou may use the tools "speak_to_agent" or "initiate_trade" to interact with them.\n` +
      `When you want to trade with another NPC, reference them by name exactly as listed above.`
    )
  }
}

export const worldState = new NpcWorldState()