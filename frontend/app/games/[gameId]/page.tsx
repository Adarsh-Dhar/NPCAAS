'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import RetroButton from '@/components/ui/RetroButton'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

interface Character {
  id: string
  name: string
  walletAddress: string
  smartAccountStatus: string
  projectIds: string[]
  createdAt: string
}

interface GameResponse {
  game: {
    id: string
    name: string
  }
  characters: Character[]
}

export default function GameCharactersPage() {
  const params = useParams()
  const gameId = String(params.gameId)

  const [gameName, setGameName] = useState('Game')
  const [characters, setCharacters] = useState<Character[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    const loadGameCharacters = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await fetch(`/api/games/${encodeURIComponent(gameId)}/characters`)
        if (!response.ok) {
          throw new Error('Failed to load game characters')
        }
        const payload = (await response.json()) as GameResponse

        if (!cancelled) {
          setGameName(payload.game?.name ?? 'Game')
          setCharacters(Array.isArray(payload.characters) ? payload.characters : [])
        }
      } catch (loadError) {
        if (!cancelled) {
          const message =
            loadError instanceof Error ? loadError.message : 'Failed to load game characters'
          setError(message)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    if (gameId) {
      loadGameCharacters()
    }

    return () => {
      cancelled = true
    }
  }, [gameId])

  return (
    <div className="min-h-screen bg-black text-white">
      <TopNav />

      <main className="p-8 max-w-7xl mx-auto">
        <Breadcrumb className="mb-6">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/games">Games</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{gameName}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="gradient-text gradient-cyan-magenta text-4xl font-bold mb-2">
              {gameName.toUpperCase()}
            </h1>
            <p className="text-cyan-400 text-sm uppercase font-bold">
              {characters.length} Character{characters.length !== 1 ? 's' : ''} Assigned
            </p>
          </div>

          <Link href={`/characters/new?gameId=${gameId}`}>
            <RetroButton variant="green" size="md">ADD AGENT</RetroButton>
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-12 text-cyan-400 font-mono">Loading game data...</div>
        ) : error ? (
          <div className="border-4 border-red-500 bg-black p-6 text-center text-red-400 font-mono">{error}</div>
        ) : characters.length === 0 ? (
          <div className="border-4 border-yellow-400 bg-black p-12 text-center">
            <p className="text-yellow-400 text-lg font-bold mb-4">NO CHARACTERS ASSIGNED</p>
            <p className="text-gray-400 font-mono mb-6">
              Deploy an agent, then assign it to this game.
            </p>
            <Link href={`/characters/new?gameId=${gameId}`}>
              <RetroButton variant="yellow" size="lg">CREATE CHARACTER</RetroButton>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {characters.map((character) => (
              <div
                key={character.id}
                className="border-4 border-magenta-500 bg-black p-6 hover:border-cyan-400 transition-all"
              >
                <h3 className="text-xl font-bold text-white uppercase mb-2">{character.name}</h3>

                <div className="border-t-2 border-magenta-500 pt-4 mb-4">
                  <p className="text-xs text-gray-400 uppercase font-bold mb-1">Wallet Address</p>
                  <p className="text-xs font-mono text-cyan-400 break-all">{character.walletAddress}</p>
                </div>

                <div className="border-t-2 border-magenta-500 pt-4 mb-4">
                  <p className="text-xs text-gray-400 uppercase font-bold mb-1">Smart Account Status</p>
                  <p className="text-xs font-mono text-green-400">{character.smartAccountStatus}</p>
                </div>

                <div className="border-t-2 border-magenta-500 pt-4">
                  <Link href={`/characters/${character.id}/edit`}>
                    <RetroButton variant="magenta" size="md" className="w-full text-xs">
                      EDIT CHARACTER
                    </RetroButton>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
