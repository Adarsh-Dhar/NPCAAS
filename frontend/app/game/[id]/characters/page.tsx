'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import TopNav from '@/components/TopNav'
import RetroButton from '@/components/ui/RetroButton'
import Link from 'next/link'

interface Character {
  id: string
  projectId: string
  name: string
  walletAddress: string
  config: Record<string, any>
  isDeployedOnChain: boolean
  deploymentTxHash?: string
  createdAt: string
}

interface Project {
  id: string
  name: string
  createdAt: string
}

export default function GameCharactersPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [characters, setCharacters] = useState<Character[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch the specific project by ID
        const projectRes = await fetch(`/api/projects/${projectId}`)
        if (!projectRes.ok) throw new Error('Failed to fetch project')
        const currentProject = await projectRes.json()
        
        setProject(currentProject)

        // Fetch characters for this project
        const charsRes = await fetch(`/api/characters?projectId=${projectId}`)
        if (!charsRes.ok) throw new Error('Failed to fetch characters')
        const projectCharacters = await charsRes.json()
        setCharacters(Array.isArray(projectCharacters) ? projectCharacters : [])
      } catch (err) {
        console.error('Error loading game data:', err)
        setError('Failed to load game data')
      } finally {
        setLoading(false)
      }
    }

    if (projectId) {
      fetchData()
    }
  }, [projectId])

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white">
        <TopNav />
        <main className="p-8 max-w-7xl mx-auto">
          <div className="text-center py-12">
            <p className="text-cyan-400 font-mono">Loading game data...</p>
          </div>
        </main>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-black text-white">
        <TopNav />
        <main className="p-8 max-w-7xl mx-auto">
          <div className="border-4 border-red-500 bg-black p-6 text-center mb-6">
            <p className="text-red-400 font-mono">{error || 'Game not found'}</p>
          </div>
          <Link href="/game">
            <RetroButton variant="magenta" size="lg">
              BACK TO GAMES
            </RetroButton>
          </Link>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <TopNav />

      <main className="p-8 max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="gradient-text gradient-cyan-magenta text-4xl font-bold mb-2">
              {project.name.toUpperCase()}
            </h1>
            <p className="text-cyan-400 text-sm uppercase font-bold">
              {characters.length} Character{characters.length !== 1 ? 's' : ''} Deployed
            </p>
          </div>
          <Link href="/game">
            <RetroButton variant="magenta" size="md">
              BACK
            </RetroButton>
          </Link>
        </div>

        {/* Characters Grid */}
        {characters.length === 0 ? (
          <div className="border-4 border-yellow-400 bg-black p-12 text-center">
            <p className="text-yellow-400 text-lg font-bold mb-4">NO CHARACTERS</p>
            <p className="text-gray-400 font-mono mb-6">
              Deploy your first NPC character to this game
            </p>
            <Link href={`/creator?projectId=${projectId}`}>
              <RetroButton variant="yellow" size="lg">
                CREATE CHARACTER
              </RetroButton>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {characters.map((character) => (
              <div
                key={character.id}
                className="border-4 border-magenta-500 bg-black p-6 hover:border-cyan-400 transition-all"
              >
                {/* Character Header */}
                <div className="mb-4">
                  <h3 className="text-xl font-bold text-white uppercase mb-2">
                    {character.name}
                  </h3>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <p className="text-xs text-green-400 font-bold uppercase">
                      DEPLOYED
                    </p>
                  </div>
                </div>

                {/* Wallet Info */}
                <div className="border-t-2 border-magenta-500 pt-4 mb-4">
                  <p className="text-xs text-gray-400 uppercase font-bold mb-1">
                    Wallet Address
                  </p>
                  <p className="text-xs font-mono text-cyan-400 break-all">
                    {character.walletAddress}
                  </p>
                </div>

                {/* Deployment Info */}
                <div className="border-t-2 border-magenta-500 pt-4 mb-4">
                  <p className="text-xs text-gray-400 uppercase font-bold mb-1">
                    Created
                  </p>
                  <p className="text-xs font-mono text-yellow-400">
                    {new Date(character.createdAt).toLocaleDateString()}
                  </p>
                </div>

                {/* Transaction Hash */}
                {character.deploymentTxHash && (
                  <div className="border-t-2 border-magenta-500 pt-4 mb-4">
                    <p className="text-xs text-gray-400 uppercase font-bold mb-1">
                      Transaction
                    </p>
                    <p className="text-xs font-mono text-cyan-400 break-all">
                      {character.deploymentTxHash.slice(0, 16)}...
                    </p>
                  </div>
                )}

                {/* Config Preview */}
                <div className="border-t-2 border-magenta-500 pt-4">
                  <p className="text-xs text-gray-400 uppercase font-bold mb-2">
                    Configuration
                  </p>
                  <div className="bg-opacity-30 bg-gray-800 p-3 rounded border border-gray-600 max-h-24 overflow-y-auto">
                    <pre className="text-xs font-mono text-gray-300">
                      {JSON.stringify(character.config, null, 2).slice(0, 200)}
                      {JSON.stringify(character.config, null, 2).length > 200 && '...'}
                    </pre>
                  </div>
                </div>

                {/* Action Button */}
                <div className="mt-4">
                  <RetroButton
                    variant="magenta"
                    size="md"
                    className="w-full text-xs"
                    onClick={() => {
                      // Could open character detail page or edit modal
                    }}
                  >
                    VIEW DETAILS
                  </RetroButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
