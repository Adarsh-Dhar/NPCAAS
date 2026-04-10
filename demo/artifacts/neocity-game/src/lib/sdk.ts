// src/lib/sdk.ts
// Singleton GuildCraft SDK client — import this everywhere in the game.
// Never re-instantiate; Vite HMR keeps this module stable across reloads.

// The SDK is a plain CommonJS package published to npm.
// We import it via dynamic require so Vite doesn't tree-shake the CJS build.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { GuildCraftClient, GuildCraftError } = (globalThis as any).__GC_SDK__ ??
  (() => {
    try {
      // Works in Vite because we added "optimizeDeps" include below
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const m = require("../../../../../frontend/sdk");
      (globalThis as any).__GC_SDK__ = m;
      return m;
    } catch {
      return { GuildCraftClient: null, GuildCraftError: null };
    }
  })();

export { GuildCraftError };

// ---------------------------------------------------------------------------
// Runtime config
// ---------------------------------------------------------------------------
const apiKey = import.meta.env.VITE_GC_API_KEY as string | undefined;
const baseUrl = import.meta.env.VITE_GC_BASE_URL as string | undefined;

if (!apiKey) {
  console.warn(
    "[GuildCraft] VITE_GC_API_KEY is not set. " +
      "Chat will fall back to the local API server. " +
      "Add it to demo/artifacts/neocity-game/.env"
  );
}

// ---------------------------------------------------------------------------
// Client export
// ---------------------------------------------------------------------------
let _client: InstanceType<typeof GuildCraftClient> | null = null;

export function getClient(): InstanceType<typeof GuildCraftClient> | null {
  if (!apiKey || !GuildCraftClient) return null;
  if (!_client) {
    _client = new GuildCraftClient(
      apiKey,
      baseUrl ?? "http://localhost:3000/api"
    );
  }
  return _client;
}

/** True when the SDK is configured and available */
export function isSdkReady(): boolean {
  return !!apiKey && !!GuildCraftClient;
}

// ---------------------------------------------------------------------------
// NPC ID map
// These are the real UUIDs from your Prisma / GuildCraft backend.
// Replace the placeholder values with the actual character IDs you get from
// calling `gcClient.getCharacters()` after seeding your backend.
// ---------------------------------------------------------------------------
export const NPC_CHARACTER_IDS: Record<string, string> = {
  // "scrap"    -> GuildCraft character UUID
  scrap:    import.meta.env.VITE_NPC_ID_SCRAP    ?? "REPLACE_WITH_SCRAP_CHARACTER_ID",
  cipher:   import.meta.env.VITE_NPC_ID_CIPHER   ?? "REPLACE_WITH_CIPHER_CHARACTER_ID",
  enforcer: import.meta.env.VITE_NPC_ID_ENFORCER ?? "REPLACE_WITH_ENFORCER_CHARACTER_ID",
};

export function getCharacterId(npcId: string): string {
  return NPC_CHARACTER_IDS[npcId] ?? npcId;
}