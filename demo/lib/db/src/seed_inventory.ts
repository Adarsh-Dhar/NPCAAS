// demo/lib/db/src/seed-inventory.ts
// Run with: npx tsx src/seed-inventory.ts
import { db, pool } from './index';
import { inventory } from './schema';

async function seed() {
  console.log('Seeding inventory table...');

  await db.delete(inventory);

  await db.insert(inventory).values([
    {
      ownerName: 'Silicate',
      itemName: 'Level-1 Logic Virus',
      description: 'A compact exploit payload. Breaches basic sector firewalls.',
      quantity: 3,
      price: 500,
    },
    {
      ownerName: 'Silicate',
      itemName: 'Sector 4 Access Key',
      description: 'Unlocks the restricted data lanes in Sector 4.',
      quantity: 1,
      price: 1200,
    },
    {
      ownerName: 'Vex',
      itemName: 'Sector 0 Admin Password',
      description: 'Full administrative access to District-7 core systems.',
      quantity: 1,
      price: 1500,
    },
    {
      ownerName: 'Vex',
      itemName: 'Raw Data Shard',
      description: 'Unprocessed data extracted from node logs. High resale value.',
      quantity: 5,
      price: 200,
    },
    {
      ownerName: 'Forge_9',
      itemName: 'Encrypted Comms Token',
      description: `Grants one-time secure channel with Protocol Babel nodes.`,
      quantity: 2,
      price: 800,
    },
    {
      ownerName: 'Node_Alpha',
      itemName: 'Escrow Release Code',
      description: `Triggers escrow release for pending transactions.`,
      quantity: 1,
      price: 3000,
    },
  ]);

  console.log('Seed complete.');
  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});