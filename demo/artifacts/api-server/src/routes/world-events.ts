import { Router } from "express";
import { appendWorldEvent, fetchRecentWorldEvents } from "@workspace/db";

const router = Router();

function parseString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseLimit(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? "50"), 10);
  if (Number.isNaN(parsed) || parsed <= 0) return 50;
  return Math.min(parsed, 100);
}

router.get("/world-events", async (req, res) => {
  const gameId = parseString(req.query.gameId);
  if (!gameId) {
    return res.status(400).json({ error: "Missing gameId" });
  }

  try {
    const events = await fetchRecentWorldEvents(gameId, parseLimit(req.query.limit));
    return res.json({ gameId, events });
  } catch (error) {
    console.error("[world-events] Failed to fetch events:", error);
    return res.status(500).json({ error: "Failed to fetch world events" });
  }
});

router.post("/world-events", async (req, res) => {
  const gameId = parseString(req.body?.gameId);
  const sourceId = parseString(req.body?.sourceId);
  const sourceName = parseString(req.body?.sourceName);
  const actionType = parseString(req.body?.actionType);
  const timestamp = parseString(req.body?.timestamp);
  const payload = req.body?.payload;

  if (!gameId || !sourceId || !sourceName || !actionType || !timestamp || !payload || typeof payload !== "object") {
    return res.status(400).json({ error: "Missing event fields" });
  }

  try {
    await appendWorldEvent({
      gameId,
      sourceId,
      sourceName,
      actionType,
      payload: payload as Record<string, unknown>,
      timestamp,
    });

    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error("[world-events] Failed to append event:", error);
    return res.status(500).json({ error: "Failed to persist world event" });
  }
});

export default router;