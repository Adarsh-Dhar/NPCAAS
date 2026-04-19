export interface GameEventDefinition {
  name: string
  condition: string
}

export interface BriefcaseEventInput {
  characterName?: string
  userMessage?: string
  responseText?: string
  gameEvents?: GameEventDefinition[]
}

export declare const BRIEFCASE_EVENT_NAME: 'BRIEFCASE_LOCATED'
export declare const SVETLANA_CANONICAL_NAME: 'SVETLANA_MOROZOVA'

export declare function normalizeNpcName(name: string): string
export declare function hasGameEvent(
  gameEvents: GameEventDefinition[] | undefined,
  eventName: string
): boolean
export declare function shouldForceBriefcaseLocatedEvent(input: BriefcaseEventInput): boolean
export declare function appendNpcEventTag(text: string, input: BriefcaseEventInput): string