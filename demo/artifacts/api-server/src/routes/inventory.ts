// demo/artifacts/api-server/src/routes/inventory.ts
import { Router } from 'express';
import { db } from '@workspace/db';
import { inventory } from '@workspace/db/schema';
import { eq, ilike, or } from 'drizzle-orm';

export const inventoryRouter = Router();

inventoryRouter.post('/query', async (req, res) => {
  try {
    const searchQuery = req.body.searchQuery || req.body.query || '';

    const results = await db.select().from(inventory).where(
      or(
        ilike(inventory.ownerName, `%${searchQuery}%`),
        ilike(inventory.itemName, `%${searchQuery}%`)
      )
    );

    if (results.length === 0) {
      return res.json({ result: "No inventory items found matching that query." });
    }

    const formattedResults = results.map(item =>
      `- ${item.itemName}: ${item.quantity} in stock (Price: ${item.price} CU). Description: ${item.description}`
    ).join('\n');

    return res.json({
      result: "Inventory Data Found:",
      items: formattedResults,
    });

  } catch (error) {
    console.error('Inventory fetch error:', error);
    return res.status(500).json({ error: 'Failed to query inventory database' });
  }
});