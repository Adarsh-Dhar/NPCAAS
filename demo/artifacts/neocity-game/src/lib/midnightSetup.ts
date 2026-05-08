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

function getActiveApiKey() {
  return (window as Window & { __VITE_GC_API_KEY?: string }).__VITE_GC_API_KEY ?? "";
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}
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

    let game: ProjectRecord;
    try {
      game = await findOrCreateGame(bootstrapClient);
    } catch (error) {
      // Local dev fallback: if the API/database isn't running, don't block the Phaser scene.
      // The scene can still render with seeded NPC ids; chat + dashboard features may be degraded.
      console.warn("[MidnightSetup] Failed to create/load game. Falling back to local-only mode.", error);
      return { gameId: "local-demo", apiKey: getActiveApiKey() };
    }

    if (game.apiKey) {
      (window as Window & { __VITE_GC_API_KEY?: string }).__VITE_GC_API_KEY = game.apiKey;
      clearCharacterCache();
    }

    const client = requireSetupClient();

    let existing: CharacterRecord[] = [];
    try {
      existing = await loadCharacters(client);
    } catch (error) {
      console.warn("[MidnightSetup] Failed to load characters. Continuing without remote characters.", error);
      const activeKey = getActiveApiKey();
      return { gameId: game.id, apiKey: activeKey };
    }

    const existingByName = new Map(existing.map((character) => [normalizeName(character.name), character]));

    const characterIds: string[] = [];

    try {
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
    } catch (error) {
      // If character provisioning fails (e.g. DB down), still allow the UI to load.
      console.warn(
        `[MidnightSetup] Character provisioning failed: ${toErrorMessage(error)}. Continuing without provisioning.`,
        error
      );
      const activeKey = getActiveApiKey();
      return { gameId: game.id, apiKey: activeKey };
    }

    clearCharacterCache();

    const activeKey = (window as Window & { __VITE_GC_API_KEY?: string }).__VITE_GC_API_KEY ?? "";
    return { gameId: game.id, apiKey: activeKey };
  })().catch((error) => {
    setupPromise = null
    throw error
  })

  return setupPromise;
}
