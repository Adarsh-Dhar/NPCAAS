import { resetPlayerState } from '@/lib/playerState'

const MIDNIGHT_GAME_ID = 'THE_MIDNIGHT_MANIFEST'
const PLAYER_STATE_STORAGE_KEY = 'neocity.playerState.v1'
const MIDNIGHT_PLAYER_ID_KEY = 'midnight.manifest.player.id'
const MIDNIGHT_SESSION_KEY_PREFIX = 'midnight.manifest.session'
const WORLD_EVENTS_STORAGE_KEY = `neocity.worldEvents.${MIDNIGHT_GAME_ID}.v1`
const WORLD_EVENTS_BASE_URL =
  (import.meta.env?.VITE_WORLD_EVENTS_BASE_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:3002'
const SESSION_RESET_ENDPOINT = `${WORLD_EVENTS_BASE_URL}/api/session/${MIDNIGHT_GAME_ID}/reset`

function clearLocalStorageKeys() {
  if (typeof window === 'undefined') return

  const keysToRemove = [PLAYER_STATE_STORAGE_KEY, MIDNIGHT_PLAYER_ID_KEY, WORLD_EVENTS_STORAGE_KEY]
  for (const key of keysToRemove) {
    window.localStorage.removeItem(key)
  }

  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index)
    if (!key) continue
    if (!key.startsWith(`${MIDNIGHT_SESSION_KEY_PREFIX}:${MIDNIGHT_GAME_ID}:`)) continue
    window.localStorage.removeItem(key)
  }
}

export async function resetDemoSession() {
  resetPlayerState()
  clearLocalStorageKeys()

  try {
    await fetch(SESSION_RESET_ENDPOINT, { method: 'POST' })
  } catch {
    // The local reset still succeeded; the server will repopulate on demand.
  }
}