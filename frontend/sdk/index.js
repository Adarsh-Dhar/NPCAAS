'use strict'

/**
 * @adarsh23/guildcraft-sdk  v2.0.0
 *
 * JavaScript SDK for integrating GuildCraft NPC agents into any game client.
 *
 * New in v2:
 *   - chatStream()        — EventSource-compatible streaming chat
 *   - getCharacter(id)    — fetch a single character by ID
 *   - All methods now throw a GuildCraftError with status + body attached
 */

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

class GuildCraftError extends Error {
  constructor(message, status, body) {
    super(message)
    this.name    = 'GuildCraftError'
    this.status  = status
    this.body    = body
  }
}

// ---------------------------------------------------------------------------
// GuildCraftClient
// ---------------------------------------------------------------------------

class GuildCraftClient {
  /**
   * @param {string} apiKey   - Must start with "gc_live_"
   * @param {string} baseUrl  - Default: http://localhost:3000/api
   */
  constructor(apiKey, baseUrl = 'http://localhost:3000/api') {
    if (!apiKey || typeof apiKey !== 'string') {
      throw new GuildCraftError('apiKey is required', 400, null)
    }
    if (!apiKey.startsWith('gc_live_')) {
      throw new GuildCraftError(
        'Invalid GuildCraft API key. It must start with "gc_live_"',
        400,
        null
      )
    }
    this.apiKey  = apiKey
    this.baseUrl = baseUrl.replace(/\/$/, '') // strip trailing slash
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  _authHeaders() {
    return {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    }
  }

  async _request(path, options = {}) {
    const url = `${this.baseUrl}${path}`
    const res = await fetch(url, {
      ...options,
      headers: { ...this._authHeaders(), ...(options.headers ?? {}) },
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new GuildCraftError(
        body?.error ?? `HTTP ${res.status} ${res.statusText}`,
        res.status,
        body
      )
    }
    return body
  }

  // ── Characters ───────────────────────────────────────────────────────────

  /**
   * List all characters for the authenticated project.
   * @returns {Promise<Character[]>}
   */
  async getCharacters() {
    return this._request('/characters')
  }

  /**
   * Fetch a single character by ID.
   * @param {string} characterId
   * @returns {Promise<{character: Character, projects: Project[]}>}
   */
  async getCharacter(characterId) {
    if (!characterId) throw new GuildCraftError('characterId is required', 400, null)
    return this._request(`/characters/${encodeURIComponent(characterId)}`)
  }

  /**
   * Deploy (create) a new character.
   * @param {{name: string, config: object, gameIds?: string[]}} params
   */
  async deployCharacter(params) {
    const { name, config, gameIds } = params ?? {}
    if (!name)   throw new GuildCraftError('name is required',   400, null)
    if (!config) throw new GuildCraftError('config is required', 400, null)
    return this._request('/characters', {
      method: 'POST',
      body: JSON.stringify({ name, config, gameIds }),
    })
  }

  /**
   * Update an existing character's config / name.
   * @param {{characterId: string, name?: string, config: object}} params
   */
  async updateCharacter(params) {
    const { characterId, name, config } = params ?? {}
    if (!characterId) throw new GuildCraftError('characterId is required', 400, null)
    return this._request('/characters', {
      method: 'PATCH',
      body: JSON.stringify({ characterId, name, config: config ?? {} }),
    })
  }

  // ── Games ────────────────────────────────────────────────────────────────

  /**
   * Create a new game / project.
   * @param {string} name
   */
  async createGame(name) {
    if (!name) throw new GuildCraftError('name is required', 400, null)
    return this._request('/games', { method: 'POST', body: JSON.stringify({ name }) })
  }

  /**
   * List all games.
   */
  async getGames() {
    return this._request('/games')
  }

  /**
   * List characters assigned to a specific game.
   * @param {string} gameId
   */
  async getGameCharacters(gameId) {
    if (!gameId) throw new GuildCraftError('gameId is required', 400, null)
    return this._request(`/games/${encodeURIComponent(gameId)}/characters`)
  }

  /**
   * Assign one or more characters to a game.
   * @param {string} gameId
   * @param {string|string[]} characterIds
   */
  async assignCharactersToGame(gameId, characterIds) {
    if (!gameId) throw new GuildCraftError('gameId is required', 400, null)
    const ids = Array.isArray(characterIds) ? characterIds : [characterIds]
    return this._request(`/games/${encodeURIComponent(gameId)}/characters`, {
      method: 'POST',
      body: JSON.stringify({ characterIds: ids }),
    })
  }

  // ── Chat ─────────────────────────────────────────────────────────────────

  /**
   * Standard (blocking) chat with an NPC.
   * @param {string} characterId
   * @param {string} message
   * @returns {Promise<ChatResponse>}
   */
  async chat(characterId, message) {
    if (!characterId) throw new GuildCraftError('characterId is required', 400, null)
    if (!message)     throw new GuildCraftError('message is required',     400, null)
    // Support both legacy characterId (UUID) and semantic npcName strings.
    // Accept an optional `opts` third parameter to explicitly provide `npcName`.
    // Backwards compatible: if `opts` is omitted, existing behavior is preserved.
    const opts = arguments[2] ?? {}
    const npcName = opts.npcName ?? characterId
    const charId = opts.characterId ?? characterId
    return this._request('/chat', {
      method: 'POST',
      body: JSON.stringify({ npcName, characterId: charId, message }),
    })
  }

  /**
   * Streaming chat — returns an async generator that yields StreamEvents.
   *
   * Usage (Node.js ≥ 18):
   *   for await (const event of client.chatStream(id, 'Hello')) {
   *     if (event.type === 'text_delta') process.stdout.write(event.delta)
   *     if (event.type === 'done') console.log('Action:', event.final.action)
   *   }
   *
   * @param {string} characterId
   * @param {string} message
   * @yields {StreamEvent}
   */
  async *chatStream(characterId, message) {
    if (!characterId) throw new GuildCraftError('characterId is required', 400, null)
    if (!message)     throw new GuildCraftError('message is required',     400, null)

    const opts = arguments[2] ?? {}
    const npcName = opts.npcName ?? characterId
    const charId = opts.characterId ?? characterId

    const res = await fetch(`${this.baseUrl}/chat/stream`, {
      method: 'POST',
      headers: this._authHeaders(),
      // Send both `npcName` and `characterId` (prefer explicit `opts` when provided).
      body: JSON.stringify({ npcName, characterId: charId, message }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new GuildCraftError(
        body?.error ?? `HTTP ${res.status}`,
        res.status,
        body
      )
    }

    const reader  = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer    = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Parse complete SSE frames (split on double newline)
      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? '' // last element may be incomplete

      for (const frame of frames) {
        const dataLine = frame.trim()
        if (!dataLine.startsWith('data:')) continue
        const json = dataLine.slice('data:'.length).trim()
        if (!json) continue
        try {
          yield JSON.parse(json)
        } catch { /* skip malformed frames */ }
      }
    }
  }

  // ── Transactions ─────────────────────────────────────────────────────────

  /**
   * Execute a trade transaction.
   * @param {string} characterId
   * @param {{item: string, price: number, currency: string}} tradeIntent
   */
  async executeTransaction(characterId, tradeIntent) {
    if (!characterId) throw new GuildCraftError('characterId is required', 400, null)
    if (!tradeIntent) throw new GuildCraftError('tradeIntent is required', 400, null)
    return this._request('/transactions', {
      method: 'POST',
      body: JSON.stringify({ characterId, tradeIntent }),
    })
  }

  // ── NPC Memory ───────────────────────────────────────────────────────────

  /**
   * Get an NPC's current memory state.
   * @param {string} npcId
   * @param {string} [topic]  optional topic filter
   */
  async getMemory(npcId, topic) {
    if (!npcId) throw new GuildCraftError('npcId is required', 400, null)
    const qs = topic ? `?topic=${encodeURIComponent(topic)}` : ''
    return this._request(`/npcs/${encodeURIComponent(npcId)}/memory${qs}`)
  }

  /**
   * Inject facts, rules, or backstory into an NPC's memory.
   * @param {string} npcId
   * @param {{facts?: string[], rules?: string[], backstory?: string[], preferences?: string[]}} payload
   */
  async injectMemory(npcId, payload) {
    if (!npcId) throw new GuildCraftError('npcId is required', 400, null)
    return this._request(`/npcs/${encodeURIComponent(npcId)}/memory`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  /**
   * Clear NPC memory.
   * @param {string} npcId
   * @param {'short'|'long'|'all'} [scope='short']
   */
  async clearMemory(npcId, scope = 'short') {
    if (!npcId) throw new GuildCraftError('npcId is required', 400, null)
    return this._request(
      `/npcs/${encodeURIComponent(npcId)}/memory?scope=${scope}`,
      { method: 'DELETE' }
    )
  }

  // ── NPC Logs ─────────────────────────────────────────────────────────────

  /**
   * Get chronological activity logs for an NPC.
   * @param {string} npcId
   * @param {{limit?: number, type?: string, since?: string}} [opts]
   */
  async getLogs(npcId, opts = {}) {
    if (!npcId) throw new GuildCraftError('npcId is required', 400, null)
    const qs = new URLSearchParams()
    if (opts.limit) qs.set('limit', String(opts.limit))
    if (opts.type)  qs.set('type',  opts.type)
    if (opts.since) qs.set('since', opts.since)
    const query = qs.toString() ? `?${qs}` : ''
    return this._request(`/npcs/${encodeURIComponent(npcId)}/logs${query}`)
  }

  // ── NPC Autonomous Loop ──────────────────────────────────────────────────

  /**
   * Start the NPC's autonomous background loop.
   * @param {string} npcId
   * @param {{schedule?: string, events?: string[], tasks?: string[]}} [config]
   */
  async startLoop(npcId, config = {}) {
    if (!npcId) throw new GuildCraftError('npcId is required', 400, null)
    return this._request(`/npcs/${encodeURIComponent(npcId)}/loop`, {
      method: 'POST',
      body: JSON.stringify(config),
    })
  }

  /**
   * Stop the NPC's autonomous loop.
   * @param {string} npcId
   */
  async stopLoop(npcId) {
    if (!npcId) throw new GuildCraftError('npcId is required', 400, null)
    return this._request(`/npcs/${encodeURIComponent(npcId)}/stop`, { method: 'POST' })
  }

  // ── NPC Action Queue ─────────────────────────────────────────────────────

  /**
   * Get the NPC's pending action queue.
   * @param {string} npcId
   */
  async getActionQueue(npcId) {
    if (!npcId) throw new GuildCraftError('npcId is required', 400, null)
    return this._request(`/npcs/${encodeURIComponent(npcId)}/actions/queue`)
  }

  /**
   * Enqueue a pending action for the NPC.
   * @param {string} npcId
   * @param {{type: string, description: string, payload?: object, scheduledFor?: string}} action
   */
  async enqueueAction(npcId, action) {
    if (!npcId) throw new GuildCraftError('npcId is required', 400, null)
    return this._request(`/npcs/${encodeURIComponent(npcId)}/actions/queue`, {
      method: 'POST',
      body: JSON.stringify(action),
    })
  }

  /**
   * Veto / cancel a pending action from the queue.
   * @param {string} npcId
   * @param {string} actionId
   */
  async vetoAction(npcId, actionId) {
    if (!npcId)    throw new GuildCraftError('npcId is required',    400, null)
    if (!actionId) throw new GuildCraftError('actionId is required', 400, null)
    return this._request(
      `/npcs/${encodeURIComponent(npcId)}/actions/queue?actionId=${encodeURIComponent(actionId)}`,
      { method: 'DELETE' }
    )
  }

  // ── NPC Clone ────────────────────────────────────────────────────────────

  /**
   * Clone an NPC (copies persona + memory, fresh wallet).
   * @param {string} npcId
   * @param {string} [name]  Optional name for the clone
   */
  async cloneNpc(npcId, name) {
    if (!npcId) throw new GuildCraftError('npcId is required', 400, null)
    return this._request(`/npcs/${encodeURIComponent(npcId)}/clone`, {
      method: 'POST',
      body: JSON.stringify(name ? { name } : {}),
    })
  }

  // ── NPC Event Trigger ────────────────────────────────────────────────────

  /**
   * Inject an external event and get the NPC's LLM-generated reaction.
   * @param {string} npcId
   * @param {{event: string, asset?: string, data?: object, recordInMemory?: boolean}} payload
   */
  async triggerEvent(npcId, payload) {
    if (!npcId) throw new GuildCraftError('npcId is required', 400, null)
    return this._request(`/npcs/${encodeURIComponent(npcId)}/trigger`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  // ── NPC Wallet ───────────────────────────────────────────────────────────

  /**
   * Get native + ERC-20 balances for an NPC's wallet.
   * @param {string} npcId
   * @param {string[]} [tokenAddresses]  ERC-20 contract addresses to check
   */
  async getWalletBalances(npcId, tokenAddresses = []) {
    if (!npcId) throw new GuildCraftError('npcId is required', 400, null)
    const qs = tokenAddresses.length ? `?tokens=${tokenAddresses.join(',')}` : ''
    return this._request(`/npcs/${encodeURIComponent(npcId)}/wallet/balances${qs}`)
  }

  // ── Environment ──────────────────────────────────────────────────────────

  /**
   * Read global environment state (network, gas, NPC counts).
   * @param {string[]} [include]  e.g. ['gas', 'npcs', 'network']
   */
  async getEnvironmentState(include) {
    const qs = include ? `?include=${include.join(',')}` : ''
    return this._request(`/environment/state${qs}`)
  }

  /**
   * Broadcast a message to all NPCs in a room / project.
   * @param {{message: string, room?: string, npcIds?: string[], reactAsync?: boolean}} payload
   */
  async broadcast(payload) {
    if (!payload?.message) throw new GuildCraftError('message is required', 400, null)
    return this._request('/environment/broadcast', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  // ── System ───────────────────────────────────────────────────────────────

  /**
   * Get LLM token consumption and compute metrics.
   */
  async getUsage() {
    return this._request('/system/usage')
  }

  // ── Webhooks ─────────────────────────────────────────────────────────────

  /**
   * Register a webhook to receive NPC event notifications.
   * @param {{url: string, events: string[], npcId?: string, secret?: string}} payload
   */
  async registerWebhook(payload) {
    if (!payload?.url)    throw new GuildCraftError('url is required',    400, null)
    if (!payload?.events) throw new GuildCraftError('events is required', 400, null)
    return this._request('/webhooks/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  /**
   * List supported webhook event types.
   */
  async getSupportedWebhookEvents() {
    return this._request('/webhooks/register')
  }
  
  /**
   * NPC-to-NPC interaction — one agent speaks to or trades with another.
   * @param {string} initiatorId  character.id of the speaking NPC
   * @param {string} targetName   character.name of the NPC being addressed
   * @param {string} message      what the initiator says
   * @param {object} [tradeIntent]  optional { item, price, currency }
   */
  async npcInteract(initiatorId, targetName, message, tradeIntent) {
    if (!initiatorId) throw new GuildCraftError('initiatorId is required', 400, null)
    if (!targetName)  throw new GuildCraftError('targetName is required',  400, null)
    if (!message)     throw new GuildCraftError('message is required',     400, null)
    return this._request('/npcs/interact', {
      method: 'POST',
      body: JSON.stringify({ initiatorId, targetName, message, tradeIntent }),
    })
  }
}

// Support CommonJS `require()` in Node environments while avoiding
// a ReferenceError in browser ESM modules (where `module` is undefined).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GuildCraftClient, GuildCraftError }
}