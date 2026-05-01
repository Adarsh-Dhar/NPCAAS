import { clearCharacterCache, getClient, isSdkReady } from "@/lib/sdk";
import {
  assertMidnightEventRegistryIsValid,
  MIDNIGHT_CHARACTER_SEEDS,
  MIDNIGHT_MANIFEST_GAME_NAME,
  MIDNIGHT_WORLD_CONTEXT,
  normalizeName,
} from "@/lib/midnightManifest";

type ProjectRecord = {
  id: string;
  name: string;
  apiKey?: string;
  globalContext?: string | null;
};

type CharacterRecord = {
  id: string;
  name: string;
};

let setupPromise: Promise<{ gameId: string; apiKey: string }> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function requireSetupClient(): any {
  if (!isSdkReady()) {
    throw new Error("GuildCraft SDK is not configured. Set VITE_GC_API_KEY and VITE_GC_BASE_URL.");
  }

  const client = getClient();
  if (!client) {
    throw new Error("GuildCraft client is unavailable.");
  }

  return client;
}

async function findOrCreateGame(client: any): Promise<ProjectRecord> {
  const games = (await client.getGames()) as ProjectRecord[];
  const existing = games.find((game) => normalizeName(game.name) === normalizeName(MIDNIGHT_MANIFEST_GAME_NAME));
  if (existing) return existing;

  return (await client.createGame(MIDNIGHT_MANIFEST_GAME_NAME)) as ProjectRecord;
}

async function loadCharacters(client: any) {
  return (await client.getCharacters()) as CharacterRecord[];
}

async function createCharacter(
  client: any,
  payload: {
    name: string;
    config: Record<string, unknown>;
    gameEvents: Array<{ name: string; condition: string }>;
    gameIds: string[];
  }
) {
  const characterConfig = {
    ...payload.config,
    gameEvents: payload.gameEvents,
    worldContext: MIDNIGHT_WORLD_CONTEXT,
  };

  return (await client.deployCharacter({
    name: payload.name,
    config: characterConfig,
    gameIds: payload.gameIds,
  })) as { character: CharacterRecord };
}

async function updateCharacter(
  client: any,
  payload: {
    characterId: string;
    name: string;
    config: Record<string, unknown>;
    gameEvents: Array<{ name: string; condition: string }>;
  }
) {
  const characterConfig = {
    ...payload.config,
    gameEvents: payload.gameEvents,
    worldContext: MIDNIGHT_WORLD_CONTEXT,
  };

  await client.updateCharacter({
    characterId: payload.characterId,
    name: payload.name,
    config: characterConfig,
  });
}

async function assignCharacters(client: any, gameId: string, characterIds: string[]) {
  await client.assignCharactersToGame(gameId, characterIds);
}

export async function ensureMidnightManifestSetup() {
  if (setupPromise) return setupPromise;

  setupPromise = (async () => {
    assertMidnightEventRegistryIsValid();

    const bootstrapClient = requireSetupClient();
    const game = await findOrCreateGame(bootstrapClient);

    if (game.apiKey) {
      (window as Window & { __VITE_GC_API_KEY?: string }).__VITE_GC_API_KEY = game.apiKey;
      clearCharacterCache();
    }

    const client = requireSetupClient();

    const existing = await loadCharacters(client);
    const existingByName = new Map(existing.map((character) => [normalizeName(character.name), character]));

    const characterIds: string[] = [];

    for (const seed of MIDNIGHT_CHARACTER_SEEDS) {
      const matched = existingByName.get(normalizeName(seed.name));

      if (matched) {
        await updateCharacter(client, {
          characterId: matched.id,
          name: seed.name,
          config: seed.config,
          gameEvents: seed.gameEvents,
        });
        characterIds.push(matched.id);
        continue;
      }

      const created = await createCharacter(client, {
        name: seed.name,
        config: seed.config,
        gameEvents: seed.gameEvents,
        gameIds: [game.id],
      });
      characterIds.push(created.character.id);
    }

    await assignCharacters(client, game.id, characterIds);

    clearCharacterCache();

    const activeKey = (window as Window & { __VITE_GC_API_KEY?: string }).__VITE_GC_API_KEY ?? "";
    return { gameId: game.id, apiKey: activeKey };
  })().catch((error) => {
    setupPromise = null
    throw error
  })

  return setupPromise;
}
