// demo/lib/db/src/schema/index.ts
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const inventory = pgTable('inventory', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerName: text('owner_name').notNull(),
  itemName: text('item_name').notNull(),
  description: text('description'),
  quantity: integer('quantity').notNull().default(1),
  price: integer('price').notNull(),
});

export const chatSessions = pgTable(
  'chat_sessions',
  {
    id: text('id').primaryKey(),
    playerId: text('player_id').notNull(),
    gameId: text('game_id').notNull(),
    npcName: text('npc_name').notNull(),
    characterId: text('character_id').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    playerNpcLookupIdx: index('chat_sessions_player_npc_lookup_idx').on(
      table.playerId,
      table.gameId,
      table.npcName,
      table.isActive,
    ),
  }),
);

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: text('session_id')
      .references(() => chatSessions.id, { onDelete: 'cascade' })
      .notNull(),
    role: text('role').notNull(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    sessionCreatedAtIdx: index('chat_messages_session_created_at_idx').on(
      table.sessionId,
      table.createdAt,
    ),
  }),
);

export const worldContexts = pgTable('world_contexts', {
  gameId: text('game_id').primaryKey(),
  context: text('context').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const worldEvents = pgTable(
  'world_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    gameId: text('game_id').notNull(),
    sourceId: text('source_id').notNull(),
    sourceName: text('source_name').notNull(),
    actionType: text('action_type').notNull(),
    payload: jsonb('payload').notNull(),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    gameCreatedAtIdx: index('world_events_game_created_at_idx').on(table.gameId, table.createdAt),
  }),
);