import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { Prisma } from "../lib/generated/prisma/client";

const GAME_EVENTS_BY_NAME: Record<string, Prisma.InputJsonValue> = {
  Aegis_Prime: [
    {
      name: "FIREWALL_CRACKED",
      condition: "Trigger immediately after the player successfully transfers the 500 PYUSD toll.",
    },
    {
      name: "COMBAT_INITIATED",
      condition: "Trigger when player hostility exceeds the configured threshold.",
    },
  ],
  Node_Alpha: [
    {
      name: "ESCROW_FUNDED",
      condition: "Trigger when the player agrees to and funds the 5,000 PYUSD escrow.",
    },
    {
      name: "HACK_COMPLETED",
      condition: "Trigger after Node-Alpha and Node-Omega complete their hash exchange loop.",
    },
    {
      name: "COMBAT_INITIATED",
      condition: "Trigger when player hostility exceeds the configured threshold.",
    },
  ],
  Node_Omega: [
    {
      name: "ESCROW_FUNDED",
      condition: "Trigger when the player agrees to and funds the 5,000 PYUSD escrow.",
    },
    {
      name: "HACK_COMPLETED",
      condition: "Trigger after Node-Alpha and Node-Omega complete their hash exchange loop.",
    },
    {
      name: "COMBAT_INITIATED",
      condition: "Trigger when player hostility exceeds the configured threshold.",
    },
  ],
  Vex: [
    {
      name: "LORE_REVEALED",
      condition: "Trigger when Vex sells the Sector 0 Admin Password to the player.",
    },
    {
      name: "COMBAT_INITIATED",
      condition: "Trigger when player hostility exceeds the configured threshold.",
    },
  ],
  Silicate: [
    {
      name: "ITEM_GRANTED",
      condition: "Trigger alongside a successful sale when inventory items are purchased.",
    },
    {
      name: "COMBAT_INITIATED",
      condition: "Trigger when player hostility exceeds the configured threshold.",
    },
  ],
  The_Weaver: [
    {
      name: "COMBAT_INITIATED",
      condition: "Trigger when player hostility exceeds the configured threshold.",
    },
  ],
  Forge_9: [
    {
      name: "COMBAT_INITIATED",
      condition: "Trigger when player hostility exceeds the configured threshold.",
    },
  ],
};

async function main() {
  const candidateUrls = new Set<string>();
  if (process.env.DATABASE_URL?.trim()) {
    candidateUrls.add(process.env.DATABASE_URL.trim());
  }

  for (const envFile of [".env.local", ".env"]) {
    const fullPath = path.resolve(process.cwd(), envFile);
    if (!fs.existsSync(fullPath)) continue;
    const parsed = fs
      .readFileSync(fullPath, "utf8")
      .split(/\r?\n/)
      .reduce<Record<string, string>>((accumulator, line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return accumulator;

        const separatorIndex = trimmed.indexOf("=");
        if (separatorIndex === -1) return accumulator;

        const key = trimmed.slice(0, separatorIndex).trim();
        const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
        if (key) accumulator[key] = value;
        return accumulator;
      }, {});
    const raw = parsed.DATABASE_URL?.trim();
    if (raw) candidateUrls.add(raw);
  }

  if (candidateUrls.size === 0) {
    throw new Error("No DATABASE_URL values were found in process env, .env.local, or .env");
  }

  let totalAcrossDatabases = 0;

  for (const connectionString of candidateUrls) {
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
    });

    let updatedCount = 0;

    for (const [name, gameEvents] of Object.entries(GAME_EVENTS_BY_NAME)) {
      const result = await prisma.character.updateMany({
        where: {
          name,
        },
        data: {
          gameEvents,
        },
      });

      updatedCount += result.count;
      console.log(`[${connectionString}] Updated ${result.count} row(s) for ${name}`);
    }

    totalAcrossDatabases += updatedCount;
    console.log(`[${connectionString}] Backfill total updates: ${updatedCount}`);
    await prisma.$disconnect();
  }

  console.log(`Backfill complete across all detected databases. Total rows updated: ${totalAcrossDatabases}`);
}

main()
  .catch((error) => {
    console.error("Protocol Babel game events backfill failed:", error);
    process.exitCode = 1;
  });
