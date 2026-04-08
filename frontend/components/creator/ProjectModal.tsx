'use client'

import { useState } from 'react'
import RetroInput from '@/components/ui/RetroInput'
import RetroButton from '@/components/ui/RetroButton'
import type { Project } from '@/hooks/useProject'

interface ProjectModalProps {
  isOpen: boolean
  onClose: () => void
  onCreateProject: (name: string) => Promise<Project>
  loading: boolean
}

export default function ProjectModal({
  isOpen,
  onClose,
  onCreateProject,
  loading,
}: ProjectModalProps) {
  const [projectName, setProjectName] = useState('')
  const [error, setError] = useState('')
  const [generatedApiKey, setGeneratedApiKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

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
      <div className="retro-card-cyan border-4 border-cyan-400 p-6 max-w-md w-full mx-4">
        {!generatedApiKey ? (
          <>
            <h2 className="text-2xl font-bold mb-4 text-white text-center">
              CREATE NEW GAME
            </h2>

            <div className="space-y-4">
              <RetroInput
                borderColor="cyan"
                label="Game Name"
                placeholder="e.g., Dragon Quest Online"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                disabled={loading}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />

              {error && (
                <div className="retro-card-red border-4 border-red-400 p-2">
                  <p className="text-red-400 text-xs font-mono">{error}</p>
                </div>
              )}

              <div className="flex gap-4 pt-4">
                <RetroButton
                  variant="magenta"
                  onClick={handleClose}
                  disabled={loading}
                  className="flex-1"
                >
                  CANCEL
                </RetroButton>
                <RetroButton
                  variant="green"
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
            <p className="text-xs text-cyan-400 text-center mb-4 font-mono uppercase">
              Save your API key - it will not be shown again
            </p>

            <div className="bg-gray-900 border-4 border-yellow-400 p-4 mb-4 break-all">
              <p className="text-yellow-400 font-mono text-xs">{generatedApiKey}</p>
            </div>

            <div className="space-y-3">
              <RetroButton
                variant={copied ? 'green' : 'yellow'}
                onClick={handleCopy}
                className="w-full text-sm"
              >
                {copied ? 'COPIED!' : 'COPY API KEY'}
              </RetroButton>

              <RetroButton
                variant="cyan"
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
