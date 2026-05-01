import { and, asc, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from './index';
import { chatMessages, chatSessions, worldContexts, worldEvents } from './schema';

export type ChatMessageRole = 'user' | 'npc' | 'system';

interface GetOrCreateSessionInput {
  sessionId?: string;
  playerId: string;
  gameId: string;
  npcName: string;
  characterId: string;
}

interface AppendMessageInput {
  sessionId: string;
  role: ChatMessageRole;
  content: string;
}

export async function getOrCreateActiveChatSession(input: GetOrCreateSessionInput) {
  const requestedSessionId = input.sessionId?.trim();

  if (requestedSessionId) {
    const requested = await db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, requestedSessionId))
      .limit(1);

    const match = requested[0];
    if (
      match &&
      match.isActive &&
      match.playerId === input.playerId &&
      match.gameId === input.gameId &&
      match.npcName === input.npcName
    ) {
      return match;
    }
  }

  const active = await db
    .select()
    .from(chatSessions)
    .where(
      and(
        eq(chatSessions.playerId, input.playerId),
        eq(chatSessions.gameId, input.gameId),
        eq(chatSessions.npcName, input.npcName),
        eq(chatSessions.characterId, input.characterId),
        eq(chatSessions.isActive, true),
      ),
    )
    .orderBy(desc(chatSessions.updatedAt))
    .limit(1);

  if (active[0]) {
    return active[0];
  }

  const nextSessionId = requestedSessionId ?? randomUUID();
  await db.insert(chatSessions).values({
    id: nextSessionId,
    playerId: input.playerId,
    gameId: input.gameId,
    npcName: input.npcName,
    characterId: input.characterId,
    isActive: true,
  });

  const inserted = await db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.id, nextSessionId))
    .limit(1);

  if (!inserted[0]) {
    throw new Error(`Failed to create chat session ${nextSessionId}`);
  }

  return inserted[0];
}

export async function fetchRecentChatMessages(sessionId: string, limit = 20) {
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(safeLimit);

  return rows.reverse();
}

export async function appendChatMessage(input: AppendMessageInput) {
  await db.insert(chatMessages).values({
    sessionId: input.sessionId,
    role: input.role,
    content: input.content,
  });

  await db
    .update(chatSessions)
    .set({ updatedAt: new Date() })
    .where(eq(chatSessions.id, input.sessionId));
}

export async function endChatSession(sessionId: string) {
  await db
    .update(chatSessions)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(chatSessions.id, sessionId));
}

export async function getWorldContext(gameId: string) {
  const rows = await db
    .select()
    .from(worldContexts)
    .where(eq(worldContexts.gameId, gameId))
    .orderBy(asc(worldContexts.gameId))
    .limit(1);

  return rows[0] ?? null;
}

export async function upsertWorldContext(input: { gameId: string; context: string }) {
  await db
    .insert(worldContexts)
    .values({
      gameId: input.gameId,
      context: input.context,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: worldContexts.gameId,
      set: {
        context: input.context,
        updatedAt: new Date(),
      },
    });

  return getWorldContext(input.gameId);
}

export async function appendWorldEvent(input: {
  gameId: string;
  sourceId: string;
  sourceName: string;
  actionType: string;
  payload: Record<string, unknown>;
  timestamp: string;
}) {
  await db.insert(worldEvents).values({
    gameId: input.gameId,
    sourceId: input.sourceId,
    sourceName: input.sourceName,
    actionType: input.actionType,
    payload: input.payload,
    timestamp: new Date(input.timestamp),
  });
}

export async function fetchRecentWorldEvents(gameId: string, limit = 50) {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  return db
    .select()
    .from(worldEvents)
    .where(eq(worldEvents.gameId, gameId))
    .orderBy(desc(worldEvents.createdAt))
    .limit(safeLimit);
}

export async function resetGameSession(gameId: string) {
  await db.delete(worldEvents).where(eq(worldEvents.gameId, gameId));
  await db.delete(worldContexts).where(eq(worldContexts.gameId, gameId));
  await db.delete(chatSessions).where(eq(chatSessions.gameId, gameId));
}
