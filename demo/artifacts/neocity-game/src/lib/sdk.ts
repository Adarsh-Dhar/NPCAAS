// src/lib/sdk.ts
// Singleton GuildCraft SDK client.
// Characters are resolved by NAME (case-insensitive), not by hardcoded UUID.
// On first use the client calls getCharacters() and builds a name→character
// cache. All callers use getCharacterByName(npcName) to resolve.

import type { Character } from "../../../../../frontend/sdk";

// ---------------------------------------------------------------------------
// CJS interop — use ESM `import` and normalise CommonJS default exports
// Vite will pre-bundle the CJS package via `optimizeDeps.include` when needed.
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import * as _sdkModule from "../../../../../frontend/sdk/index.js";

// Normalize CommonJS / ESM shapes from the SDK entrypoint. Vite may return
// a namespace with a `.default` property for CJS modules — handle both.
const _rawSdk: any = _sdkModule as any;
const _normalizedSdk: any =
  _rawSdk && (_rawSdk.GuildCraftClient || _rawSdk.GuildCraftError)
    ? _rawSdk
    : (_rawSdk && _rawSdk.default) ? _rawSdk.default : _rawSdk;

// Export GuildCraftError if present; otherwise provide a lightweight fallback
// class so downstream code can `instanceof` it and consume `status`/`body`.
export const GuildCraftError =
  _normalizedSdk?.GuildCraftError ??
  class GuildCraftError extends Error {
    status: number | null
    body: any
    constructor(message: string, status?: number | null, body?: any) {
      super(message)
      this.name = 'GuildCraftError'
      this.status = status ?? null
      this.body = body ?? null
    }
  }

// ---------------------------------------------------------------------------
// Runtime config helpers (read at call-time so localStorage/window changes
// are picked up without a full page reload).
// ---------------------------------------------------------------------------
function getRuntimeApiKey(): string | undefined {
  const viteKey = (import.meta.env?.VITE_GC_API_KEY as string | undefined) ?? undefined;
  if (viteKey) return viteKey;
  if (typeof window !== "undefined") {
    const windowKey = (window as any).__VITE_GC_API_KEY as string | null;
    const localKey = localStorage.getItem("VITE_GC_API_KEY") as string | null;
    return windowKey ?? localKey ?? undefined;
  }
  return undefined;
}

function getRuntimeBaseUrl(): string {
  const viteBase = (import.meta.env?.VITE_GC_BASE_URL as string | undefined) ?? undefined;
  if (viteBase) return viteBase;
  if (typeof window !== "undefined") {
    return (
      (window as any).__VITE_GC_BASE_URL as string | null ??
      (localStorage.getItem("VITE_GC_BASE_URL") as string | null) ??
      "/api"
    );
  }
  return "/api";
}

// ---------------------------------------------------------------------------
// Client singleton
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: any | null = null;
let _clientKey: string | null = null;

// Lightweight HTTP fallback client used when the packaged SDK ctor
// isn't available at runtime (e.g., bundling shape mismatches).
class HttpGuildCraftClient {
  apiKey: string
  baseUrl: string
  private _didFallbackToProxy = false
  private static readonly CHAT_STREAM_TIMEOUT_MS = 30_000
  constructor(apiKey: string, baseUrl = '/api') {
    this.apiKey = apiKey
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  _authHeaders() {
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` }
  }

  async _request(path: string, options: any = {}) {
    const headers = { ...this._authHeaders(), ...(options.headers ?? {}) }
    const method = options.method || 'GET'
    const fetchOnce = async (baseUrl: string) => {
      const url = `${baseUrl}${path}`
      console.log(`[GuildCraft] 🔗 ${method} ${url}`)
      console.log(`[GuildCraft] Headers:`, headers)
      return fetch(url, { ...options, headers })
    }

    let res: Response
    try {
      res = await fetchOnce(this.baseUrl)
    } catch (err) {
      const canFallbackToProxy =
        typeof window !== 'undefined' &&
        this.baseUrl !== '/api' &&
        !this._didFallbackToProxy

      if (canFallbackToProxy) {
        this._didFallbackToProxy = true
        this.baseUrl = '/api'
        console.warn(
          `[GuildCraft] Network error against configured base URL. Falling back to ${this.baseUrl}.`,
          err
        )
        res = await fetchOnce(this.baseUrl)
      } else {
        throw err
      }
    }

    console.log(`[GuildCraft] Response status:`, res.status)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error(`[GuildCraft] ❌ API Error:`, body)
      throw new GuildCraftError(body?.error ?? `HTTP ${res.status}`, res.status, body)
    }
    return body
  }

  async getCharacters() {
    return this._request('/characters')
  }

  async getCharacter(characterId: string) {
    if (!characterId) throw new GuildCraftError('characterId is required', 400, null)
    return this._request(`/characters/${encodeURIComponent(characterId)}`)
  }

  async getWalletBalances(npcId: string, tokenAddresses: string[] = []) {
    if (!npcId) throw new GuildCraftError('npcId is required', 400, null)
    const qs = tokenAddresses.length ? `?tokens=${tokenAddresses.join(',')}` : ''
    return this._request(`/npcs/${encodeURIComponent(npcId)}/wallet/balances${qs}`)
  }

  async chat(characterId: string, message: string) {
    if (!characterId) throw new GuildCraftError('characterId is required', 400, null)
    if (!message) throw new GuildCraftError('message is required', 400, null)
    const opts = arguments[2] ?? {}
    const npcName = opts.npcName ?? characterId
    const charId = opts.characterId ?? characterId
    return this._request('/chat', {
      method: 'POST',
      body: JSON.stringify({ npcName, characterId: charId, message }),
    })
  }

  async *chatStream(characterId: string, message: string) {
    if (!characterId) throw new GuildCraftError('characterId is required', 400, null)
    if (!message) throw new GuildCraftError('message is required', 400, null)
    const opts = arguments[2] ?? {}
    const npcName = opts.npcName ?? characterId
    const charId = opts.characterId ?? characterId

    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      controller.abort()
    }, HttpGuildCraftClient.CHAT_STREAM_TIMEOUT_MS)

    let res: Response
    try {
      res = await fetch(`${this.baseUrl}/chat/stream`, {
        method: 'POST',
        headers: this._authHeaders(),
        body: JSON.stringify({ npcName, characterId: charId, message }),
        signal: controller.signal,
      })
    } catch (err) {
      clearTimeout(timeoutId)
      if (err instanceof Error && err.name === 'AbortError') {
        throw new GuildCraftError(
          `Chat stream timed out after ${HttpGuildCraftClient.CHAT_STREAM_TIMEOUT_MS / 1000}s`,
          504,
          null
        )
      }
      throw err
    }

    if (!res.ok) {
      clearTimeout(timeoutId)
      const body = await res.json().catch(() => ({}))
      throw new GuildCraftError(body?.error ?? `HTTP ${res.status}`, res.status, body)
    }

    if (!res.body) {
      clearTimeout(timeoutId)
      throw new GuildCraftError('No response body', res.status, null)
    }


    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const frames = buffer.split('\n\n')
        buffer = frames.pop() ?? ''
        for (const frame of frames) {
          const dataLine = frame.trim()
          if (!dataLine.startsWith('data:')) continue
          const json = dataLine.slice('data:'.length).trim()
          if (!json) continue
          try {
            yield JSON.parse(json)
          } catch {
            // ignore malformed frame
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new GuildCraftError(
          `Chat stream timed out after ${HttpGuildCraftClient.CHAT_STREAM_TIMEOUT_MS / 1000}s`,
          504,
          null
        )
      }
      throw err
    } finally {
      clearTimeout(timeoutId)
    }
  }

  async executeTransaction(characterId: string, tradeIntent: any) {
    if (!characterId) throw new GuildCraftError('characterId is required', 400, null)
    if (!tradeIntent) throw new GuildCraftError('tradeIntent is required', 400, null)
    return this._request('/transactions', {
      method: 'POST',
      body: JSON.stringify({ characterId, tradeIntent }),
    })
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getClient(): any | null {
  const key = getRuntimeApiKey();
  if (!key) {
    console.warn("[GuildCraft] No API key configured. Set VITE_GC_API_KEY in demo/.env or localStorage.");
    return null;
  }
  const base = getRuntimeBaseUrl();
  if (!_client || _clientKey !== key) {
    // The demo targets local Next.js API routes and relies on methods not
    // guaranteed across packaged SDK builds, so use the local HTTP client
    // consistently for deterministic behavior.
    _client = new HttpGuildCraftClient(key, base);
    _clientKey = key;
  }
  return _client;
}

export function isSdkReady(): boolean {
  return !!getRuntimeApiKey();
}

// ---------------------------------------------------------------------------
// Character cache  (lowercase name → Character)
// ---------------------------------------------------------------------------
let _characterCache: Map<string, Character> | null = null;
let _cachePromise: Promise<Map<string, Character>> | null = null;

/**
 * Fetches all characters once and caches them by lowercase name.
 * Subsequent calls return the same cached promise — no duplicate requests.
 */
export async function loadCharacters(): Promise<Map<string, Character>> {
  if (_characterCache) return _characterCache;
  if (_cachePromise) return _cachePromise;

  const client = getClient();
  if (!client) {
    _characterCache = new Map();
    return _characterCache;
  }

  _cachePromise = (client.getCharacters() as Promise<Character[]>)
    .then((chars) => {
      const map = new Map<string, Character>();
      console.log("[GuildCraft] Loaded characters:", chars);
      for (const char of chars) {
        map.set(char.name.toLowerCase(), char);
      }
      _characterCache = map;
      return map;
    })
    .catch((err: unknown) => {
      console.error("[GuildCraft] Failed to load characters:", err);
      _cachePromise = null; // allow retry on next call
      _characterCache = new Map();
      return _characterCache;
    });

  return _cachePromise;
}

/**
 * Async: returns the Character whose name matches (case-insensitive).
 * Loads the cache on first call. Returns null if no match.
 */
export async function getCharacterByName(
  name: string
): Promise<Character | null> {
  const map = await loadCharacters();
  return map.get(name.toLowerCase()) ?? null;
}

/**
 * Synchronous version — only works after loadCharacters() has resolved.
 * Returns null if cache is not yet populated or no match found.
 */
export function getCharacterByNameSync(name: string): Character | null {
  if (!_characterCache) return null;
  return _characterCache.get(name.toLowerCase()) ?? null;
}

/** Returns all cached characters as an array. */
export function getAllCharacters(): Character[] {
  if (!_characterCache) return [];
  return [..._characterCache.values()];
}

/** Force-clears the cache (useful after deploying new NPCs). */
export function clearCharacterCache(): void {
  _characterCache = null;
  _cachePromise = null;
}