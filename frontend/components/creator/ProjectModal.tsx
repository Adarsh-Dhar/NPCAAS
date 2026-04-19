'use client'

import { useEffect, useState } from 'react'
import RetroInput from '@/components/ui/RetroInput'
import RetroButton from '@/components/ui/RetroButton'
import type { Project } from '@/hooks/useProject'

interface ProjectModalProps {
  isOpen: boolean
  onClose: () => void
  onCreateProject: (name: string) => Promise<Project>
  onSelectProject: (project: Project) => void
  onRefreshProjects: () => Promise<Project[]>
  projects: Project[]
  loading: boolean
}

export default function ProjectModal({
  isOpen,
  onClose,
  onCreateProject,
  onSelectProject,
  onRefreshProjects,
  projects,
  loading,
}: ProjectModalProps) {
  const [projectName, setProjectName] = useState('')
  const [error, setError] = useState('')
  const [generatedApiKey, setGeneratedApiKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    onRefreshProjects().catch(() => {
      // The modal stays usable for creation even if refresh fails.
    })
  }, [isOpen, onRefreshProjects])

  const handleCreate = async () => {
    if (!projectName.trim()) {
      setError('Project name is required')
      return
    }

    try {
      setError('')
      const project = await onCreateProject(projectName)
      setGeneratedApiKey(project.apiKey)
    } catch (err) {
      setError('Failed to create project')
    }
  }

  const handleCopy = () => {
    if (generatedApiKey) {
      navigator.clipboard.writeText(generatedApiKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleClose = () => {
    setProjectName('')
    setGeneratedApiKey(null)
    setCopied(false)
    setError('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="retro-card-blue border-4 border-blue-400 p-6 max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto">
        {!generatedApiKey ? (
          <>
            <h2 className="text-2xl font-bold mb-4 text-white text-center">
              SELECT OR CREATE GAME
            </h2>

            <div className="space-y-4">
              {projects.length > 0 && (
                <div className="retro-card-blue border-4 border-blue-400 p-3">
                  <p className="text-xs uppercase font-bold text-blue-300 mb-3">
                    Existing Games
                  </p>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {projects.map((project) => (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => onSelectProject(project)}
                        className="w-full text-left bg-black border-2 border-blue-500 p-3 hover:border-purple-500 transition-colors"
                      >
                        <p className="text-white text-sm font-bold uppercase">{project.name}</p>
                        <p className="text-blue-400 text-[10px] font-mono mt-1">
                          Created {new Date(project.createdAt).toLocaleDateString()}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t-2 border-blue-500 pt-4">
                <p className="text-xs uppercase font-bold text-blue-300 mb-3">
                  Create New Game
                </p>
              <RetroInput
                borderColor="blue"
                label="Game Name"
                placeholder="e.g., Dragon Quest Online"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                disabled={loading}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
              </div>

              {error && (
                <div className="retro-card-purple border-4 border-purple-400 p-2">
                  <p className="text-purple-300 text-xs font-mono">{error}</p>
                </div>
              )}

              <div className="flex gap-4 pt-4">
                <RetroButton
                  variant="purple"
                  onClick={handleClose}
                  disabled={loading}
                  className="flex-1"
                >
                  CANCEL
                </RetroButton>
                <RetroButton
                  variant="blue"
                  onClick={handleCreate}
                  disabled={loading || !projectName.trim()}
                  className="flex-1"
                >
                  {loading ? 'CREATING...' : 'CREATE GAME'}
                </RetroButton>
              </div>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold mb-2 text-white text-center">
              GAME CREATED!
            </h2>
            <p className="text-xs text-blue-400 text-center mb-4 font-mono uppercase">
              Save your API key - it will not be shown again
            </p>

            <div className="bg-slate-950 border-4 border-blue-400 p-4 mb-4 break-all">
              <p className="text-blue-300 font-mono text-xs">{generatedApiKey}</p>
            </div>

            <div className="space-y-3">
              <RetroButton
                variant={copied ? 'blue' : 'purple'}
                onClick={handleCopy}
                className="w-full text-sm"
              >
                {copied ? 'COPIED!' : 'COPY API KEY'}
              </RetroButton>

              <RetroButton
                variant="blue"
                onClick={handleClose}
                className="w-full text-sm"
              >
                DONE
              </RetroButton>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
