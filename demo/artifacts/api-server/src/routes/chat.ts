// artifacts/api-server/src/routes/chat.ts
//
// Local fallback chat route.  When GC_API_KEY is set in the server
// environment the route proxies the request through the real GuildCraft SDK,
// looking up the character BY NAME (not by hardcoded UUID).
// Without the env var it returns canned fallback lines.

import { Router } from "express";

const router = Router();

// ---------------------------------------------------------------------------
// Optional SDK – loaded lazily when GC_API_KEY is present
// ---------------------------------------------------------------------------
type GcCharacter = { id: string; name: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let gcClient: any | null = null;
/** Lowercase name → character (populated on first request) */
const characterCache = new Map<string, GcCharacter>();
let cacheLoaded = false;

async function initSdk() {
  // Prefer the runtime env var. If it's not present (common in local demos)
  // attempt to read the neighbouring neocity-game .env file so the demo
  // developer can place their key there once and both processes pick it up.
  let apiKey = process.env["GC_API_KEY"];
  let baseUrl = process.env["GC_BASE_URL"] ?? "http://localhost:3000/api";

  if (!apiKey) {
    try {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const candidate = path.resolve(process.cwd(), "../neocity-game/.env");
      if (fs.existsSync(candidate)) {
        const data = fs.readFileSync(candidate, "utf8");
        for (const line of data.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eq = trimmed.indexOf("=");
          if (eq === -1) continue;
          const key = trimmed.slice(0, eq).trim();
          const val = trimmed.slice(eq + 1).trim();
          if (key === "GC_API_KEY" && !apiKey) apiKey = val;
          if (key === "GC_BASE_URL" && (!process.env["GC_BASE_URL"])) baseUrl = val;
        }
      }
    } catch (err) {
      // non-fatal — we'll just bail below if no key is set
    }
  }

  if (!apiKey || !apiKey.startsWith("gc_live_")) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GuildCraftClient } = require("@adarsh23/guildcraft-sdk");
    gcClient = new GuildCraftClient(apiKey, baseUrl);
    console.log("[chat] GuildCraft SDK initialised (server-side proxy)");
  } catch (err) {
    console.warn("[chat] GuildCraft SDK not available for server proxy:", err);
  }
}
void initSdk();

/** Load all characters into the server-side cache (once). */
async function ensureCharacterCache(): Promise<void> {
  if (cacheLoaded || !gcClient) return;
  try {
    const chars: GcCharacter[] = await gcClient.getCharacters();
    for (const c of chars) {
      characterCache.set(c.name.toLowerCase(), c);
    }
    cacheLoaded = true;
    console.log(
      `[chat] Character cache loaded: ${[...characterCache.keys()].join(", ")}`
    );
  } catch (err) {
    console.warn("[chat] Failed to load character cache:", err);
  }
}

/** Return the character whose name matches (case-insensitive). */
async function findCharacterByName(
  name: string
): Promise<GcCharacter | null> {
  await ensureCharacterCache();
  return characterCache.get(name.toLowerCase()) ?? null;
}

// ---------------------------------------------------------------------------
// Fallback lines
// ---------------------------------------------------------------------------
const NPC_FALLBACK_LINES: Record<string, string[]> = {
  scrap: [
    "...watch yourself. I got eyes on every corner of this block.",
    "Maybe I got what you need. Maybe I don't. Depends on your credits.",
    "You think I trust just anyone who walks up? Think again.",
    "Materials cost more when you waste my time.",
    "I heard the Enforcer's already been sniffin' around. You better hurry.",
  ],
  cipher: [
    "Transaction parameters received. Processing fee: 0.05 ETH. Confirm to proceed.",
    "Your input lacks precision. Provide exact token quantities.",
    "The Root Key mint requires 100 SCRP tokens. Confirm to proceed.",
    "Computation cycle: 2.3 seconds. Your request is in queue.",
    "Emotional appeals are inefficient. Speak in numbers.",
  ],
  enforcer: [
    "I was at Scrap's stall an hour ago. Already bought half his stock.",
    "You're still talking while I'm already moving. Cute.",
    "The Root Key? Oh you mean the one I'll have by end of cycle? Yeah.",
    "Every second you spend talking, I spend acting. Do the math.",
    "I've been watching your moves. Predictable. Amateur.",
  ],
};

// ---------------------------------------------------------------------------
// POST /api/chat
// Body: { npcId, npcName, message, systemPrompt?, history? }
//
//  npcId   — game-local key like "scrap"
//  npcName — display name like "SCRAP" (used for GuildCraft lookup)
// ---------------------------------------------------------------------------
router.post("/chat", async (req, res) => {
  const {
    npcId,
    npcName,
    message,
  } = req.body as {
    npcId?: string;
    npcName?: string;
    message?: string;
    systemPrompt?: string;
    history?: Array<{ role: string; content: string }>;
  };

  if (!message || !npcId) {
    return res.status(400).json({ error: "Missing npcId or message" });
  }

  // Require server-side SDK to be configured. Do not fall back to canned
  // lines here — the demo should surface errors so the developer notices
  // missing configuration rather than silently returning mock output.
  if (!gcClient) {
    return res.status(500).json({
      error:
        "Server-side GuildCraft SDK is not configured. Set GC_API_KEY and GC_BASE_URL in the api-server environment.",
    });
  }

  // Lookup the character by name (case-insensitive) and proxy the chat
  // request through the GuildCraft SDK. If the character is not found,
  // return 404 so callers can surface an explicit error.
  try {
    const char = npcName ? await findCharacterByName(npcName) : null;
    if (!char) {
      return res.status(404).json({ error: `Character '${npcName ?? npcId}' not found` });
    }

    const result = await gcClient.chat(char.id, message);
    return res.json({
      response: result.response,
      tradeIntent: result.tradeIntent ?? null,
      npcId,
      characterId: char.id,
      characterName: char.name,
      timestamp: new Date().toISOString(),
      source: "sdk",
    });
  } catch (err) {
    console.error('[chat] SDK proxy error:', err);
    return res.status(502).json({ error: 'GuildCraft SDK proxy error', details: String(err) });
  }
});

export default router;