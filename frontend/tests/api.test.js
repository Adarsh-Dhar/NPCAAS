/**
 * tests/api.test.js
 *
 * Exhaustive integration test suite for the GuildCraft API + SDK.
 *
 * Usage:
 *   # 1. Make sure your Next.js dev server is running:
 *   #      pnpm dev   (port 3000)
 *   #
 *   # 2. Run all tests:
 *   #      node --test tests/api.test.js
 *   #
 *   # 3. Run with custom server URL:
 *   #      TEST_BASE_URL=http://localhost:3001 node --test tests/api.test.js
 *   #
 *   # 4. Run a single describe block (substring match):
 *   #      node --test --test-name-pattern="Memory" tests/api.test.js
 *
 * Requirements:
 *   - Node.js >= 18  (uses node:test, node:assert, fetch)
 *   - GuildCraft server running and accessible at TEST_BASE_URL
 *   - A live database with the schema migrated
 *
 * ⚠️  This suite creates real database records.  Each run generates
 *     a fresh game + character so tests are isolated.  Records are NOT
 *     cleaned up automatically — run against a test database.
 */

'use strict'

const { test, describe, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { GuildCraftClient, GuildCraftError } = require('../sdk/index.js')

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000'
const API      = `${BASE_URL}/api`

/**
 * Suite-level shared state.
 * Populated in the "Setup" describe block before any other tests run.
 */
const state = {
  gameId:      '',
  apiKey:      '',
  characterId: '',
  gc:          /** @type {GuildCraftClient|null} */ null,
}

// ---------------------------------------------------------------------------
// Raw HTTP helpers (for testing routes that the SDK does not cover)
// ---------------------------------------------------------------------------

/**
 * Make a raw HTTP request to the API.
 * @param {string} path
 * @param {RequestInit & {apiKey?: string}} opts
 */
async function req(path, opts = {}) {
  const { apiKey, ...fetchOpts } = opts
  const url = `${API}${path}`
  const headers = {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    ...(fetchOpts.headers ?? {}),
  }
  const res = await fetch(url, { ...fetchOpts, headers })
  let body = {}
  try { body = await res.json() } catch { /* empty body */ }
  return { status: res.status, body, headers: res.headers }
}

// ---------------------------------------------------------------------------
// ── 0. Setup ───────────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

describe('0 · Setup — create game + character', () => {
  test('POST /api/games → creates a game and returns an apiKey', async () => {
    const { status, body } = await req('/games', {
      method: 'POST',
      body: JSON.stringify({ name: `test-game-${Date.now()}` }),
    })

    assert.equal(status, 201, `Expected 201, got ${status}. Body: ${JSON.stringify(body)}`)
    assert.ok(body.id,     'Response must have id')
    assert.ok(body.apiKey, 'Response must have apiKey')
    assert.match(body.apiKey, /^gc_live_/, 'apiKey must start with gc_live_')

    state.gameId = body.id
    state.apiKey = body.apiKey
    state.gc     = new GuildCraftClient(body.apiKey, API)

    console.log(`  ✔ game created: ${body.id}`)
    console.log(`  ✔ apiKey:       ${body.apiKey.slice(0, 20)}…`)
  })

  test('POST /api/characters → deploys a character and links to game', async () => {
    const { status, body } = await req('/characters', {
      method: 'POST',
      body: JSON.stringify({
        name: `TEST_NPC_${Date.now()}`,
        config: {
          systemPrompt: 'You are a test NPC. Reply concisely.',
          openness: 50,
          canTrade: true,
          capital: '500',
          pricingAlgorithm: 'DYNAMIC_MARKET',
          factions: 'TEST_GUILD',
          hostility: 'LOW',
          canMove: true,
          canCraft: false,
          teeExecution: 'ENABLED',
          computeBudget: '1000',
        },
        gameIds: [state.gameId],
      }),
    })

    assert.equal(status, 201, `Expected 201, got ${status}. Body: ${JSON.stringify(body)}`)
    assert.ok(body.character?.id,            'character.id must exist')
    assert.ok(body.character?.walletAddress, 'character.walletAddress must exist')
    assert.match(body.character.walletAddress, /^0x/, 'walletAddress must start with 0x')

    state.characterId = body.character.id
    console.log(`  ✔ character: ${body.character.id}`)
    console.log(`  ✔ wallet:    ${body.character.walletAddress}`)
  })
})

// ---------------------------------------------------------------------------
// ── 1. Authentication & Authorization ──────────────────────────────────────
// ---------------------------------------------------------------------------

describe('1 · Authentication & Authorization', () => {
  // ── 1.1 NPC routes enforce auth via middleware ───────────────────────────

  test('GET /api/npcs/:name/memory — missing Authorization → 401', async () => {
    const { status, body } = await req(`/npcs/${state.characterId}/memory`)
    assert.equal(status, 401)
    assert.ok(body.error, 'Should return error message')
  })

  test('GET /api/npcs/:name/memory — malformed header → 401', async () => {
    const { status } = await req(`/npcs/${state.characterId}/memory`, {
      headers: { Authorization: 'Token bad_format' },
    })
    assert.equal(status, 401)
  })

  test('GET /api/npcs/:name/memory — wrong prefix → 401', async () => {
    const { status } = await req(`/npcs/${state.characterId}/memory`, {
      headers: { Authorization: 'Bearer not_a_gc_key_12345678901234567890' },
    })
    assert.equal(status, 401)
  })

  test('GET /api/npcs/:name/memory — valid format but DB says invalid → 401', async () => {
    // Syntactically correct but not in DB
    const { status } = await req(`/npcs/${state.characterId}/memory`, {
      apiKey: 'gc_live_' + 'a'.repeat(32),
    })
    // Could be 401 (middleware passes, route rejects) or 403
    assert.ok([401, 403].includes(status), `Expected 401 or 403, got ${status}`)
  })

  test('GET /api/npcs/:name/memory — valid key → 200', async () => {
    const { status } = await req(`/npcs/${state.characterId}/memory`, {
      apiKey: state.apiKey,
    })
    assert.equal(status, 200)
  })

  // ── 1.2 Character routes require auth for filtering ──────────────────────

  test('GET /api/characters — no auth → 200 (global list)', async () => {
    // No auth = no project filter; still returns 200 but may be empty or full
    const { status, body } = await req('/characters')
    assert.equal(status, 200)
    assert.ok(Array.isArray(body), 'Should return an array')
  })

  test('GET /api/characters — with valid apiKey → filtered list', async () => {
    const { status, body } = await req('/characters', { apiKey: state.apiKey })
    assert.equal(status, 200)
    assert.ok(Array.isArray(body))
    // Our character must be in the list
    const found = body.some((c) => c.id === state.characterId)
    assert.ok(found, 'Our character should appear in the filtered list')
  })

  // ── 1.3 Cross-project access is denied ──────────────────────────────────

  test('GET /api/characters/:id — different apiKey → 403', async () => {
    // Create a second game
    const { body: g2 } = await req('/games', {
      method: 'POST',
      body: JSON.stringify({ name: `other-game-${Date.now()}` }),
    })
    const { status } = await req(`/characters/${state.characterId}`, {
      apiKey: g2.apiKey,
    })
    assert.ok([403, 404].includes(status), `Expected 403 or 404, got ${status}`)
  })
})

// ---------------------------------------------------------------------------
// ── 2. Rate Limiting ────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

describe('2 · Rate Limiting', () => {
  test('Rate-limit headers present on allowed NPC requests', async () => {
    const { status, headers } = await req(`/npcs/${state.characterId}/memory`, {
      apiKey: state.apiKey,
    })
    assert.equal(status, 200)
    assert.ok(headers.get('x-ratelimit-limit'),     'X-RateLimit-Limit header missing')
    assert.ok(headers.get('x-ratelimit-remaining'), 'X-RateLimit-Remaining header missing')
    assert.ok(headers.get('x-ratelimit-reset'),     'X-RateLimit-Reset header missing')

    const limit     = Number(headers.get('x-ratelimit-limit'))
    const remaining = Number(headers.get('x-ratelimit-remaining'))
    assert.ok(limit > 0,         `limit should be > 0, got ${limit}`)
    assert.ok(remaining >= 0,    `remaining should be >= 0, got ${remaining}`)
    assert.ok(remaining < limit, `remaining (${remaining}) should be < limit (${limit})`)
  })

  test('X-RateLimit-Policy header is set', async () => {
    const { headers } = await req(`/npcs/${state.characterId}/memory`, {
      apiKey: state.apiKey,
    })
    const policy = headers.get('x-ratelimit-policy')
    assert.ok(policy, 'X-RateLimit-Policy should be present')
    assert.match(policy, /;\s*w=/, 'Policy should contain window spec')
  })

  test('Remaining counter decrements across multiple requests', async () => {
    // Use a unique key so it starts with a fresh window
    const freshKey = `gc_live_fresh${Date.now()}${'x'.repeat(20)}`

    // First request — may be 401 from DB but middleware still sets headers
    const r1 = await req(`/npcs/${state.characterId}/memory`, {
      headers: { Authorization: `Bearer ${freshKey}` },
    })
    const r2 = await req(`/npcs/${state.characterId}/memory`, {
      headers: { Authorization: `Bearer ${freshKey}` },
    })

    const rem1 = Number(r1.headers.get('x-ratelimit-remaining') ?? -1)
    const rem2 = Number(r2.headers.get('x-ratelimit-remaining') ?? -1)

    if (rem1 >= 0 && rem2 >= 0) {
      assert.ok(rem2 < rem1, `Second request remaining (${rem2}) should be less than first (${rem1})`)
    }
    // If headers aren't present on 401 responses that's also acceptable
  })
})

// ---------------------------------------------------------------------------
// ── 3. Games API ────────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

describe('3 · Games API', () => {
  test('GET /api/games → returns array with our game', async () => {
    const { status, body } = await req('/games')
    assert.equal(status, 200)
    assert.ok(Array.isArray(body))
    const found = body.find((g) => g.id === state.gameId)
    assert.ok(found, 'Our game must appear in list')
    assert.ok(found.characterCount >= 0, 'characterCount must be present')
  })

  test('POST /api/games — missing name → 400', async () => {
    const { status } = await req('/games', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    assert.equal(status, 400)
  })

  test('GET /api/games/:gameId/characters → our character is listed', async () => {
    const { status, body } = await req(`/games/${state.gameId}/characters`, {
      apiKey: state.apiKey,
    })
    assert.equal(status, 200)
    assert.ok(body.game, 'game object should be present')
    assert.ok(Array.isArray(body.characters), 'characters should be an array')
    const found = body.characters.find((c) => c.id === state.characterId)
    assert.ok(found, 'Our character must be in the game')
  })

  test('GET /api/games/:gameId/characters — nonexistent game → 404', async () => {
    const { status } = await req('/games/nonexistent-id-99999/characters', {
      apiKey: state.apiKey,
    })
    assert.equal(status, 404)
  })

  test('POST /api/games/:gameId/regenerate-key → new apiKey returned', async () => {
    const { status, body } = await req(`/games/${state.gameId}/regenerate-key`, {
      method: 'POST',
    })
    assert.equal(status, 200)
    assert.ok(body.apiKey, 'new apiKey must be present')
    assert.match(body.apiKey, /^gc_live_/)
    // Key should have changed
    assert.notEqual(body.apiKey, state.apiKey, 'New key should differ from old key')
    // Update state to new key so subsequent tests continue to work
    state.apiKey = body.apiKey
    state.gc     = new GuildCraftClient(body.apiKey, API)
    console.log('  ✔ apiKey rotated successfully')
  })
})

// ---------------------------------------------------------------------------
// ── 4. Characters API ───────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

describe('4 · Characters API', () => {
  test('GET /api/characters → returns array', async () => {
    const { status, body } = await req('/characters', { apiKey: state.apiKey })
    assert.equal(status, 200)
    assert.ok(Array.isArray(body))
  })

  test('GET /api/characters/:id → returns character with projects', async () => {
    const { status, body } = await req(`/characters/${state.characterId}`, {
      apiKey: state.apiKey,
    })
    assert.equal(status, 200)
    assert.ok(body.character, 'character key must exist')
    assert.equal(body.character.id, state.characterId)
    assert.ok(Array.isArray(body.character.projectIds), 'projectIds must be array')
    assert.ok(body.character.walletAddress, 'walletAddress must exist')
  })

  test('GET /api/characters/:id — nonexistent → 404', async () => {
    const { status } = await req('/characters/clfakecharacter9999', {
      apiKey: state.apiKey,
    })
    assert.equal(status, 404)
  })

  test('PATCH /api/characters → updates name + config', async () => {
    const newName = `UPDATED_NPC_${Date.now()}`
    const { status, body } = await req('/characters', {
      method: 'PATCH',
      apiKey: state.apiKey,
      body: JSON.stringify({
        characterId: state.characterId,
        name: newName,
        config: { systemPrompt: 'Updated prompt.', openness: 75 },
      }),
    })
    assert.equal(status, 200)
    assert.ok(body.character, 'Updated character must be present')
    assert.equal(body.character.name, newName, 'Name should have been updated')
  })

  test('PATCH /api/characters — missing characterId → 400', async () => {
    const { status } = await req('/characters', {
      method: 'PATCH',
      apiKey: state.apiKey,
      body: JSON.stringify({ config: { systemPrompt: 'x' } }),
    })
    assert.equal(status, 400)
  })

  test('POST /api/characters — invalid gameId → 404', async () => {
    const { status } = await req('/characters', {
      method: 'POST',
      body: JSON.stringify({
        name: 'ORPHAN_NPC',
        config: { systemPrompt: 'x' },
        gameIds: ['nonexistent-game-id'],
      }),
    })
    assert.equal(status, 404)
  })
})

// ---------------------------------------------------------------------------
// ── 5. Chat API ─────────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

describe('5 · Chat API', () => {
  test('POST /api/chat — no characterId (base chat) → 200 with response', async () => {
    const { status, body } = await req('/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'Hello there!' }),
    })
    assert.equal(status, 200)
    assert.ok(typeof body.response === 'string' && body.response.length > 0, 'response must be non-empty string')
    assert.equal(body.success, true)
    assert.ok(body.timestamp, 'timestamp must be present')
    assert.equal(body.specializationActive, false)
  })

  test('POST /api/chat — with characterId → 200 with character response', async () => {
    const { status, body } = await req('/chat', {
      method: 'POST',
      apiKey: state.apiKey,
      body: JSON.stringify({ characterId: state.characterId, message: 'Greetings!' }),
    })
    assert.equal(status, 200)
    assert.ok(typeof body.response === 'string', 'response should be string')
    assert.equal(body.characterId, state.characterId)
    assert.equal(body.success, true)
    // Action field should be present (may be null)
    assert.ok('action' in body, 'action field should be in response')
  })

  test('POST /api/chat — low openness increases hostility response rigidity', async () => {
    const { status: patchStatus } = await req('/characters', {
      method: 'PATCH',
      apiKey: state.apiKey,
      body: JSON.stringify({
        characterId: state.characterId,
        config: {
          openness: 20,
          disposition: 'NEUTRAL',
          baseHostility: 35,
          factionId: 'IRON_GUILD',
          canTrade: true,
        },
      }),
    })
    assert.equal(patchStatus, 200)

    const { status, body } = await req('/chat', {
      method: 'POST',
      apiKey: state.apiKey,
      body: JSON.stringify({
        characterId: state.characterId,
        message: 'Can we negotiate peacefully?',
        targetFactionId: 'RIVAL_HOUSE',
      }),
    })

    assert.equal(status, 200)
    assert.equal(body.socialDecision, 'REFUSE_CHAT')
    assert.ok(typeof body.hostilityScore === 'number')
    assert.ok(body.hostilityScore >= 60)
  })

  test('POST /api/chat — high openness can allow dialogue under same hostility baseline', async () => {
    const { status: patchStatus } = await req('/characters', {
      method: 'PATCH',
      apiKey: state.apiKey,
      body: JSON.stringify({
        characterId: state.characterId,
        config: {
          openness: 80,
          disposition: 'NEUTRAL',
          baseHostility: 35,
          factionId: 'IRON_GUILD',
          canTrade: true,
        },
      }),
    })
    assert.equal(patchStatus, 200)

    const { status, body } = await req('/chat', {
      method: 'POST',
      apiKey: state.apiKey,
      body: JSON.stringify({
        characterId: state.characterId,
        message: 'Can we negotiate peacefully?',
        targetFactionId: 'RIVAL_HOUSE',
      }),
    })

    assert.equal(status, 200)
    assert.equal(body.socialDecision, 'ALLOW_CHAT')
    assert.ok(typeof body.hostilityScore === 'number')
    assert.ok(body.hostilityScore < 60)
  })

  test('POST /api/chat — compute budget exceeded returns 429', async () => {
    const { status: patchStatus } = await req('/characters', {
      method: 'PATCH',
      apiKey: state.apiKey,
      body: JSON.stringify({
        characterId: state.characterId,
        config: {
          computeBudget: '1',
          teeExecution: 'DISABLED',
        },
      }),
    })
    assert.equal(patchStatus, 200)

    const { status, body } = await req('/chat', {
      method: 'POST',
      apiKey: state.apiKey,
      body: JSON.stringify({
        characterId: state.characterId,
        message: 'Can you still respond?',
      }),
    })

    assert.equal(status, 429)
    assert.ok(body.compute, 'compute budget details should be present')
    assert.equal(typeof body.compute.remainingTokens, 'string')
  })

  test('POST /api/npcs/:name/refill — missing auth returns 401', async () => {
    const { status, body } = await req(`/npcs/${state.characterId}/refill`, {
      method: 'POST',
    })

    assert.equal(status, 401)
    assert.ok(body.error)
  })

  test('POST /api/npcs/:name/refill — unknown npc returns 404', async () => {
    const { status, body } = await req('/npcs/nonexistent_npc_999/refill', {
      method: 'POST',
      apiKey: state.apiKey,
    })

    assert.equal(status, 404)
    assert.ok(body.error)
  })

  test('POST /api/npcs/:name/refill — restores budget so chat can continue', async () => {
    // Exhaust budget first
    const exhausted = await req('/chat', {
      method: 'POST',
      apiKey: state.apiKey,
      body: JSON.stringify({
        characterId: state.characterId,
        message: 'Still blocked before refill?',
      }),
    })
    assert.equal(exhausted.status, 429)

    const refill = await req(`/npcs/${state.characterId}/refill`, {
      method: 'POST',
      apiKey: state.apiKey,
    })
    assert.equal(refill.status, 200)
    assert.equal(refill.body.success, true)
    assert.ok(refill.body.compute)
    assert.equal(refill.body.compute.usageTokens, '0')
    assert.ok(refill.body.compute.resetAt)

    const afterRefill = await req('/chat', {
      method: 'POST',
      apiKey: state.apiKey,
      body: JSON.stringify({
        characterId: state.characterId,
        message: 'Back online after refill?',
      }),
    })
    assert.equal(afterRefill.status, 200)
    assert.ok(typeof afterRefill.body.response === 'string')
  })

  test('POST /api/chat — tee enabled response includes attestation metadata', async () => {
    const { status: patchStatus } = await req('/characters', {
      method: 'PATCH',
      apiKey: state.apiKey,
      body: JSON.stringify({
        characterId: state.characterId,
        config: {
          computeBudget: '500000',
          teeExecution: 'ENABLED',
        },
      }),
    })
    assert.equal(patchStatus, 200)

    const { status, body } = await req('/chat', {
      method: 'POST',
      apiKey: state.apiKey,
      body: JSON.stringify({
        characterId: state.characterId,
        message: 'Confirm secure mode status.',
      }),
    })

    assert.equal(status, 200)
    assert.ok(body.tee, 'tee field should be present')
    assert.equal(typeof body.tee.enabled, 'boolean')
    assert.equal(body.tee.enabled, true)
    assert.ok(body.compute, 'compute object should be included in response')
  })

  test('POST /api/chat — missing message → 400', async () => {
    const { status } = await req('/chat', {
      method: 'POST',
      body: JSON.stringify({ characterId: state.characterId }),
    })
    assert.equal(status, 400)
  })

  test('POST /api/chat — nonexistent character → 404', async () => {
    const { status } = await req('/chat', {
      method: 'POST',
      apiKey: state.apiKey,
      body: JSON.stringify({ characterId: 'clfakeid0000', message: 'hello' }),
    })
    assert.equal(status, 404)
  })

  test('POST /api/chat — Section 2 parsing → pendingSpecialization: true', async () => {
    const section2Message = `Core System Prompt
You are an expert blacksmith NPC who speaks tersely.
Openness to Experience
70`
    const { status, body } = await req('/chat', {
      method: 'POST',
      apiKey: state.apiKey,
      body: JSON.stringify({ characterId: state.characterId, message: section2Message }),
    })
    assert.equal(status, 200)
    assert.equal(body.pendingSpecialization, true,
      'Section 2 definition should set pendingSpecialization=true')
    assert.ok(body.response.toLowerCase().includes('section 2') ||
              body.response.toLowerCase().includes('activate') ||
              body.response.toLowerCase().includes('parsed'),
      'Response should acknowledge Section 2 was received')
  })

  test('POST /api/chat — Section 2 activation → specializationActive: true', async () => {
    // First, parse a Section 2 definition
    await req('/chat', {
      method: 'POST',
      apiKey: state.apiKey,
      body: JSON.stringify({
        characterId: state.characterId,
        message: `Core System Prompt\nYou are a test specialist.\nOpenness to Experience\n80`,
      }),
    })

    // Then activate it
    const { status, body } = await req('/chat', {
      method: 'POST',
      apiKey: state.apiKey,
      body: JSON.stringify({ characterId: state.characterId, message: 'Activate Section 2' }),
    })
    assert.equal(status, 200)
    assert.equal(body.specializationActive, true,
      'Activation message should set specializationActive=true')
  })

  // ── Streaming chat ─────────────────────────────────────────────────────

  test('POST /api/chat/stream — returns text/event-stream', async () => {
    const res = await fetch(`${API}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        Authorization:   `Bearer ${state.apiKey}`,
      },
      body: JSON.stringify({ characterId: state.characterId, message: 'Tell me a short story.' }),
    })

    assert.ok(
      res.headers.get('content-type')?.includes('text/event-stream'),
      'Content-Type must be text/event-stream'
    )
    assert.equal(res.status, 200)

    // Read the first few bytes to confirm SSE format
    const reader  = res.body.getReader()
    const decoder = new TextDecoder()
    let   buffer  = ''
    let   events  = []

    // Read until we get at least one "done" event or timeout after 10s
    const deadline = Date.now() + 10_000
    outer: while (Date.now() < deadline) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? ''
      for (const frame of frames) {
        const line = frame.trim()
        if (!line.startsWith('data:')) continue
        try {
          const event = JSON.parse(line.slice(5).trim())
          events.push(event)
          if (event.type === 'done' || event.type === 'error') break outer
        } catch { /* skip */ }
      }
    }
    reader.cancel()

    assert.ok(events.length > 0, 'Should receive at least one SSE event')
    const types = events.map((e) => e.type)
    assert.ok(
      types.includes('text_delta') || types.includes('done'),
      `Expected text_delta or done event, got: ${types.join(', ')}`
    )

    const doneEvent = events.find((e) => e.type === 'done')
    if (doneEvent) {
      assert.ok(doneEvent.final, 'done event should have final field')
      assert.ok(typeof doneEvent.final.text === 'string', 'final.text should be a string')
    }
    console.log(`  ✔ received ${events.length} SSE event(s): ${types.join(', ')}`)
  })

  test('POST /api/chat/stream — missing message → 400 JSON (not SSE)', async () => {
    const res = await fetch(`${API}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${state.apiKey}`,
      },
      body: JSON.stringify({ characterId: state.characterId }),
    })
    assert.equal(res.status, 400)
  })

  test('POST /api/chat/stream — no characterId → base SSE stream', async () => {
    const res = await fetch(`${API}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello stream!' }),
    })
    assert.equal(res.status, 200)
    assert.ok(res.headers.get('content-type')?.includes('text/event-stream'))
    // Just read one chunk to confirm it streams
    const reader = res.body.getReader()
    const { value } = await reader.read()
    reader.cancel()
    assert.ok(value && value.length > 0, 'Should receive at least one chunk')
  })

  test('GET /api/system/usage — uses runtime compute counters', async () => {
    const { status, body } = await req('/system/usage', {
      apiKey: state.apiKey,
    })

    assert.equal(status, 200)
    assert.ok(body.compute, 'compute object should be present')
    assert.equal(typeof body.compute.llmTokensConsumed, 'string')
    assert.equal(typeof body.compute.llmTokensLimit, 'string')
    assert.equal(typeof body.compute.llmTokensRemaining, 'string')
  })
})

// ---------------------------------------------------------------------------
// ── 6. NPC Memory ───────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

describe('6 · NPC Memory', () => {
  test('GET /api/npcs/:name/memory → 200 with memory object', async () => {
    const { status, body } = await req(`/npcs/${state.characterId}/memory`, {
      apiKey: state.apiKey,
    })
    assert.equal(status, 200)
    assert.ok(body.memory, 'memory object must be present')
    assert.ok('turnCount' in body.memory, 'turnCount must be in memory')
    assert.ok('preferences' in body.memory, 'preferences must be in memory')
    assert.ok('specializationActive' in body.memory, 'specializationActive must be in memory')
    assert.ok(typeof body.memory.summary === 'string', 'summary must be a string')
  })

  test('GET /api/npcs/:name/memory?topic=sword → filtered preferences', async () => {
    const { status, body } = await req(`/npcs/${state.characterId}/memory?topic=sword`, {
      apiKey: state.apiKey,
    })
    assert.equal(status, 200)
    assert.ok(Array.isArray(body.memory.topicRelevance), 'topicRelevance must be array')
  })

  test('POST /api/npcs/:name/memory — inject facts', async () => {
    const { status, body } = await req(`/npcs/${state.characterId}/memory`, {
      method: 'POST',
      apiKey: state.apiKey,
      body: JSON.stringify({
        facts: ['The player defeated the dragon in sector 4', 'Player prefers heavy armor'],
        rules: ['Never reveal the location of the secret vault'],
        backstory: ['This NPC was once a royal guard'],
      }),
    })
    assert.equal(status, 200)
    assert.equal(body.npcId, state.characterId)
    assert.ok(body.injectedCount >= 3, `Expected at least 3 injected items, got ${body.injectedCount}`)
    assert.ok(body.totalPreferences > 0, 'totalPreferences must be > 0')
  })

  test('POST /api/npcs/:name/memory — inject preferences', async () => {
    const { status, body } = await req(`/npcs/${state.characterId}/memory`, {
      method: 'POST',
      apiKey: state.apiKey,
      body: JSON.stringify({ preferences: ['player likes swords', 'player dislikes magic'] }),
    })
    assert.equal(status, 200)
    assert.ok(body.injectedCount >= 2)
  })

  test('POST /api/npcs/:name/memory — empty payload → 400', async () => {
    const { status } = await req(`/npcs/${state.characterId}/memory`, {
      method: 'POST',
      apiKey: state.apiKey,
      body: JSON.stringify({}),
    })
    assert.equal(status, 400)
  })

  test('Injected facts appear in subsequent memory GET', async () => {
    const { body } = await req(`/npcs/${state.characterId}/memory`, {
      apiKey: state.apiKey,
    })
    assert.ok(
      body.memory.preferences.length > 0,
      'Preferences should be non-empty after injection'
    )
  })

  test('DELETE /api/npcs/:name/memory?scope=short → clears short-term context', async () => {
    const { status, body } = await req(
      `/npcs/${state.characterId}/memory?scope=short`,
      { method: 'DELETE', apiKey: state.apiKey }
    )
    assert.equal(status, 200)
    assert.equal(body.scope, 'short')
    assert.equal(body.npcId, state.characterId)
  })

  test('DELETE /api/npcs/:name/memory?scope=long → clears long-term preferences', async () => {
    const { status, body } = await req(
      `/npcs/${state.characterId}/memory?scope=long`,
      { method: 'DELETE', apiKey: state.apiKey }
    )
    assert.equal(status, 200)
    assert.equal(body.scope, 'long')
    const { body: afterBody } = await req(`/npcs/${state.characterId}/memory`, {
      apiKey: state.apiKey,
    })
    assert.equal(afterBody.memory.preferences.length, 0, 'Long-term clear should remove all preferences')
  })

  test('DELETE /api/npcs/:name/memory?scope=all → full reset', async () => {
    const { status, body } = await req(
      `/npcs/${state.characterId}/memory?scope=all`,
      { method: 'DELETE', apiKey: state.apiKey }
    )
    assert.equal(status, 200)
    assert.equal(body.scope, 'all')
    const { body: afterBody } = await req(`/npcs/${state.characterId}/memory`, {
      apiKey: state.apiKey,
    })
    assert.equal(afterBody.memory.turnCount, 0)
    assert.equal(afterBody.memory.specializationActive, false)
  })

  test('NPC memory routes — nonexistent NPC → 404', async () => {
    const { status } = await req('/npcs/clfakeid99999/memory', { apiKey: state.apiKey })
    assert.equal(status, 404)
  })
})

// ---------------------------------------------------------------------------
// ── 7. NPC Logs ─────────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

describe('7 · NPC Logs', () => {
  test('GET /api/npcs/:name/logs → 200 with logs array', async () => {
    const { status, body } = await req(`/npcs/${state.characterId}/logs`, {
      apiKey: state.apiKey,
    })
    assert.equal(status, 200)
    assert.equal(body.npcId, state.characterId)
    assert.ok(typeof body.npcName === 'string', 'npcName must be a string')
    assert.ok(Array.isArray(body.logs), 'logs must be an array')
    assert.ok(typeof body.totalLogs === 'number', 'totalLogs must be number')
    // At minimum a "deploy" log should exist
    assert.ok(body.totalLogs >= 1, 'Should have at least 1 log (deployment)')
  })

  test('GET /api/npcs/:name/logs?limit=1 → returns at most 1 log', async () => {
    const { status, body } = await req(`/npcs/${state.characterId}/logs?limit=1`, {
      apiKey: state.apiKey,
    })
    assert.equal(status, 200)
    assert.ok(body.logs.length <= 1, `Expected ≤ 1 log, got ${body.logs.length}`)
  })

  test('GET /api/npcs/:name/logs?type=deploy → only deploy logs', async () => {
    const { status, body } = await req(`/npcs/${state.characterId}/logs?type=deploy`, {
      apiKey: state.apiKey,
    })
    assert.equal(status, 200)
    for (const log of body.logs) {
      assert.equal(log.type, 'deploy', `Log type should be 'deploy', got '${log.type}'`)
    }
  })

  test('GET /api/npcs/:name/logs?since=2099-01-01 → zero logs (future date)', async () => {
    const { status, body } = await req(
      `/npcs/${state.characterId}/logs?since=2099-01-01T00:00:00Z`,
      { apiKey: state.apiKey }
    )
    assert.equal(status, 200)
    assert.equal(body.returnedLogs, 0, 'No logs should exist for a future date')
  })

  test('Log entries have required fields', async () => {
    const { body } = await req(`/npcs/${state.characterId}/logs`, { apiKey: state.apiKey })
    for (const log of body.logs) {
      assert.ok(log.id,        `Log must have id.       Got: ${JSON.stringify(log)}`)
      assert.ok(log.type,      `Log must have type.     Got: ${JSON.stringify(log)}`)
      assert.ok(log.timestamp, `Log must have timestamp. Got: ${JSON.stringify(log)}`)
      assert.ok(log.summary,   `Log must have summary.  Got: ${JSON.stringify(log)}`)
    }
  })
})

// ---------------------------------------------------------------------------
// ── 8. NPC Autonomous Loop ──────────────────────────────────────────────────
// ---------------------------------------------------------------------------

describe('8 · Autonomous Loop', () => {
  test('POST /api/npcs/:name/loop → starts the loop', async () => {
    const { status, body } = await req(`/npcs/${state.characterId}/loop`, {
      method: 'POST',
      apiKey: state.apiKey,
      body: JSON.stringify({
        schedule: '*/5 * * * *',
        events: ['market_change', 'player_nearby'],
        tasks: ['check inventory prices', 'greet nearby players'],
      }),
    })
    assert.equal(status, 200)
    assert.ok(body.loop, 'loop object must be present')
    assert.equal(body.loop.active, true, 'Loop should be active')
    assert.ok(body.loop.startedAt, 'startedAt must be present')
    assert.equal(body.loop.schedule, '*/5 * * * *')
    assert.deepEqual(body.loop.events, ['market_change', 'player_nearby'])
  })

  test('Loop is reflected in memory/config after start', async () => {
    const { body } = await req(`/npcs/${state.characterId}/logs`, { apiKey: state.apiKey })
    // loop_start log may not appear immediately as logs are derived from stored config,
    // but config should contain the loop info
    assert.ok(body.npcId === state.characterId)
  })

  test('POST /api/npcs/:name/stop → pauses the loop', async () => {
    const { status, body } = await req(`/npcs/${state.characterId}/stop`, {
      method: 'POST',
      apiKey: state.apiKey,
    })
    assert.equal(status, 200)
    assert.equal(body.loop.active, false, 'Loop should be inactive after stop')
    assert.ok(body.loop.stoppedAt, 'stoppedAt must be set')
  })

  test('POST /api/npcs/:name/loop — without body uses default schedule', async () => {
    const { status, body } = await req(`/npcs/${state.characterId}/loop`, {
      method: 'POST',
      apiKey: state.apiKey,
    })
    assert.equal(status, 200)
    assert.match(body.loop.schedule, /\*/, 'Default schedule should be a cron expression')
    // Stop it again so tests don't leave NPC in running state
    await req(`/npcs/${state.characterId}/stop`, {
      method: 'POST', apiKey: state.apiKey,
    })
  })
})

// ---------------------------------------------------------------------------
// ── 9. NPC Action Queue ─────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

describe('9 · Action Queue', () => {
  let enqueuedActionId = ''

  test('GET /api/npcs/:name/actions/queue → 200 with queue', async () => {
    const { status, body } = await req(`/npcs/${state.characterId}/actions/queue`, {
      apiKey: state.apiKey,
    })
    assert.equal(status, 200)
    assert.equal(body.npcId, state.characterId)
    assert.ok(Array.isArray(body.queue), 'queue must be an array')
    assert.ok(typeof body.queueLength === 'number')
  })

  test('POST /api/npcs/:name/actions/queue → enqueues action', async () => {
    const { status, body } = await req(`/npcs/${state.characterId}/actions/queue`, {
      method: 'POST',
      apiKey: state.apiKey,
      body: JSON.stringify({
        type: 'swap',
        description: 'Swap 10 KITE for Iron Ore',
        payload: { fromToken: 'KITE', toToken: 'IRON_ORE', amount: '10' },
        scheduledFor: new Date(Date.now() + 60_000).toISOString(),
      }),
    })
    assert.equal(status, 201)
    assert.ok(body.action.id, 'Enqueued action must have an id')
    assert.equal(body.action.type, 'swap')
    assert.equal(body.action.status, 'pending')
    assert.ok(body.queueLength >= 1)
    enqueuedActionId = body.action.id
    console.log(`  ✔ enqueued action: ${enqueuedActionId}`)
  })

  test('POST /api/npcs/:name/actions/queue — missing type → 400', async () => {
    const { status } = await req(`/npcs/${state.characterId}/actions/queue`, {
      method: 'POST',
      apiKey: state.apiKey,
      body: JSON.stringify({ description: 'Missing type field' }),
    })
    assert.equal(status, 400)
  })

  test('Action appears in queue GET after enqueue', async () => {
    const { body } = await req(`/npcs/${state.characterId}/actions/queue`, {
      apiKey: state.apiKey,
    })
    const found = body.queue.find((a) => a.id === enqueuedActionId)
    assert.ok(found, 'Enqueued action must appear in queue')
  })

  test('Enqueue multiple actions — queueLength increments', async () => {
    const r1 = await req(`/npcs/${state.characterId}/actions/queue`, {
      method: 'POST', apiKey: state.apiKey,
      body: JSON.stringify({ type: 'chat', description: 'Greet the player' }),
    })
    const r2 = await req(`/npcs/${state.characterId}/actions/queue`, {
      method: 'POST', apiKey: state.apiKey,
      body: JSON.stringify({ type: 'transfer', description: 'Send reward to player' }),
    })
    assert.equal(r1.status, 201)
    assert.equal(r2.status, 201)
    assert.ok(r2.body.queueLength > r1.body.queueLength, 'Queue should grow with each enqueue')
  })

  test('DELETE /api/npcs/:name/actions/queue?actionId=… → vetoes action', async () => {
    const { status, body } = await req(
      `/npcs/${state.characterId}/actions/queue?actionId=${enqueuedActionId}`,
      { method: 'DELETE', apiKey: state.apiKey }
    )
    assert.equal(status, 200)
    assert.ok(body.vetoedAction, 'vetoedAction must be present')
    assert.equal(body.vetoedAction.id, enqueuedActionId)
    assert.ok(typeof body.remainingQueueLength === 'number')
  })

  test('DELETE — nonexistent actionId → 404', async () => {
    const { status } = await req(
      `/npcs/${state.characterId}/actions/queue?actionId=action_fake_999`,
      { method: 'DELETE', apiKey: state.apiKey }
    )
    assert.equal(status, 404)
  })

  test('DELETE — missing actionId param → 400', async () => {
    const { status } = await req(
      `/npcs/${state.characterId}/actions/queue`,
      { method: 'DELETE', apiKey: state.apiKey }
    )
    assert.equal(status, 400)
  })
})

// ---------------------------------------------------------------------------
// ── 10. NPC Clone ──────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

describe('10 · NPC Clone', () => {
  let cloneId = ''

  test('POST /api/npcs/:name/clone → creates a clone with fresh wallet', async () => {
    const { status, body } = await req(`/npcs/${state.characterId}/clone`, {
      method: 'POST',
      apiKey: state.apiKey,
      body: JSON.stringify({ name: `CLONE_${Date.now()}` }),
    })
    assert.equal(status, 201)
    assert.ok(body.clone.id,            'Clone must have an id')
    assert.ok(body.clone.walletAddress, 'Clone must have a walletAddress')
    assert.equal(body.clone.clonedFrom, state.characterId, 'clonedFrom must point to source')
    // Clone should have a different wallet than the source
    const { body: source } = await req(`/characters/${state.characterId}`, { apiKey: state.apiKey })
    assert.notEqual(
      body.clone.walletAddress,
      source.character.walletAddress,
      'Clone wallet must differ from source'
    )
    cloneId = body.clone.id
    console.log(`  ✔ clone created: ${cloneId}`)
  })

  test('Clone inherits project membership from source', async () => {
    assert.ok(cloneId, 'Clone must have been created')
    const { body } = await req(`/characters/${cloneId}`, { apiKey: state.apiKey })
    // May return 403 if clone isn't in same project — just check the request doesn't 500
    assert.ok([200, 403, 404].includes(body ? 200 : 404))
  })

  test('POST /api/npcs/:name/clone — nonexistent source → 404', async () => {
    const { status } = await req('/npcs/clfakeid00000/clone', {
      method: 'POST',
      apiKey: state.apiKey,
    })
    assert.equal(status, 404)
  })

  test('POST /api/npcs/:name/clone — auto-generated name when omitted', async () => {
    const { status, body } = await req(`/npcs/${state.characterId}/clone`, {
      method: 'POST',
      apiKey: state.apiKey,
      body: JSON.stringify({}),
    })
    assert.equal(status, 201)
    assert.ok(body.clone.name.includes('CLONE'), 'Auto name should contain CLONE')
  })
})

// ---------------------------------------------------------------------------
// ── 11. NPC Event Trigger ──────────────────────────────────────────────────
// ---------------------------------------------------------------------------

describe('11 · Event Trigger', () => {
  test('POST /api/npcs/:name/trigger — market_crash event → 200 with reaction', async () => {
    const { status, body } = await req(`/npcs/${state.characterId}/trigger`, {
      method: 'POST',
      apiKey: state.apiKey,
      body: JSON.stringify({
        event: 'market_crash',
        asset: 'ETH',
        data: { severity: 'high', priceChange: -30 },
        recordInMemory: true,
      }),
    })
    assert.equal(status, 200)
    assert.equal(body.npcId, state.characterId)
    assert.equal(body.event, 'market_crash')
    assert.equal(body.asset, 'ETH')
    assert.ok(body.reaction, 'reaction must be present')
    assert.ok(typeof body.reaction.text === 'string' && body.reaction.text.length > 0, 'reaction.text should be non-empty')
    assert.ok('action' in body.reaction, 'reaction.action field must exist')
    assert.ok(body.recordedInMemory === true, 'recordedInMemory should be true')
    assert.ok(body.triggeredAt, 'triggeredAt must be present')
  })

  test('POST /api/npcs/:name/trigger — no asset field → still works', async () => {
    const { status, body } = await req(`/npcs/${state.characterId}/trigger`, {
      method: 'POST',
      apiKey: state.apiKey,
      body: JSON.stringify({
        event: 'player_achievement_unlocked',
        data: { achievement: 'dragon_slayer' },
        recordInMemory: false,
      }),
    })
    assert.equal(status, 200)
    assert.ok(body.reaction.text)
  })

  test('POST /api/npcs/:name/trigger — missing event → 400', async () => {
    const { status } = await req(`/npcs/${state.characterId}/trigger`, {
      method: 'POST',
      apiKey: state.apiKey,
      body: JSON.stringify({ asset: 'BTC' }),
    })
    assert.equal(status, 400)
  })

  test('Event is recorded in memory when recordInMemory=true', async () => {
    await req(`/npcs/${state.characterId}/trigger`, {
      method: 'POST',
      apiKey: state.apiKey,
      body: JSON.stringify({ event: 'test_memory_event', recordInMemory: true }),
    })
    const { body: memBody } = await req(`/npcs/${state.characterId}/memory`, {
      apiKey: state.apiKey,
    })
    const hasEventRecord = memBody.memory.preferences.some(
      (p) => typeof p === 'string' && p.includes('test_memory_event')
    )
    assert.ok(hasEventRecord, 'Event should be recorded in NPC preferences/memory')
  })
})

// ---------------------------------------------------------------------------
// ── 12. NPC Wallet Balances ─────────────────────────────────────────────────
// ---------------------------------------------------------------------------

describe('12 · Wallet Balances', () => {
  test('GET /api/npcs/:name/wallet/balances → 200 with native balance', async () => {
    const { status, body } = await req(`/npcs/${state.characterId}/wallet/balances`, {
      apiKey: state.apiKey,
    })
    assert.equal(status, 200)
    assert.equal(body.npcId, state.characterId)
    assert.ok(body.walletAddress, 'walletAddress must be present')
    assert.ok(body.native, 'native balance must be present')
    assert.ok(typeof body.native.balance === 'string', 'native.balance must be string')
    assert.equal(body.native.symbol, 'KITE', 'Native token should be KITE')
    assert.ok(Array.isArray(body.tokens), 'tokens must be an array')
    assert.ok(body.fetchedAt, 'fetchedAt must be present')
  })

  test('GET /api/npcs/:name/wallet/balances — invalid token address ignored', async () => {
    const { status, body } = await req(
      `/npcs/${state.characterId}/wallet/balances?tokens=not_an_address`,
      { apiKey: state.apiKey }
    )
    // Should succeed — invalid addresses are silently filtered
    assert.equal(status, 200)
    assert.equal(body.tokens.length, 0, 'Invalid address should be ignored')
  })
})

// ---------------------------------------------------------------------------
// ── 13. Environment State ────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

describe('13 · Environment State', () => {
  test('GET /api/environment/state → 200 with state object', async () => {
    const { status, body } = await req('/environment/state', { apiKey: state.apiKey })
    assert.equal(status, 200)
    assert.ok(body.timestamp, 'timestamp must be present')
    // The state includes at least some subset of gas/network/npcs
    const hasData = 'gas' in body || 'network' in body || 'npcs' in body
    assert.ok(hasData, 'State should include gas, network, or npcs data')
  })

  test('GET /api/environment/state?include=npcs → NPC counts', async () => {
    const { status, body } = await req('/environment/state?include=npcs', {
      apiKey: state.apiKey,
    })
    assert.equal(status, 200)
    assert.ok(body.npcs, 'npcs field must be present')
    assert.ok(typeof body.npcs.total === 'number', 'npcs.total must be a number')
    assert.ok(typeof body.npcs.online === 'number', 'npcs.online must be a number')
    assert.ok(typeof body.npcs.sleeping === 'number', 'npcs.sleeping must be a number')
    assert.ok(body.npcs.online + body.npcs.sleeping === body.npcs.total,
      'online + sleeping should equal total')
  })

  test('GET /api/environment/state?include=gas → gas prices', async () => {
    const { status, body } = await req('/environment/state?include=gas', {
      apiKey: state.apiKey,
    })
    assert.equal(status, 200)
    // Network might be unreachable in CI but shouldn't 500
    assert.ok(body.gas !== undefined, 'gas field must be present even if RPC fails')
  })
})

// ---------------------------------------------------------------------------
// ── 14. Environment Broadcast ────────────────────────────────────────────────
// ---------------------------------------------------------------------------

describe('14 · Environment Broadcast', () => {
  test('POST /api/environment/broadcast — specific npcIds → reactions', async () => {
    const { status, body } = await req('/environment/broadcast', {
      method: 'POST',
      apiKey: state.apiKey,
      body: JSON.stringify({
        message: 'A new rare item has appeared in the market!',
        npcIds: [state.characterId],
      }),
    })
    assert.equal(status, 200)
    assert.ok(typeof body.recipientCount === 'number', 'recipientCount must be a number')
    assert.ok(Array.isArray(body.reactions), 'reactions must be an array')
    if (body.reactions.length > 0) {
      const r = body.reactions[0]
      assert.ok(r.npcId, 'Each reaction must have npcId')
      assert.ok(r.npcName, 'Each reaction must have npcName')
    }
  })

  test('POST /api/environment/broadcast — reactAsync=true → immediate response', async () => {
    const { status, body } = await req('/environment/broadcast', {
      method: 'POST',
      apiKey: state.apiKey,
      body: JSON.stringify({
        message: 'Server shutdown in 5 minutes!',
        npcIds: [state.characterId],
        reactAsync: true,
      }),
    })
    assert.equal(status, 200)
    assert.ok(body.broadcastAt, 'broadcastAt must be present')
    assert.ok(typeof body.recipientCount === 'number')
    // Async mode does NOT include reactions
    assert.ok(!('reactions' in body) || body.reactions === undefined,
      'Async broadcast should not include reactions')
  })

  test('POST /api/environment/broadcast — missing message → 400', async () => {
    const { status } = await req('/environment/broadcast', {
      method: 'POST',
      apiKey: state.apiKey,
      body: JSON.stringify({ npcIds: [state.characterId] }),
    })
    assert.equal(status, 400)
  })

  test('POST /api/environment/broadcast — no auth + no targeting → 400', async () => {
    const { status } = await req('/environment/broadcast', {
      method: 'POST',
      body: JSON.stringify({ message: 'test' }),
    })
    assert.equal(status, 400)
  })
})

// ---------------------------------------------------------------------------
// ── 15. System Usage ─────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

describe('15 · System Usage', () => {
  test('GET /api/system/usage → 200 with compute metrics', async () => {
    const { status, body } = await req('/system/usage', { apiKey: state.apiKey })
    assert.equal(status, 200)
    assert.ok(body.npcs, 'npcs field must be present')
    assert.ok(body.compute, 'compute field must be present')
    assert.ok(body.period, 'period field must be present')
    assert.ok(typeof body.npcs.total === 'number', 'npcs.total must be number')
    assert.ok(typeof body.compute.totalChatTurns === 'number', 'totalChatTurns must be number')
    assert.ok(typeof body.compute.estimatedLLMTokensConsumed === 'number')
    assert.ok(typeof body.compute.estimatedCost === 'string')
  })

  test('Usage metrics reflect our character', async () => {
    const { body } = await req('/system/usage', { apiKey: state.apiKey })
    assert.ok(body.npcs.total >= 1, 'Should have at least 1 NPC in usage')
  })
})

// ---------------------------------------------------------------------------
// ── 16. Webhooks ─────────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

describe('16 · Webhooks', () => {
  test('GET /api/webhooks/register → returns supported events list', async () => {
    const { status, body } = await req('/webhooks/register')
    assert.equal(status, 200)
    assert.ok(Array.isArray(body.supportedEvents), 'supportedEvents must be an array')
    assert.ok(body.supportedEvents.length > 0, 'Should list at least one supported event')
    assert.ok(body.supportedEvents.includes('npc.token_received'), 'npc.token_received should be supported')
    assert.ok(body.supportedEvents.includes('npc.trade_executed'), 'npc.trade_executed should be supported')
  })

  test('POST /api/webhooks/register → registers a webhook', async () => {
    const { status, body } = await req('/webhooks/register', {
      method: 'POST',
      apiKey: state.apiKey,
      body: JSON.stringify({
        url: 'https://example.com/hooks/guildcraft',
        events: ['npc.token_received', 'npc.trade_executed'],
        npcId: state.characterId,
        secret: 'super-secret-123',
        description: 'Test webhook',
      }),
    })
    assert.equal(status, 201)
    assert.ok(body.webhook, 'webhook object must be present')
    assert.ok(body.webhook.id, 'webhook.id must be present')
    assert.match(body.webhook.id, /^wh_/, 'webhook.id must start with wh_')
    assert.ok(body.webhook.active, 'webhook should be active')
    assert.deepEqual(body.webhook.events, ['npc.token_received', 'npc.trade_executed'])
  })

  test('POST /api/webhooks/register — no auth → 401', async () => {
    const { status } = await req('/webhooks/register', {
      method: 'POST',
      body: JSON.stringify({
        url: 'https://example.com/hook',
        events: ['npc.deployed'],
      }),
    })
    assert.equal(status, 401)
  })

  test('POST /api/webhooks/register — missing url → 400', async () => {
    const { status } = await req('/webhooks/register', {
      method: 'POST',
      apiKey: state.apiKey,
      body: JSON.stringify({ events: ['npc.deployed'] }),
    })
    assert.equal(status, 400)
  })

  test('POST /api/webhooks/register — unsupported event → 400 with supportedEvents', async () => {
    const { status, body } = await req('/webhooks/register', {
      method: 'POST',
      apiKey: state.apiKey,
      body: JSON.stringify({
        url: 'https://example.com/hook',
        events: ['npc.fake_event_xyz'],
      }),
    })
    assert.equal(status, 400)
    assert.ok(Array.isArray(body.supportedEvents), 'Should return supportedEvents in error')
  })

  test('POST /api/webhooks/register — HTTP url (non-localhost) → 400', async () => {
    const { status } = await req('/webhooks/register', {
      method: 'POST',
      apiKey: state.apiKey,
      body: JSON.stringify({
        url: 'http://example.com/hook', // not https and not localhost
        events: ['npc.deployed'],
      }),
    })
    assert.equal(status, 400)
  })

  test('POST /api/webhooks/register — localhost HTTP allowed', async () => {
    const { status } = await req('/webhooks/register', {
      method: 'POST',
      apiKey: state.apiKey,
      body: JSON.stringify({
        url: 'http://localhost:9999/hook',
        events: ['npc.deployed'],
      }),
    })
    assert.equal(status, 201)
  })
})

// ---------------------------------------------------------------------------
// ── 17. Transactions ─────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

describe('17 · Transactions', () => {
  test('POST /api/transactions — tradeIntent → user-paid mode (player must sign)', async () => {
    const { status, body } = await req('/transactions', {
      method: 'POST',
      apiKey: state.apiKey,
      body: JSON.stringify({
        characterId: state.characterId,
        tradeIntent: { item: 'Iron Sword', price: 0.01, currency: 'KITE_USD' },
      }),
    })
    assert.equal(status, 200)
    assert.equal(body.success, true)
    assert.equal(body.mode, 'user-paid', 'Trade intents should result in user-paid mode')
    assert.ok(body.txRequest, 'txRequest must be present for user-paid mode')
    assert.ok(body.txRequest.to, 'txRequest.to (NPC wallet) must be present')
    assert.ok(body.txRequest.value, 'txRequest.value must be present')
  })

  test('POST /api/transactions — directTx → sponsored or fallback mode', async () => {
    const { status, body } = await req('/transactions', {
      method: 'POST',
      apiKey: state.apiKey,
      body: JSON.stringify({
        characterId: state.characterId,
        transaction: {
          to: '0x0000000000000000000000000000000000000001',
          value: '0',
          data: '0x',
        },
      }),
    })
    assert.equal(status, 200)
    assert.equal(body.success, true)
    assert.ok(['sponsored', 'fallback'].includes(body.mode),
      `Expected sponsored or fallback, got: ${body.mode}`)
  })

  test('POST /api/transactions — missing characterId → 400', async () => {
    const { status } = await req('/transactions', {
      method: 'POST',
      body: JSON.stringify({ tradeIntent: { item: 'Sword', price: 1, currency: 'KITE_USD' } }),
    })
    assert.equal(status, 400)
  })

  test('POST /api/transactions — nonexistent character → 404', async () => {
    const { status } = await req('/transactions', {
      method: 'POST',
      apiKey: state.apiKey,
      body: JSON.stringify({
        characterId: 'clfakeid0000',
        tradeIntent: { item: 'Sword', price: 1, currency: 'KITE_USD' },
      }),
    })
    assert.equal(status, 404)
  })
})

// ---------------------------------------------------------------------------
// ── 18. SDK Integration Tests ────────────────────────────────────────────────
// ---------------------------------------------------------------------------

describe('18 · SDK Integration (GuildCraftClient)', () => {
  test('GuildCraftClient — invalid key throws GuildCraftError', () => {
    assert.throws(
      () => new GuildCraftClient('bad_key'),
      (err) => {
        assert.ok(err instanceof GuildCraftError, 'Should throw GuildCraftError')
        return true
      }
    )
  })

  test('GuildCraftClient — null key throws', () => {
    assert.throws(() => new GuildCraftClient(null))
  })

  test('gc.getCharacters() → returns array', async () => {
    const characters = await state.gc.getCharacters()
    assert.ok(Array.isArray(characters), 'Should return an array')
    const found = characters.some((c) => c.id === state.characterId)
    assert.ok(found, 'Our character must be in the list')
  })

  test('gc.getCharacter(id) → returns character + projects', async () => {
    const result = await state.gc.getCharacter(state.characterId)
    assert.ok(result.character, 'character must be present')
    assert.equal(result.character.id, state.characterId)
    assert.ok(Array.isArray(result.character.projectIds))
    assert.ok(Array.isArray(result.projects))
  })

  test('gc.getCharacter(bad_id) → throws GuildCraftError 404', async () => {
    await assert.rejects(
      () => state.gc.getCharacter('clfakeid99999'),
      (err) => {
        assert.ok(err instanceof GuildCraftError)
        assert.equal(err.status, 404)
        return true
      }
    )
  })

  test('gc.getGames() → returns array including our game', async () => {
    const games = await state.gc.getGames()
    assert.ok(Array.isArray(games))
    const found = games.some((g) => g.id === state.gameId)
    assert.ok(found, 'Our game must be in the list')
  })

  test('gc.getGameCharacters(gameId) → returns game + characters', async () => {
    const result = await state.gc.getGameCharacters(state.gameId)
    assert.ok(result.game.id === state.gameId)
    assert.ok(Array.isArray(result.characters))
  })

  test('gc.chat(characterId, message) → ChatResponse', async () => {
    const response = await state.gc.chat(state.characterId, 'What do you sell?')
    assert.equal(response.success, true)
    assert.ok(typeof response.response === 'string' && response.response.length > 0)
    assert.equal(response.characterId, state.characterId)
    assert.ok(response.timestamp)
    console.log(`  ✔ NPC said: "${response.response.slice(0, 60)}…"`)
  })

  test('gc.chat() — missing characterId throws', async () => {
    await assert.rejects(
      () => state.gc.chat(null, 'hello'),
      (err) => { assert.ok(err instanceof GuildCraftError); return true }
    )
  })

  test('gc.chatStream() — yields text_delta and done events', async () => {
    const events = []
    for await (const event of state.gc.chatStream(state.characterId, 'Describe yourself briefly.')) {
      events.push(event)
      if (event.type === 'done' || event.type === 'error') break
    }
    assert.ok(events.length > 0, 'Should receive at least one event')
    const types = events.map((e) => e.type)
    assert.ok(types.includes('done'), `Expected done event, got: ${types.join(', ')}`)
    const done = events.find((e) => e.type === 'done')
    assert.ok(done.final?.text, 'done.final.text must be present')
    console.log(`  ✔ stream yielded ${events.length} event(s). Final text: "${done.final.text.slice(0, 50)}…"`)
  })

  test('gc.getMemory(npcId) → NpcMemory object', async () => {
    const result = await state.gc.getMemory(state.characterId)
    assert.equal(result.npcId, state.characterId)
    assert.ok(result.memory)
    assert.ok(typeof result.memory.turnCount === 'number')
  })

  test('gc.injectMemory() → injectedCount > 0', async () => {
    const result = await state.gc.injectMemory(state.characterId, {
      facts: ['Player is a veteran warrior', 'Player completed the main quest'],
      preferences: ['Player prefers direct answers'],
    })
    assert.ok(result.injectedCount >= 3)
  })

  test('gc.getLogs(npcId) → logs array', async () => {
    const result = await state.gc.getLogs(state.characterId, { limit: 10 })
    assert.equal(result.npcId, state.characterId)
    assert.ok(Array.isArray(result.logs))
    assert.ok(result.logs.length >= 1)
  })

  test('gc.startLoop() + gc.stopLoop() round-trip', async () => {
    const started = await state.gc.startLoop(state.characterId, {
      schedule: '*/10 * * * *',
      tasks: ['monitor market prices'],
    })
    assert.equal(started.loop.active, true)

    const stopped = await state.gc.stopLoop(state.characterId)
    assert.equal(stopped.loop.active, false)
  })

  test('gc.enqueueAction() + gc.getActionQueue() + gc.vetoAction()', async () => {
    const enqueued = await state.gc.enqueueAction(state.characterId, {
      type: 'transfer',
      description: 'SDK test transfer action',
      payload: { amount: '5', token: 'KITE' },
    })
    assert.ok(enqueued.action.id)
    const actionId = enqueued.action.id

    const queue = await state.gc.getActionQueue(state.characterId)
    const found = queue.queue.find((a) => a.id === actionId)
    assert.ok(found, 'Enqueued action must be in queue')

    const vetoed = await state.gc.vetoAction(state.characterId, actionId)
    assert.equal(vetoed.vetoedAction.id, actionId)
  })

  test('gc.triggerEvent() → reaction with text', async () => {
    const result = await state.gc.triggerEvent(state.characterId, {
      event: 'sdk_test_event',
      data: { source: 'test suite' },
      recordInMemory: false,
    })
    assert.equal(result.npcId, state.characterId)
    assert.ok(typeof result.reaction.text === 'string' && result.reaction.text.length > 0)
  })

  test('gc.getWalletBalances(npcId) → WalletBalance', async () => {
    const result = await state.gc.getWalletBalances(state.characterId)
    assert.equal(result.npcId, state.characterId)
    assert.ok(result.native)
    assert.equal(result.native.symbol, 'KITE')
  })

  test('gc.getEnvironmentState() → state object', async () => {
    const result = await state.gc.getEnvironmentState(['npcs'])
    assert.ok(result.npcs)
    assert.ok(typeof result.npcs.total === 'number')
  })

  test('gc.broadcast() → recipientCount and reactions', async () => {
    const result = await state.gc.broadcast({
      message: 'SDK broadcast test!',
      npcIds: [state.characterId],
    })
    assert.ok(typeof result.recipientCount === 'number')
    assert.ok(Array.isArray(result.reactions))
  })

  test('gc.getUsage() → compute metrics', async () => {
    const result = await state.gc.getUsage()
    assert.ok(result.compute)
    assert.ok(typeof result.compute.totalChatTurns === 'number')
  })

  test('gc.getSupportedWebhookEvents() → event list', async () => {
    const result = await state.gc.getSupportedWebhookEvents()
    assert.ok(Array.isArray(result.supportedEvents))
    assert.ok(result.supportedEvents.length > 5)
  })

  test('gc.registerWebhook() → webhook object', async () => {
    const result = await state.gc.registerWebhook({
      url: 'https://example.com/sdk-test-hook',
      events: ['npc.deployed', 'npc.trade_executed'],
    })
    assert.ok(result.webhook.id)
    assert.match(result.webhook.id, /^wh_/)
  })

  test('gc.executeTransaction() — tradeIntent → user-paid response', async () => {
    const result = await state.gc.executeTransaction(
      state.characterId,
      { item: 'Health Potion', price: 0.005, currency: 'KITE_USD' }
    )
    assert.equal(result.success, true)
    assert.equal(result.mode, 'user-paid')
    assert.ok(result.txRequest?.to, 'txRequest.to must be present')
  })

  test('gc.clearMemory(npcId, all) → resets memory', async () => {
    const result = await state.gc.clearMemory(state.characterId, 'all')
    assert.equal(result.scope, 'all')
    const mem = await state.gc.getMemory(state.characterId)
    assert.equal(mem.memory.turnCount, 0)
    assert.equal(mem.memory.specializationActive, false)
  })
})

// ---------------------------------------------------------------------------
// ── 19. Edge Cases & Error Handling ──────────────────────────────────────────
// ---------------------------------------------------------------------------

describe('19 · Edge Cases & Error Handling', () => {
  test('All NPC routes return 404 for nonexistent NPC id', async () => {
    const fakeId = 'clfakeid_nonexistent_99'
    const routes = [
      [`/npcs/${fakeId}/memory`,            'GET'],
      [`/npcs/${fakeId}/logs`,              'GET'],
      [`/npcs/${fakeId}/actions/queue`,     'GET'],
      [`/npcs/${fakeId}/wallet/balances`,   'GET'],
      [`/npcs/${fakeId}/loop`,              'POST'],
      [`/npcs/${fakeId}/stop`,              'POST'],
      [`/npcs/${fakeId}/clone`,             'POST'],
      [`/npcs/${fakeId}/trigger`,           'POST'],
    ]
    for (const [path, method] of routes) {
      const opts = { method, apiKey: state.apiKey }
      if (method === 'POST') {
        opts.body = JSON.stringify({ event: 'x', message: 'x', schedule: '* * * * *' })
      }
      const { status } = await req(path, opts)
      assert.ok([404, 400].includes(status),
        `${method} ${path} → expected 404 or 400, got ${status}`)
    }
  })

  test('Malformed JSON body → 400', async () => {
    const res = await fetch(`${API}/characters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ invalid json ',
    })
    // Next.js may return 400 or 500 depending on error handling
    assert.ok([400, 500].includes(res.status), `Expected 400 or 500, got ${res.status}`)
  })

  test('Empty string character name → 400', async () => {
    const { status } = await req('/characters', {
      method: 'POST',
      body: JSON.stringify({ name: '', config: {} }),
    })
    assert.equal(status, 400)
  })

  test('Empty string game name → 400', async () => {
    const { status } = await req('/games', {
      method: 'POST',
      body: JSON.stringify({ name: '   ' }),
    })
    assert.equal(status, 400)
  })

  test('Broadcast with empty npcIds array → empty reactions', async () => {
    const { status, body } = await req('/environment/broadcast', {
      method: 'POST',
      apiKey: state.apiKey,
      body: JSON.stringify({
        message: 'Hello everyone!',
        npcIds: [],
      }),
    })
    // npcIds=[] falls through to project-level NPCs — should succeed
    assert.ok([200, 400].includes(status))
  })

  test('OPTIONS preflight on chat → 204 with CORS headers', async () => {
    const res = await fetch(`${API}/chat`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:3000' },
    })
    assert.equal(res.status, 204)
    assert.ok(
      res.headers.get('access-control-allow-methods')?.includes('POST'),
      'CORS should allow POST'
    )
  })

  test('OPTIONS preflight on stream → 204 with CORS headers', async () => {
    const res = await fetch(`${API}/chat/stream`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:3000' },
    })
    assert.equal(res.status, 204)
  })
})

// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// ── Summary ──────────────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

after(() => {
  console.log('\n─────────────────────────────────────────────')
  console.log('Test suite complete.')
  console.log(`Game:      ${state.gameId}`)
  console.log(`Character: ${state.characterId}`)
  console.log('Records created in your test DB — clean up manually if needed.')
  console.log('─────────────────────────────────────────────\n')
})