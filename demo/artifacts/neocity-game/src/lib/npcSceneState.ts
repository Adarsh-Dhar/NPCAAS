import type { Character } from '@adarsh23/guildcraft-sdk'

type SceneCharactersListener = (characters: Character[]) => void

let characters: Character[] = []
const listeners = new Set<SceneCharactersListener>()

export function setSceneCharacters(nextCharacters: Character[]) {
  characters = [...nextCharacters]
  for (const listener of listeners) {
    try {
      listener(characters)
    } catch {
      // Ignore individual listener failures.
    }
  }
}

export function getSceneCharacters() {
  return [...characters]
}

export function subscribeSceneCharacters(listener: SceneCharactersListener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}