'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Navigation from '@/components/layout/Navigation'
import LeftPanel from '@/components/creator/LeftPanel'
import ConfigurationForm from '@/components/creator/ConfigurationForm'
import ProjectModal from '@/components/creator/ProjectModal'
import RetroButton from '@/components/ui/RetroButton'
import { useProject } from '@/hooks/useProject'

export default function CreatorPage() {
  const searchParams = useSearchParams()
  const { currentProject, setCurrentProject, createProject, loading } = useProject()
  const [showProjectModal, setShowProjectModal] = useState(false)
  const [currentCharacterId, setCurrentCharacterId] = useState<string | null>(null)

  // Read projectId from URL params and fetch that project
  useEffect(() => {
    const projectId = searchParams.get('projectId')
    
    if (projectId && !currentProject) {
      // Fetch the specific project
      const fetchProject = async () => {
        try {
          const response = await fetch(`/api/projects/${projectId}`)
          if (response.ok) {
            const project = await response.json()
            setCurrentProject(project)
          }
        } catch (err) {
          console.error('Failed to fetch project:', err)
        }
      }
      fetchProject()
    } else if (!projectId && !currentProject) {
      // Show modal if no project ID in URL and no current project
      setShowProjectModal(true)
    }
  }, [searchParams, currentProject, setCurrentProject])

  const handleProjectCreated = () => {
    setShowProjectModal(false)
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
                      : 'No game selected'}
                  </p>
                </div>
                <RetroButton
                  variant="cyan"
                  onClick={() => setShowProjectModal(true)}
                  className="text-xs"
                >
                  {currentProject ? 'NEW GAME' : 'CREATE GAME'}
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
        loading={loading}
      />
    </main>
  )
}
