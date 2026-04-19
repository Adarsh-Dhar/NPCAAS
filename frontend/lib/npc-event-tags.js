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
  if (!hasGameEvent(input.gameEvents, BRIEFCASE_EVENT_NAME)) return false

  const combinedText = `${input.userMessage ?? ''} ${input.responseText ?? ''}`.toLowerCase()
  return /\bbriefcase\b/.test(combinedText) || /gold briefcase|quantum drive|access codes/.test(combinedText)
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