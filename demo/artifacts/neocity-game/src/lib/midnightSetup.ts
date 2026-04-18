import { clearCharacterCache } from "@/lib/sdk";
import {
  MIDNIGHT_CHARACTER_SEEDS,
  MIDNIGHT_MANIFEST_GAME_NAME,
  MIDNIGHT_WORLD_CONTEXT,
  normalizeName,
} from "@/lib/midnightManifest";

type ProjectRecord = {
  id: string;
  name: string;
  apiKey: string;
  globalContext?: string | null;
};

type CharacterRecord = {
  id: string;
  name: string;
};

let setupPromise: Promise<{ gameId: string; apiKey: string }> | null = null;

async function requestJson<T>(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = typeof payload.error === "string" ? payload.error : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return (await response.json()) as T;
}

async function findOrCreateGame(): Promise<ProjectRecord> {
  const games = await requestJson<ProjectRecord[]>("/api/games");
  const existing = games.find((game) => normalizeName(game.name) === normalizeName(MIDNIGHT_MANIFEST_GAME_NAME));
  if (existing) return existing;

  return requestJson<ProjectRecord>("/api/games", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: MIDNIGHT_MANIFEST_GAME_NAME }),
  });
}

async function ensureGlobalContext(gameId: string) {
  await requestJson<ProjectRecord>(`/api/projects/${encodeURIComponent(gameId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ globalContext: MIDNIGHT_WORLD_CONTEXT }),
  });
}

async function loadCharacters(apiKey: string) {
  return requestJson<CharacterRecord[]>("/api/characters", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

async function createCharacter(
  apiKey: string,
  payload: {
    name: string;
    config: Record<string, unknown>;
    gameEvents: Array<{ name: string; condition: string }>;
    gameIds: string[];
  }
) {
  return requestJson<{ character: CharacterRecord }>("/api/characters", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });
}

async function updateCharacter(
  apiKey: string,
  payload: {
    characterId: string;
    name: string;
    config: Record<string, unknown>;
    gameEvents: Array<{ name: string; condition: string }>;
  }
) {
  await requestJson("/api/characters", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });
}

async function assignCharacters(apiKey: string, gameId: string, characterIds: string[]) {
  await requestJson(`/api/games/${encodeURIComponent(gameId)}/characters`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ characterIds }),
  });
}

export async function ensureMidnightManifestSetup() {
  if (setupPromise) return setupPromise;

  setupPromise = (async () => {
    const game = await findOrCreateGame();
    await ensureGlobalContext(game.id);

    const existing = await loadCharacters(game.apiKey);
    const existingByName = new Map(existing.map((character) => [normalizeName(character.name), character]));

    const characterIds: string[] = [];

    for (const seed of MIDNIGHT_CHARACTER_SEEDS) {
      const matched = existingByName.get(normalizeName(seed.name));

      if (matched) {
        await updateCharacter(game.apiKey, {
          characterId: matched.id,
          name: seed.name,
          config: seed.config,
          gameEvents: seed.gameEvents,
        });
        characterIds.push(matched.id);
        continue;
      }

      const created = await createCharacter(game.apiKey, {
        name: seed.name,
        config: seed.config,
        gameEvents: seed.gameEvents,
        gameIds: [game.id],
      });
      characterIds.push(created.character.id);
    }

    await assignCharacters(game.apiKey, game.id, characterIds);

    // Point demo SDK runtime key to this game and reset cached characters.
    (window as Window & { __VITE_GC_API_KEY?: string }).__VITE_GC_API_KEY = game.apiKey;
    clearCharacterCache();

    return { gameId: game.id, apiKey: game.apiKey };
  })();

  return setupPromise;
}
