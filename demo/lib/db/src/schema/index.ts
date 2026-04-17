// demo/lib/db/src/schema/index.ts
import { pgTable, text, integer, uuid } from 'drizzle-orm/pg-core';

export const inventory = pgTable('inventory', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerName: text('owner_name').notNull(),
  itemName: text('item_name').notNull(),
  description: text('description'),
  quantity: integer('quantity').notNull().default(1),
  price: integer('price').notNull(),
});