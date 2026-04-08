'use client'

import { useState, useEffect } from 'react'
import TopNav from '@/components/TopNav'
import RetroButton from '@/components/ui/RetroButton'
import Link from 'next/link'

interface Project {
  id: string
  name: string
  createdAt: string
}

export default function GamePage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await fetch('/api/projects')
        if (!response.ok) throw new Error('Failed to fetch projects')
        const data = await response.json()
        setProjects(data)
      } catch (err) {
        setError('Failed to load games')
      } finally {
        setLoading(false)
      }
    }

    fetchProjects()
  }, [])

  return (
    <div className="min-h-screen bg-black text-white">
      <TopNav />

      <main className="p-8 max-w-7xl mx-auto">
        {/* Page Title */}
        <div className="mb-12">
          <h1 className="gradient-text gradient-cyan-magenta text-4xl font-bold mb-2">
            ALL GAMES
          </h1>
          <p className="text-cyan-400 text-sm uppercase font-bold">
            Select a game to manage characters
          </p>
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-12">
            <p className="text-cyan-400 font-mono">Loading games...</p>
          </div>
        ) : error ? (
          <div className="border-4 border-red-500 bg-black p-6 text-center">
            <p className="text-red-400 font-mono">{error}</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="border-4 border-yellow-400 bg-black p-12 text-center">
            <p className="text-yellow-400 text-lg font-bold mb-4">NO GAMES FOUND</p>
            <p className="text-gray-400 font-mono mb-6">Create your first game to get started</p>
            <Link href="/creator">
              <RetroButton variant="yellow" size="lg">
                CREATE GAME
              </RetroButton>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <Link key={project.id} href={`/game/${project.id}/characters`}>
                <div className="border-4 border-cyan-500 bg-black p-6 cursor-pointer hover:border-magenta-500 hover:bg-opacity-80 transition-all h-full">
                  <div className="mb-4">
                    <h3 className="text-xl font-bold text-white uppercase mb-2">
                      {project.name}
                    </h3>
                    <p className="text-xs text-gray-400 font-mono">
                      {new Date(project.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="border-t-2 border-cyan-500 pt-4 mt-4">
                    <RetroButton
                      variant="cyan"
                      size="md"
                      className="w-full text-xs"
                    >
                      VIEW CHARACTERS
                    </RetroButton>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
