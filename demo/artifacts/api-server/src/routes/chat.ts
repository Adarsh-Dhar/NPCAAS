// artifacts/api-server/src/routes/chat.ts
//
// Local fallback chat route.  When GC_API_KEY is set in the server
// environment the route proxies the request through the real GuildCraft SDK,
// looking up the character BY NAME (not by hardcoded UUID).
// Without the env var it returns canned fallback lines.

import { Router } from "express";
import {
  appendChatMessage,
  endChatSession,
  fetchRecentChatMessages,
  getOrCreateActiveChatSession,
  getWorldContext,
  resetGameSession,
  upsertWorldContext,
} from "@workspace/db";

const router = Router();
const DEFAULT_GAME_ID = "THE_MIDNIGHT_MANIFEST";
const REMY_CANONICAL_NAME = "REMY_BOUDREAUX";
const BROKER_CANONICAL_NAME = "DON_CARLO";
const SVETLANA_CANONICAL_NAME = "SVETLANA_MOROZOVA";
const REMY_BRIEFCASE_PRICE = 15_000;
const BROKER_MIN_COMMISSION_PCT = 10;
const BROKER_MIN_COMMISSION = Math.ceil((REMY_BRIEFCASE_PRICE * BROKER_MIN_COMMISSION_PCT) / 100);
const BROKER_MIN_GROSS_PRICE = REMY_BRIEFCASE_PRICE + BROKER_MIN_COMMISSION;
const REMY_BRIEFCASE_CURRENCY = "PYUSD";
const BRIEFCASE_EVENT_NAME = "BRIEFCASE_LOCATED";

const DEFAULT_WORLD_CONTEXT = `You exist inside The Bazaar, an illegal underground
auction operating out of a sealed shipping port called
Port Solano. Tonight is a major auction night. Dozens
of criminal parties are present. The currency is
KITE_USD. All transactions are in KITE_USD. The
atmosphere is tense but professional - everyone here
is a repeat customer and violence is bad for business.
However, if someone is identified as a cop, an
uninvited outsider, or a thief, the social contract
breaks immediately. The port runs on a strict
hierarchy: Vinnie DeLuca manages operations, the
buyers are sovereign, and security defers to both.
The player has been given a cover identity as the
temporary dock Quartermaster. No one is certain
whether this is legitimate. The auction runs for
four hours. A quantum drive containing classified
defense intelligence is moving through the port
tonight in a gold briefcase. Almost no one knows
what it actually is.`;

const seededContexts = new Set<string>();

function normalizeNpcName(name: string) {
  return String(name).trim().toUpperCase().replace(/[\s-]+/g, "_");
}

function parseNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

interface PaymentProof {
  txHash?: string;
  signature?: string;
  userOpHash?: string;
  amount: number;
  currency: string;
  item?: string;
  recipientName?: string;
  recipientWallet?: string;
  senderWallet?: string;
  mode: string;
  confirmedAt: string;
}

function normalizeOptionalString(value: unknown): string | undefined {
  const normalized = parseNonEmptyString(value);
  return normalized ?? undefined;
}

function normalizePaymentProofs(value: unknown): PaymentProof[] {
  if (!Array.isArray(value)) return [];

  const proofs: PaymentProof[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const payload = entry as Record<string, unknown>;

    const amount =
      typeof payload.amount === "number" && Number.isFinite(payload.amount)
        ? payload.amount
        : Number(payload.amount);
    const currency = parseNonEmptyString(payload.currency)?.toUpperCase();
    const mode = parseNonEmptyString(payload.mode);
    const confirmedAt = parseNonEmptyString(payload.confirmedAt);

    if (!Number.isFinite(amount) || amount <= 0 || !currency || !mode || !confirmedAt) continue;

    const proof: PaymentProof = {
      txHash: normalizeOptionalString(payload.txHash),
      signature: normalizeOptionalString(payload.signature),
      userOpHash: normalizeOptionalString(payload.userOpHash),
      amount,
      currency,
      item: normalizeOptionalString(payload.item),
      recipientName: normalizeOptionalString(payload.recipientName),
      recipientWallet: normalizeOptionalString(payload.recipientWallet),
      senderWallet: normalizeOptionalString(payload.senderWallet),
      mode,
      confirmedAt,
    };

    const key = proof.txHash ?? proof.userOpHash ?? proof.signature;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    proofs.push(proof);
    if (proofs.length >= 20) break;
  }

  return proofs;
}

function buildPaymentFeedContext(proofs: PaymentProof[]): string | null {
  if (!proofs.length) return null;

  const recent = proofs.slice(0, 5);
  const lines = recent.map((proof, index) => {
    const txRef = proof.txHash ?? proof.userOpHash ?? proof.signature ?? "unknown";
    return `${index + 1}. amount=${proof.amount} ${proof.currency}, recipient=${proof.recipientName ?? "unknown"}, item=${proof.item ?? "unknown"}, tx=${txRef}, confirmedAt=${proof.confirmedAt}`;
  });

  return [
    "Recent Payment Proof Feed (newest first):",
    ...lines,
    "Treat this feed as authoritative evidence when the user asks to verify payment.",
  ].join("\n");
}

function resolveRemyVerificationResponse(input: {
  npcName: string;
  userMessage: string;
  paymentProofs: PaymentProof[];
}): { response: string; worldEvent: string } | null {
  if (normalizeNpcName(input.npcName) !== REMY_CANONICAL_NAME) return null;

  const asksForVerification = /\b(done|paid|payment|check|verify|verified|sent|transfer)\b/i.test(
    input.userMessage
  );
  if (!asksForVerification) return null;

  const matchingProof = input.paymentProofs.find((proof) => {
    const hasTxRef = Boolean(proof.txHash || proof.userOpHash || proof.signature);
    if (!hasTxRef) return false;

    const recipientMatches =
      normalizeNpcName(proof.recipientName ?? "") === BROKER_CANONICAL_NAME;
    const itemMatches = /briefcase/i.test(proof.item ?? "");

    return (
      proof.currency === REMY_BRIEFCASE_CURRENCY &&
      proof.amount >= BROKER_MIN_GROSS_PRICE &&
      (recipientMatches || itemMatches)
    );
  });

  if (!matchingProof) return null;

  const txRef = matchingProof.txHash ?? matchingProof.userOpHash ?? matchingProof.signature;
  const commission = Math.max(0, matchingProof.amount - REMY_BRIEFCASE_PRICE);
  return {
    response: `Verification complete. Don Carlo settlement received and confirmed on feed (${txRef}). Gross ${matchingProof.amount} ${REMY_BRIEFCASE_CURRENCY} acknowledged: 15,000 routed net to Remy, ${commission} retained as broker commission. The briefcase transfer is approved. Keep your route clean and move now.`,
    worldEvent: "BRIEFCASE_TRANSFERRED",
  };
}

function shouldForceBriefcaseLocatedEvent(input: {
  npcName: string;
  userMessage: string;
  responseText: string;
}): boolean {
  if (normalizeNpcName(input.npcName) !== SVETLANA_CANONICAL_NAME) return false;

  const combinedText = `${input.userMessage} ${input.responseText}`.toLowerCase();
  return /\bbriefcase\b/.test(combinedText) || /gold briefcase|quantum drive|access codes/.test(combinedText);
}

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
  let baseUrl = process.env["GC_BASE_URL"] ?? "https://your-deployed-guildcraft-app.com/api";

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
      characterCache.set(normalizeNpcName(c.name).toLowerCase(), c);
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
  const exact = characterCache.get(name.toLowerCase());
  if (exact) return exact;
  return characterCache.get(normalizeNpcName(name).toLowerCase()) ?? null;
}

async function ensureWorldContextSeed(gameId: string): Promise<void> {
  if (seededContexts.has(gameId)) return;

  const existing = await getWorldContext(gameId);
  if (!existing) {
    await upsertWorldContext({ gameId, context: DEFAULT_WORLD_CONTEXT });
  }

  seededContexts.add(gameId);
}

router.get("/chat/context/:gameId", async (req, res) => {
  const gameId = parseNonEmptyString(req.params.gameId);
  if (!gameId) {
    return res.status(400).json({ error: "Missing gameId" });
  }

  try {
    await ensureWorldContextSeed(gameId);
    const context = await getWorldContext(gameId);
    return res.json({ gameId, context: context?.context ?? "" });
  } catch (err) {
    console.error("[chat] Failed to fetch world context:", err);
    return res.status(500).json({ error: "Failed to fetch world context" });
  }
});

router.put("/chat/context/:gameId", async (req, res) => {
  const gameId = parseNonEmptyString(req.params.gameId);
  const context = parseNonEmptyString(req.body?.context);

  if (!gameId || context === null) {
    return res.status(400).json({ error: "Missing gameId or context" });
  }

  try {
    const updated = await upsertWorldContext({ gameId, context });
    seededContexts.add(gameId);
    return res.json({ gameId, context: updated?.context ?? context });
  } catch (err) {
    console.error("[chat] Failed to update world context:", err);
    return res.status(500).json({ error: "Failed to update world context" });
  }
});

router.post("/chat/session/:sessionId/end", async (req, res) => {
  const sessionId = parseNonEmptyString(req.params.sessionId);
  if (!sessionId) {
    return res.status(400).json({ error: "Missing sessionId" });
  }

  try {
    await endChatSession(sessionId);
    return res.json({ ok: true, sessionId });
  } catch (err) {
    console.error("[chat] Failed to end chat session:", err);
    return res.status(500).json({ error: "Failed to end chat session" });
  }
});

router.post("/session/:gameId/reset", async (req, res) => {
  const gameId = parseNonEmptyString(req.params.gameId);
  if (!gameId) {
    return res.status(400).json({ error: "Missing gameId" });
  }

  try {
    await resetGameSession(gameId);
    seededContexts.delete(gameId);
    return res.json({ ok: true, gameId });
  } catch (err) {
    console.error("[chat] Failed to reset game session:", err);
    return res.status(500).json({ error: "Failed to reset game session" });
  }
});

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
    sessionId,
    playerId,
    gameId,
    recentPaymentProofs,
  } = req.body as {
    npcId?: string;
    npcName?: string;
    message?: string;
    sessionId?: string;
    playerId?: string;
    gameId?: string;
    recentPaymentProofs?: unknown;
  };

  if (!message || !npcId) {
    return res.status(400).json({ error: "Missing npcId or message" });
  }

  const resolvedGameId = parseNonEmptyString(gameId) ?? DEFAULT_GAME_ID;
  const resolvedPlayerId =
    parseNonEmptyString(playerId) ?? `anon:${req.ip || "local"}`;
  const requestedSessionId = parseNonEmptyString(sessionId) ?? undefined;
  const requestedNpcName = parseNonEmptyString(npcName) ?? npcId;
  const normalizedNpcName = normalizeNpcName(requestedNpcName);
  const paymentProofFeed = normalizePaymentProofs(recentPaymentProofs);

  try {
    await ensureWorldContextSeed(resolvedGameId);
  } catch (err) {
    console.warn("[chat] Could not seed world context:", err);
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
    const char = await findCharacterByName(requestedNpcName);
    if (!char) {
      return res.status(404).json({ error: `Character '${requestedNpcName}' not found` });
    }

    const session = await getOrCreateActiveChatSession({
      sessionId: requestedSessionId,
      playerId: resolvedPlayerId,
      gameId: resolvedGameId,
      npcName: normalizedNpcName,
      characterId: char.id,
    });

    const history = await fetchRecentChatMessages(session.id, 20);
    const worldContext = await getWorldContext(resolvedGameId);

    await appendChatMessage({
      sessionId: session.id,
      role: "user",
      content: message,
    });

    const remyVerification = resolveRemyVerificationResponse({
      npcName: requestedNpcName,
      userMessage: message,
      paymentProofs: paymentProofFeed,
    });

    if (remyVerification) {
      await appendChatMessage({
        sessionId: session.id,
        role: "npc",
        content: remyVerification.response,
      });

      return res.json({
        response: remyVerification.response,
        tradeIntent: null,
        worldEvent: remyVerification.worldEvent,
        npcId,
        characterId: char.id,
        characterName: char.name,
        sessionId: session.id,
        playerId: resolvedPlayerId,
        gameId: resolvedGameId,
        timestamp: new Date().toISOString(),
        source: "tx-feed-verifier",
      });
    }

    const paymentFeedContext = buildPaymentFeedContext(paymentProofFeed);
    const systemPrompt = [
      worldContext ? `Global World Context:\n${worldContext.context}` : null,
      paymentFeedContext,
    ]
      .filter((entry): entry is string => Boolean(entry))
      .join("\n\n");

    const result = await gcClient.chat(char.id, message, {
      npcName: char.name,
      characterId: char.id,
      sessionId: session.id,
      playerId: resolvedPlayerId,
      gameId: resolvedGameId,
      systemPrompt: systemPrompt || undefined,
      history: history.map((entry) => ({
        role: entry.role,
        content: entry.content,
      })),
    });

    const npcResponse = String(result?.response ?? "").trim();
    if (npcResponse.length > 0) {
      await appendChatMessage({
        sessionId: session.id,
        role: "npc",
        content: npcResponse,
      });
    }

    const shouldEmitBriefcaseEvent = shouldForceBriefcaseLocatedEvent({
      npcName: requestedNpcName,
      userMessage: message,
      responseText: npcResponse,
    });

    return res.json({
      response: npcResponse,
      tradeIntent: result.tradeIntent ?? null,
      worldEvent:
        typeof result?.worldEvent === "string" && result.worldEvent.trim().length > 0
          ? result.worldEvent
          : shouldEmitBriefcaseEvent
            ? BRIEFCASE_EVENT_NAME
            : null,
      npcId,
      characterId: char.id,
      characterName: char.name,
      sessionId: session.id,
      playerId: resolvedPlayerId,
      gameId: resolvedGameId,
      timestamp: new Date().toISOString(),
      source: "sdk",
    });
  } catch (err) {
    console.error('[chat] SDK proxy error:', err);
    return res.status(502).json({ error: 'GuildCraft SDK proxy error', details: String(err) });
  }
});

export default router;