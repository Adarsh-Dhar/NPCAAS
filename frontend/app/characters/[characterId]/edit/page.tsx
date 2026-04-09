'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import LeftPanel from '@/components/creator/LeftPanel'
import ConfigurationForm from '@/components/creator/ConfigurationForm'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

interface CharacterRecord {
  id: string
  name: string
  config: Record<string, unknown>
}

interface CharacterLookupResponse {
  character: CharacterRecord
}

interface FormConfigSnapshot {
  capital?: string
  pricingAlgorithm?: string
  systemPrompt?: string
  openness?: number
  factions?: string
  hostility?: string
  canTrade?: boolean
  canMove?: boolean
  canCraft?: boolean
  teeExecution?: string
  computeBudget?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number') {
    return String(value)
  }
  return undefined
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeInitialConfig(config?: Record<string, unknown> | null): FormConfigSnapshot | undefined {
  if (!isRecord(config)) {
    return undefined
  }

  const snapshot = isRecord(config.configSnapshot) ? config.configSnapshot : null
  const isAdaptationShape =
    Boolean(snapshot) ||
    'specializationActive' in config ||
    'turnCount' in config ||
    'preferences' in config ||
    'lastUpdatedAt' in config ||
    'summary' in config

  return {
    capital: asString(config.capital),
    pricingAlgorithm: asString(config.pricingAlgorithm),
    systemPrompt:
      asString(config.systemPrompt) ??
      (isAdaptationShape ? asString(snapshot?.systemPrompt) : undefined),
    openness:
      asNumber(config.openness) ??
      (isAdaptationShape ? asNumber(snapshot?.openness) : undefined),
    factions: asString(config.factions),
    hostility: asString(config.hostility),
    canTrade: asBoolean(config.canTrade),
    canMove: asBoolean(config.canMove),
    canCraft: asBoolean(config.canCraft),
    teeExecution: asString(config.teeExecution),
    computeBudget: asString(config.computeBudget),
  }
}

export default function EditCharacterPage() {
  const params = useParams()
  const characterId = String(params.characterId)

  const [character, setCharacter] = useState<CharacterRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    const loadCharacter = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await fetch(`/api/characters/${encodeURIComponent(characterId)}`)
        if (!response.ok) {
          throw new Error('Failed to load character')
        }
        const payload = (await response.json()) as CharacterLookupResponse
        if (!cancelled) {
          setCharacter(payload.character)
        }
      } catch (loadError) {
        if (!cancelled) {
          const message = loadError instanceof Error ? loadError.message : 'Failed to load character'
          setError(message)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    if (characterId) {
      loadCharacter()
    }

    return () => {
      cancelled = true
    }
  }, [characterId])

  return (
    <main className="bg-black min-h-screen flex flex-col text-white">
      <TopNav />

      <div className="px-8 pt-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/games">Games</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/characters">Characters</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{character?.name ?? 'Edit'}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="flex flex-1 overflow-hidden mt-4">
        <div className="w-1/3 min-h-screen">
          <LeftPanel characterId={characterId} />
        </div>

        <div className="w-2/3 overflow-y-auto">
          <div className="p-8 bg-black">
            <div className="mb-8">
              <h1 className="gradient-text gradient-cyan-magenta text-4xl font-bold mb-2">
                EDIT YOUR AGENT
              </h1>
              <p className="text-cyan-400 text-sm uppercase font-bold">
                Update configuration and save changes.
              </p>
            </div>

            {loading ? (
              <p className="text-cyan-400 font-mono">Loading character configuration...</p>
            ) : error || !character ? (
              <div className="border-4 border-red-500 p-4 text-red-400">{error || 'Character not found'}</div>
            ) : (
              <ConfigurationForm
                characterName={character.name}
                characterId={character.id}
                initialConfig={normalizeInitialConfig(character.config)}
              />
            )}

            <div className="mt-12" />
          </div>
        </div>
      </div>
    </main>
  )
}
