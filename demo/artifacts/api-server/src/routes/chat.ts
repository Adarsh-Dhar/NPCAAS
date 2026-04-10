// artifacts/api-server/src/routes/chat.ts
//
// This route is the local fallback when the frontend SDK is not configured.
// If GC_API_KEY is set in the server environment, it will use the real SDK
// to proxy the chat request. Otherwise it returns canned fallback lines.

import { Router } from "express";

const router = Router();

// ---------------------------------------------------------------------------
// Optional SDK integration
// When GC_API_KEY is set in the server env, use the real GuildCraft SDK
// ---------------------------------------------------------------------------
let gcClient: {
  chat: (characterId: string, message: string) => Promise<{
    success: boolean;
    response: string;
    tradeIntent?: { item: string; price: number; currency: string };
  }>;
} | null = null;

// NPC character ID mapping (server-side, uses regular env vars not VITE_)
const NPC_CHARACTER_IDS: Record<string, string> = {
  scrap:    process.env["NPC_ID_SCRAP"]    ?? "",
  cipher:   process.env["NPC_ID_CIPHER"]   ?? "",
  enforcer: process.env["NPC_ID_ENFORCER"] ?? "",
};

// Dynamically import SDK only when API key is present
// (SDK is a CJS package installed at server level separately if needed)
async function initSdk() {
  const apiKey = process.env["GC_API_KEY"];
  const baseUrl = process.env["GC_BASE_URL"] ?? "http://localhost:3000/api";
  if (!apiKey || !apiKey.startsWith("gc_live_")) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GuildCraftClient } = require("../../../../../frontend/sdk/index");
    gcClient = new GuildCraftClient(apiKey, baseUrl);
    console.log("[chat] GuildCraft SDK initialized for server-side proxying");
  } catch (err) {
    console.warn("[chat] GuildCraft SDK not available for server-side use:", err);
  }
}
initSdk().catch(() => {});

// ---------------------------------------------------------------------------
// Fallback lines (used when SDK is unavailable)
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
    "The Root Key mint requires 100 RAW tokens transferred to address 0xC1PH3R.",
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
// ---------------------------------------------------------------------------
router.post("/chat", async (req, res) => {
  const { npcId, message } = req.body as {
    npcId?: string;
    message?: string;
    systemPrompt?: string;
    history?: Array<{ role: string; content: string }>;
  };

  if (!message || !npcId) {
    return res.status(400).json({ error: "Missing npcId or message" });
  }

  // ── Try SDK proxy ────────────────────────────────────────────────────
  if (gcClient && NPC_CHARACTER_IDS[npcId]) {
    try {
      const characterId = NPC_CHARACTER_IDS[npcId];
      const result = await gcClient.chat(characterId, message);
      return res.json({
        response: result.response,
        tradeIntent: result.tradeIntent,
        npcId,
        timestamp: new Date().toISOString(),
        source: "sdk",
      });
    } catch (err) {
      console.error("[chat] SDK proxy error, falling back:", err);
      // Fall through to local fallback
    }
  }

  // ── Local fallback ───────────────────────────────────────────────────
  const fallbackLines = NPC_FALLBACK_LINES[npcId] ?? ["..."];
  const fallbackResponse =
    fallbackLines[Math.floor(Math.random() * fallbackLines.length)];

  return res.json({
    response: fallbackResponse,
    npcId,
    timestamp: new Date().toISOString(),
    source: "fallback",
  });
});

export default router;