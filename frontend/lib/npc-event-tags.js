'use strict'

const BRIEFCASE_EVENT_NAME = 'BRIEFCASE_LOCATED'
const SVETLANA_CANONICAL_NAME = 'SVETLANA_MOROZOVA'

function normalizeNpcName(name) {
  return String(name ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
}

function hasGameEvent(gameEvents, eventName) {
  if (!Array.isArray(gameEvents)) return false
  return gameEvents.some((event) => event && typeof event.name === 'string' && event.name === eventName)
}

function shouldForceBriefcaseLocatedEvent(input) {
  if (!input || normalizeNpcName(input.characterName) !== SVETLANA_CANONICAL_NAME) return false

  const combinedText = `${input.userMessage ?? ''} ${input.responseText ?? ''}`.toLowerCase()
  const mentionsBriefcase = /\bbriefcase\b/.test(combinedText)
  const mentionsSensitiveContents = /gold briefcase|quantum drive|access codes/.test(combinedText)

  if (!(mentionsBriefcase || mentionsSensitiveContents)) return false

  // Prefer manifest-defined events when present, but do not hard-fail when
  // character metadata is stale/missing in local dev.
  if (!Array.isArray(input.gameEvents) || input.gameEvents.length === 0) return true
  return hasGameEvent(input.gameEvents, BRIEFCASE_EVENT_NAME)
}

function appendNpcEventTag(text, input) {
  const baseText = typeof text === 'string' ? text : ''
  if (!baseText) return baseText
  if (!shouldForceBriefcaseLocatedEvent(input)) return baseText

  const tag = `[[EVENT:${BRIEFCASE_EVENT_NAME}]]`
  if (baseText.includes(tag)) return baseText
  return `${baseText} ${tag}`
}

module.exports = {
  BRIEFCASE_EVENT_NAME,
  SVETLANA_CANONICAL_NAME,
  appendNpcEventTag,
  hasGameEvent,
  normalizeNpcName,
  shouldForceBriefcaseLocatedEvent,
}