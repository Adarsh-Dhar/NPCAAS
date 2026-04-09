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

export default function CreatorPage() {
  const searchParams = useSearchParams()
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

  // Read projectId from URL params and fetch that project
  useEffect(() => {
    const projectId = searchParams.get('projectId')

    const initializeProject = async () => {
      if (projectId && currentProject?.id !== projectId) {
        try {
          const response = await fetch(`/api/projects/${projectId}`)
          if (response.ok) {
            const project = await response.json()
            setCurrentProject(project)
            setShowProjectModal(false)
          }
          return
        } catch (err) {
          console.error('Failed to fetch project:', err)
          return
        }
      }

      if (!projectId && !currentProject) {
        try {
          const existingProjects = await fetchProjects()
          if (Array.isArray(existingProjects) && existingProjects.length > 0) {
            setCurrentProject(existingProjects[0])
            setShowProjectModal(false)
          } else {
            setShowProjectModal(true)
          }
        } catch (error) {
          console.error('Failed to fetch projects:', error)
          setShowProjectModal(true)
        }
      }
    }

    initializeProject()
  }, [searchParams, currentProject, setCurrentProject, fetchProjects])

  useEffect(() => {
    const loadCharacters = async () => {
      if (!currentProject?.apiKey) {
        return
      }

      try {
        const response = await fetch('/api/characters', {
          headers: {
            Authorization: `Bearer ${currentProject.apiKey}`,
          },
        })

        if (!response.ok) {
          return
        }

        const projectCharacters = (await response.json()) as CharacterRecord[]
        const scopedCharacters = Array.isArray(projectCharacters)
          ? projectCharacters.filter(
              (character) => character.projectId === currentProject.id
            )
          : []

        if (scopedCharacters.length === 0) {
          setCurrentCharacterId(null)
          setCurrentCharacter(null)
          return
        }

        const latestCharacter = [...scopedCharacters].sort(
          (left, right) =>
            new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
        )[0]

        setCurrentCharacterId(latestCharacter.id)
        setCurrentCharacter(latestCharacter)
      } catch (error) {
        console.error('Failed to load existing characters:', error)
      }
    }

    loadCharacters()
  }, [currentProject])

  const handleProjectCreated = () => {
    setShowProjectModal(false)
  }

  const handleProjectSelected = (project: Project) => {
    setCurrentProject(project)
    setCurrentCharacterId(null)
    setCurrentCharacter(null)
    setShowProjectModal(false)
  }

  const openProjectModal = async () => {
    try {
      await fetchProjects()
    } catch {
      // Surface fetch errors inside modal instead of blocking open.
    }
    setShowProjectModal(true)
  }

  const handleDeploySuccess = (characterId: string) => {
    setCurrentCharacterId(characterId)
    setCurrentCharacter(null)
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
                      : 'No game selected'}
                  </p>
                </div>
                <RetroButton
                  variant="cyan"
                  onClick={openProjectModal}
                  className="text-xs"
                >
                  {currentProject ? 'SWITCH / NEW GAME' : 'SELECT OR CREATE GAME'}
                </RetroButton>
              </div>
            </div>

            {/* Title */}
            <div className="mb-8">
              <h1 className="gradient-text gradient-cyan-magenta text-4xl font-bold mb-2">
                CREATE YOUR AGENT
              </h1>
              <p className="text-cyan-400 text-sm uppercase font-bold">
                Configure all five layers of your autonomous NPC
              </p>
            </div>

            {/* Form */}
            {currentProject && (
              <ConfigurationForm
                projectId={currentProject.id}
                characterName="KERMIT_NPC_01"
                characterId={currentCharacterId}
                initialConfig={currentCharacter?.config}
                onDeploySuccess={handleDeploySuccess}
              />
            )}

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
