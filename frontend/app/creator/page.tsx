'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Navigation from '@/components/layout/Navigation'
import LeftPanel from '@/components/creator/LeftPanel'
import ConfigurationForm from '@/components/creator/ConfigurationForm'
import ProjectModal from '@/components/creator/ProjectModal'
import RetroButton from '@/components/ui/RetroButton'
import { useProject, type Project } from '@/hooks/useProject'

interface CharacterRecord {
  id: string
  projectId: string
  name: string
  walletAddress: string
  config: Record<string, any>
  createdAt: string
  isDeployedOnChain?: boolean
  deploymentTxHash?: string
  adaptation?: Record<string, any>
}

interface CharacterLookupResponse {
  character: CharacterRecord
  project: Project
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

function resolveCharacterId(searchParams: ReturnType<typeof useSearchParams>) {
  const explicitId = searchParams.get('characterId') || searchParams.get('id')
  if (explicitId) {
    return explicitId
  }

  for (const [key, value] of searchParams.entries()) {
    if (!value && key.startsWith('char_')) {
      return key
    }
  }

  return null
}

function normalizeInitialConfig(config?: Record<string, any> | null): FormConfigSnapshot | undefined {
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

export default function CreatorPage() {
  const searchParams = useSearchParams()
  const targetCharacterId = resolveCharacterId(searchParams)
  const targetProjectId = searchParams.get('projectId')

  const {
    currentProject,
    setCurrentProject,
    projects,
    createProject,
    fetchProjects,
    loading,
  } = useProject()

  const [showProjectModal, setShowProjectModal] = useState(false)
  const [currentCharacterId, setCurrentCharacterId] = useState<string | null>(null)
  const [currentCharacter, setCurrentCharacter] = useState<CharacterRecord | null>(null)
  const [characterLoadError, setCharacterLoadError] = useState('')
  const [characterLoading, setCharacterLoading] = useState(false)

  // Fetch projects on mount if empty
  useEffect(() => {
    if (projects.length === 0) {
      fetchProjects()
    }
  }, [])

  useEffect(() => {
    if (!targetCharacterId || targetCharacterId === currentCharacterId) {
      return
    }

    let isCancelled = false

    const resolveCharacter = async () => {
      setCharacterLoading(true)
      setCharacterLoadError('')

      try {
        const response = await fetch(`/api/characters/${encodeURIComponent(targetCharacterId)}`)

        if (!response.ok) {
          if (!isCancelled) {
            if (response.status === 404) {
              setCharacterLoadError(`Character ${targetCharacterId} was not found.`)
            } else {
              setCharacterLoadError('Failed to load the selected character.')
            }
            setCurrentCharacterId(null)
            setCurrentCharacter(null)
          }
          return
        }

        const data = (await response.json()) as CharacterLookupResponse
        if (isCancelled) {
          return
        }

        setCurrentProject(data.project)
        setCurrentCharacterId(data.character.id)
        setCurrentCharacter(data.character)
      } catch (error) {
        if (!isCancelled) {
          console.error('Failed to load character:', error)
          setCharacterLoadError('Failed to load the selected character.')
          setCurrentCharacterId(null)
          setCurrentCharacter(null)
        }
      } finally {
        if (!isCancelled) {
          setCharacterLoading(false)
        }
      }
    }

    resolveCharacter()

    return () => {
      isCancelled = true
    }
  }, [targetCharacterId, currentCharacterId])

  useEffect(() => {
    if (targetCharacterId) {
      return
    }

    setCharacterLoadError('')
    if (currentCharacterId || currentCharacter) {
      setCurrentCharacterId(null)
      setCurrentCharacter(null)
    }
  }, [targetCharacterId, currentCharacterId, currentCharacter])

  useEffect(() => {
    if (loading || projects.length === 0) return
    if (targetCharacterId) return

    if (targetProjectId && (!currentProject || currentProject.id !== targetProjectId)) {
      const proj = projects.find(p => p.id === targetProjectId)
      if (proj) {
        setCurrentProject(proj)
      }
    }
  }, [targetCharacterId, targetProjectId, projects, loading, currentProject])

  const handleProjectCreated = () => {
    setShowProjectModal(false)
  }

  const handleProjectSelected = (project: Project) => {
    setCurrentProject(project)
    setShowProjectModal(false)
  }

  const openProjectModal = async () => {
    try {
      await fetchProjects()
    } catch {
      // Surface errors quietly
    }
    setShowProjectModal(true)
  }

  const handleDeploySuccess = (characterId: string) => {
    setCurrentCharacterId(characterId)
  }

  return (
    <main className="bg-black min-h-screen flex flex-col">
      <Navigation />

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel (33%) - Sticky */}
        <div className="w-1/3 min-h-screen">
          <LeftPanel characterId={currentCharacterId || undefined} />
        </div>

        {/* Right Panel (67%) - Scrollable */}
        <div className="w-2/3 overflow-y-auto">
          <div className="p-8 bg-black">
            {/* Project Header */}
            <div className="mb-8 p-4 retro-card-cyan border-4 border-cyan-400">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white mb-1">
                    CURRENT PROJECT
                  </h2>
                  <p className="text-xs text-cyan-400 font-mono">
                    {currentProject
                      ? `Game: ${currentProject.name}`
                      : 'No game selected (Select before deploying)'}
                  </p>
                </div>
                <RetroButton
                  variant="cyan"
                  onClick={openProjectModal}
                  className="text-xs"
                >
                  {currentProject ? 'SWITCH GAME' : 'SELECT GAME'}
                </RetroButton>
              </div>
              {characterLoading && (
                <p className="mt-3 text-xs text-cyan-300 font-mono">
                  Loading character configuration...
                </p>
              )}
              {characterLoadError && (
                <p className="mt-3 text-xs text-red-400 font-mono">
                  {characterLoadError}
                </p>
              )}
            </div>

            {/* Title */}
            <div className="mb-8">
              <h1 className="gradient-text gradient-cyan-magenta text-4xl font-bold mb-2">
                {currentCharacterId ? 'EDIT YOUR AGENT' : 'CREATE YOUR AGENT'}
              </h1>
              <p className="text-cyan-400 text-sm uppercase font-bold">
                Configure all five layers of your autonomous NPC
              </p>
            </div>

            {/* Form */}
            <ConfigurationForm
              projectId={currentProject?.id}
              characterName={currentCharacter?.name || 'KERMIT_NPC_01'}
              characterId={currentCharacterId}
              initialConfig={normalizeInitialConfig(currentCharacter?.config)}
              onDeploySuccess={handleDeploySuccess}
              onRequireProject={() => setShowProjectModal(true)}
            />

            {/* Footer spacing */}
            <div className="mt-12" />
          </div>
        </div>
      </div>

      {/* Project Modal */}
      <ProjectModal
        isOpen={showProjectModal}
        onClose={handleProjectCreated}
        onCreateProject={createProject}
        onSelectProject={handleProjectSelected}
        onRefreshProjects={fetchProjects}
        projects={projects}
        loading={loading}
      />
    </main>
  )
}