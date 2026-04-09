'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import RetroButton from '@/components/ui/RetroButton'

interface Game {
  id: string
  name: string
  characterCount: number
  createdAt: string
}

export default function GamesPage() {
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    const loadGames = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await fetch('/api/games')
        if (!response.ok) {
          throw new Error('Failed to fetch games')
        }
        const payload = await response.json()
        if (!cancelled) {
          setGames(Array.isArray(payload) ? payload : [])
        }
      } catch (loadError) {
        if (!cancelled) {
          const message = loadError instanceof Error ? loadError.message : 'Failed to load games'
          setError(message)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadGames()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="min-h-screen bg-black text-white">
      <TopNav />

      <main className="p-8 max-w-7xl mx-auto">
        <div className="mb-12 flex items-center justify-between">
          <div>
            <h1 className="gradient-text gradient-cyan-magenta text-4xl font-bold mb-2">MY GAMES</h1>
            <p className="text-cyan-400 text-sm uppercase font-bold">Select a game to manage assigned agents</p>
          </div>
          <Link href="/characters/new">
            <RetroButton variant="magenta" size="md">
              DEPLOY AGENT
            </RetroButton>
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-cyan-400 font-mono">Loading games...</p>
          </div>
        ) : error ? (
          <div className="border-4 border-red-500 bg-black p-6 text-center text-red-400 font-mono">
            {error}
          </div>
        ) : games.length === 0 ? (
          <div className="border-4 border-yellow-400 bg-black p-12 text-center">
            <p className="text-yellow-400 text-lg font-bold mb-4">NO GAMES FOUND</p>
            <p className="text-gray-400 font-mono mb-6">Create a game via API and assign agents after deployment.</p>
            <Link href="/characters/new">
              <RetroButton variant="yellow" size="lg">DEPLOY YOUR FIRST AGENT</RetroButton>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {games.map((game) => (
              <Link key={game.id} href={`/games/${game.id}`}>
                <div className="border-4 border-cyan-500 bg-black p-6 cursor-pointer hover:border-magenta-500 transition-all h-full">
                  <h3 className="text-xl font-bold text-white uppercase mb-2">{game.name}</h3>
                  <p className="text-sm text-cyan-300 font-bold mb-1">
                    {game.characterCount} {game.characterCount === 1 ? 'CHARACTER' : 'CHARACTERS'}
                  </p>
                  <p className="text-xs text-gray-400 font-mono mb-4">
                    {new Date(game.createdAt).toLocaleDateString()}
                  </p>
                  <div className="border-t-2 border-cyan-500 pt-4 mt-4">
                    <RetroButton variant="cyan" size="md" className="w-full text-xs">
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
