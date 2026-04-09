'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import RetroButton from '@/components/ui/RetroButton'
import FundWalletModal from '@/components/FundWalletModal'

interface CharacterItem {
  id: string
  name: string
  walletAddress: string
  smartAccountStatus: string
  projectIds: string[]
  createdAt: string
}

interface FundTarget {
  name: string
  walletAddress: string
}

export default function CharactersPage() {
  const [characters, setCharacters] = useState<CharacterItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [fundTarget, setFundTarget] = useState<FundTarget | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadCharacters = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await fetch('/api/characters')
        if (!response.ok) throw new Error('Failed to load characters')
        const payload = await response.json()
        if (!cancelled) setCharacters(Array.isArray(payload) ? payload : [])
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load characters')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadCharacters()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="min-h-screen bg-black text-white">
      <TopNav />

      <main className="p-8 max-w-7xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="gradient-text gradient-cyan-magenta text-4xl font-bold mb-2">MY CHARACTERS</h1>
            <p className="text-cyan-400 text-sm uppercase font-bold">
              Global fleet across all games
            </p>
          </div>
          <Link href="/characters/new">
            <RetroButton variant="green" size="lg">
              DEPLOY NEW AGENT
            </RetroButton>
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-12 text-cyan-400 font-mono">Loading agents...</div>
        ) : error ? (
          <div className="border-4 border-red-500 bg-black p-6 text-center text-red-400 font-mono">
            {error}
          </div>
        ) : characters.length === 0 ? (
          <div className="border-4 border-yellow-400 bg-black p-12 text-center">
            <p className="text-yellow-400 text-lg font-bold mb-4">NO AGENTS FOUND</p>
            <p className="text-gray-400 font-mono mb-6">
              Create your first autonomous character.
            </p>
            <Link href="/characters/new">
              <RetroButton variant="yellow" size="lg">CREATE AGENT</RetroButton>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {characters.map((character) => (
              <div
                key={character.id}
                className="border-4 border-cyan-500 bg-black p-6 hover:border-magenta-500 transition-all flex flex-col"
              >
                <h3 className="text-xl font-bold text-white uppercase mb-2">{character.name}</h3>
                <p className="text-xs text-gray-400 font-mono mb-3">
                  {new Date(character.createdAt).toLocaleDateString()}
                </p>

                <div className="border-t-2 border-cyan-500 pt-3 mb-3">
                  <p className="text-xs text-gray-400 uppercase font-bold mb-1">Wallet</p>
                  <p className="text-xs font-mono text-cyan-300 break-all">{character.walletAddress}</p>
                </div>

                <div className="border-t-2 border-cyan-500 pt-3 mb-4">
                  <p className="text-xs text-gray-400 uppercase font-bold mb-1">Assigned Games</p>
                  <p className="text-sm font-bold text-yellow-300">{character.projectIds?.length ?? 0}</p>
                </div>

                <div className="mt-auto flex flex-col gap-2">
                  <button
                    onClick={() =>
                      setFundTarget({ name: character.name, walletAddress: character.walletAddress })
                    }
                    className="w-full border-4 border-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-300 text-xs font-bold py-2 px-3 transition-all uppercase"
                  >
                    💰 FUND WALLET
                  </button>

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

      {fundTarget && (
        <FundWalletModal
          characterName={fundTarget.name}
          walletAddress={fundTarget.walletAddress}
          onClose={() => setFundTarget(null)}
        />
      )}
    </div>
  )
}