'use client'

import { useState } from 'react'
import RetroInput from '@/components/ui/RetroInput'
import RetroButton from '@/components/ui/RetroButton'

interface ProjectModalProps {
  isOpen: boolean
  onClose: () => void
  onCreateProject: (name: string) => Promise<void>
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

  const handleCreate = async () => {
    if (!projectName.trim()) {
      setError('Project name is required')
      return
    }

    try {
      setError('')
      await onCreateProject(projectName)
      setProjectName('')
      onClose()
    } catch (err) {
      setError('Failed to create project')
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="retro-card-cyan border-4 border-cyan-400 p-6 max-w-sm w-full mx-4">
        <h2 className="text-2xl font-bold mb-4 text-white text-center">
          CREATE NEW GAME
        </h2>

        <div className="space-y-4">
          <RetroInput
            borderColor="cyan"
            label="Game Name"
            placeholder="e.g., Adarsh"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            disabled={loading}
          />

          {error && (
            <div className="retro-card-red border-4 border-red-400 p-2">
              <p className="text-red-400 text-xs font-mono">{error}</p>
            </div>
          )}

          <div className="flex gap-4 pt-4">
            <RetroButton
              variant="magenta"
              onClick={onClose}
              disabled={loading}
              className="flex-1"
            >
              {loading ? 'CREATING...' : 'CANCEL'}
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
      </div>
    </div>
  )
}
