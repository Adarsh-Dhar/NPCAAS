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
 *
 * Mode 3 additions:
 *   - Optional Kite AA bootstrap via GokiteAASDK
 *   - Deterministic master-signer signing for AA user operations
 *   - x402 payment interception for merchant services
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

// Shared event registry used by game clients to color and classify world events.
const WORLD_EVENT_COLOR_BY_TYPE = {
  CHAT: '#60a5fa',
  PAYMENT_SENT: '#67e8f9',
  TRADE_PROPOSED: '#a78bfa',
  TRADE_ACCEPTED: '#38bdf8',
  ITEM_TRANSFERRED: '#22d3ee',
  BROADCAST: '#f59e0b',
  HOSTILITY_TRIGGERED: '#ef4444',
  MANIFEST_ACCEPTED: '#7dd3fc',
  INVENTORY_COMPROMISED: '#c4b5fd',
  BRIEFCASE_LOCATED: '#93c5fd',
  BRIEFCASE_TRANSFERRED: '#22d3ee',
  SECURITY_ALERTED: '#f472b6',
  ESCAPE_ROUTE_OPENED: '#8b5cf6',
  ARTIFACT_INTERCEPTED: '#67e8f9',
  PLAYER_EVENT: '#94a3b8',
}

const WORLD_EVENT_TYPES = Object.freeze(Object.keys(WORLD_EVENT_COLOR_BY_TYPE))

function loadAALibraries() {
  try {
    // Lazily load AA dependencies so legacy API-only consumers keep working.
    // eslint-disable-next-line global-require
    const aaSdk = require('gokite-aa-sdk')
    // eslint-disable-next-line global-require
    const ethers = require('ethers')

    return {
      GokiteAASDK: aaSdk.GokiteAASDK ?? aaSdk.default?.GokiteAASDK ?? aaSdk.default,
      ethers,
    }
  } catch (error) {
    throw new GuildCraftError(
      'Mode 3 AA support requires gokite-aa-sdk and ethers to be installed',
      500,
      { cause: error instanceof Error ? error.message : String(error) }
    )
  }
}

function toOptions(backendPrivateKeyOrOptions) {
  if (typeof backendPrivateKeyOrOptions === 'string') {
    return { backendPrivateKey: backendPrivateKeyOrOptions }
  }
  return backendPrivateKeyOrOptions ?? {}
}

// ---------------------------------------------------------------------------
// GuildCraftClient
// ---------------------------------------------------------------------------

class GuildCraftClient {
  /**
   * @param {string} apiKey   - Must start with "gc_live_"
   * @param {string} baseUrl  - Default: http://localhost:3000/api
   */
  constructor(apiKey, baseUrl = 'http://localhost:3000/api', backendPrivateKeyOrOptions) {
    const mode3Options = toOptions(backendPrivateKeyOrOptions)

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

    this.mode3Options = mode3Options
    this.kiteSdk = null
    this.masterSigner = null
    this.masterEoaAddress = null
    this.signFunction = null
    this._aaLibs = null

    if (mode3Options.backendPrivateKey) {
      this._initializeMode3(mode3Options)
    }
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

  _loadAALibraries() {
    if (!this._aaLibs) {
      this._aaLibs = loadAALibraries()
    }
    return this._aaLibs
  }

  _initializeMode3(options = {}) {
    const { GokiteAASDK, ethers } = this._loadAALibraries()
    const network = options.network ?? 'kite_testnet'
    const rpcUrl = options.rpcUrl ?? 'https://rpc-testnet.gokite.ai'
    const bundlerUrl = options.bundlerUrl ?? 'https://bundler-service.staging.gokite.ai/rpc/'

    this.kiteSdk = new GokiteAASDK(network, rpcUrl, bundlerUrl)
    this.masterSigner = new ethers.Wallet(options.backendPrivateKey)
    this.masterEoaAddress = this.masterSigner.address
    this.signFunction = async (userOpHash) => {
      return this.masterSigner.signMessage(ethers.getBytes(userOpHash))
    }
  }

  _requireMode3() {
    if (!this.kiteSdk || !this.masterSigner || !this.masterEoaAddress || !this.signFunction) {
      throw new GuildCraftError(
        'Mode 3 AA configuration is required for this operation',
        400,
        { hasMode3Config: Boolean(this.mode3Options?.backendPrivateKey) }
      )
    }
    return {
      kiteSdk: this.kiteSdk,
      masterSigner: this.masterSigner,
      masterEoaAddress: this.masterEoaAddress,
      signFunction: this.signFunction,
      ...this._loadAALibraries(),
    }
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
    const response = await this._request('/characters', {
      method: 'POST',
      body: JSON.stringify({ name, config, gameIds }),
    })

    const hasMode3Config = Boolean(
      config.encodedPerformCreateCallData ||
      config.encodedConfigureSpendingRules ||
      config.proxyAddress
    )

    if (!hasMode3Config) {
      return response
    }

    const { kiteSdk, masterEoaAddress, signFunction } = this._requireMode3()

    if (!config.encodedPerformCreateCallData) {
      throw new GuildCraftError(
        'config.encodedPerformCreateCallData is required for Mode 3 deployCharacter',
        400,
        { configKeys: Object.keys(config) }
      )
    }
    if (config.encodedConfigureSpendingRules && !config.proxyAddress) {
      throw new GuildCraftError(
        'config.proxyAddress is required when config.encodedConfigureSpendingRules is provided',
        400,
        { configKeys: Object.keys(config) }
      )
    }

    const npcWalletAddress = kiteSdk.getAccountAddress(masterEoaAddress)
    const deployOp = await kiteSdk.sendUserOperationAndWait(
      masterEoaAddress,
      {
        target: npcWalletAddress,
        value: 0n,
        callData: config.encodedPerformCreateCallData,
      },
      signFunction
    )

    let configureOp = null
    if (config.encodedConfigureSpendingRules && config.proxyAddress) {
      configureOp = await kiteSdk.sendUserOperationAndWait(
        masterEoaAddress,
        {
          target: config.proxyAddress,
          value: 0n,
          callData: config.encodedConfigureSpendingRules,
        },
        signFunction
      )
    }

    const deployTxHash = deployOp?.status?.transactionHash ?? deployOp?.txHash ?? null
    const configureTxHash = configureOp?.status?.transactionHash ?? configureOp?.txHash ?? null

    return {
      ...response,
      aa: {
        enabled: true,
        network: this.mode3Options.network ?? 'kite_testnet',
        walletAddress: npcWalletAddress,
        masterEoaAddress,
        deployTxHash,
        configureTxHash,
        proxyAddress: config.proxyAddress ?? null,
      },
    }
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
   * @param {{item: string, price: number, currency: string, serviceUrl?: string, details?: object}} tradeIntent
   */
  async executeTransaction(characterId, tradeIntent) {
    if (!characterId) throw new GuildCraftError('characterId is required', 400, null)
    if (!tradeIntent) throw new GuildCraftError('tradeIntent is required', 400, null)

    if (tradeIntent.serviceUrl) {
      return this._executeMode3Transaction(characterId, tradeIntent)
    }

    return this._request('/transactions', {
      method: 'POST',
      body: JSON.stringify({ characterId, tradeIntent }),
    })
  }

  async _executeMode3Transaction(characterId, tradeIntent) {
    const { kiteSdk, masterEoaAddress, signFunction } = this._requireMode3()
    const { ethers } = this._loadAALibraries()

    const payload = tradeIntent.details ?? { characterId, tradeIntent }
    let response = await fetch(tradeIntent.serviceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (response.status !== 402) {
      return response.json().catch(async () => {
        const text = await response.text().catch(() => '')
        return { success: response.ok, status: response.status, message: text }
      })
    }

    const paymentInfo = await response.json().catch(() => ({}))
    const accepts = Array.isArray(paymentInfo.accepts) ? paymentInfo.accepts[0] : paymentInfo.accepts

    if (!accepts || !accepts.asset || !accepts.payTo || accepts.maxAmountRequired == null) {
      throw new GuildCraftError('x402 payment payload is missing required accepts fields', 402, paymentInfo)
    }

    if (!ethers.isAddress(accepts.asset) || !ethers.isAddress(accepts.payTo)) {
      throw new GuildCraftError('x402 payment payload contains invalid addresses', 402, paymentInfo)
    }

    const transferAmount = typeof accepts.maxAmountRequired === 'bigint'
      ? accepts.maxAmountRequired
      : BigInt(String(accepts.maxAmountRequired))

    const batchRequest = {
      targets: [accepts.asset],
      values: [0n],
      callDatas: [
        new ethers.Interface(['function transfer(address to, uint256 amount)']).encodeFunctionData('transfer', [
          accepts.payTo,
          transferAmount,
        ]),
      ],
    }

    const paymentOp = await kiteSdk.sendUserOperationAndWait(
      masterEoaAddress,
      batchRequest,
      signFunction
    )

    const paymentHash =
      paymentOp?.status?.transactionHash ??
      paymentOp?.txHash ??
      paymentOp?.userOpHash ??
      null

    const paymentReceiptHeader = Buffer.from(JSON.stringify({
      authorization: paymentHash,
      network: this.mode3Options.network ?? 'kite_testnet',
    })).toString('base64')

    response = await fetch(tradeIntent.serviceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Payment': paymentReceiptHeader,
      },
      body: JSON.stringify(payload),
    })

    return response.json().catch(async () => {
      const text = await response.text().catch(() => '')
      return {
        success: response.ok,
        status: response.status,
        message: text,
        paymentHash,
      }
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

  async getNpcLogs(npcId, opts = {}) {
    return this.getLogs(npcId, opts)
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
  module.exports = {
    GuildCraftClient,
    GuildCraftError,
    WORLD_EVENT_COLOR_BY_TYPE,
    WORLD_EVENT_TYPES,
  }
}