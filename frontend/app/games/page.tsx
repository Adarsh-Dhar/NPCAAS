'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import RetroButton from '@/components/ui/RetroButton'
import RetroInput from '@/components/ui/RetroInput'

interface Game {
  id: string
  name: string
  apiKey: string
  characterCount: number
  createdAt: string
}

// ── Create New Game Modal ──────────────────────────────────────────────────

interface CreateGameModalProps {
  onClose: () => void
  onCreated: (game: Game) => void
}

function CreateGameModal({ onClose, onCreated }: CreateGameModalProps) {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [createdGame, setCreatedGame] = useState<Game | null>(null)
  const [copied, setCopied] = useState(false)

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Game name is required')
      return
    }
    setCreating(true)
    setError('')
    try {
      const response = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error ?? 'Failed to create game')
      }
      const game = await response.json()
      setCreatedGame(game)
      onCreated(game)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create game')
    } finally {
      setCreating(false)
    }
  }

  const handleCopy = () => {
    if (!createdGame) return
    navigator.clipboard.writeText(createdGame.apiKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="w-full max-w-lg border-4 border-cyan-400 bg-black shadow-[8px_8px_0px_0px_rgba(34,211,238,1)]">
        {/* Header */}
        <div className="border-b-4 border-cyan-400 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white uppercase tracking-wider">
            {createdGame ? '✓ Game Created!' : 'Create New Game'}
          </h2>
          <button
            onClick={onClose}
            className="text-cyan-400 hover:text-white text-xl font-bold transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-6">
          {!createdGame ? (
            <>
              <p className="text-gray-400 text-xs font-mono mb-6 uppercase">
                Name your game to get an API key for NPC integration.
              </p>

              <RetroInput
                borderColor="cyan"
                label="Game Name"
                placeholder="e.g. Dragon Quest Online"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !creating && handleCreate()}
                disabled={creating}
              />

              {error && (
                <p className="mt-3 text-xs text-red-400 font-mono">{error}</p>
              )}

              <div className="mt-6 flex gap-3 justify-end">
                <RetroButton variant="magenta" size="sm" onClick={onClose} disabled={creating}>
                  CANCEL
                </RetroButton>
                <RetroButton
                  variant="green"
                  size="sm"
                  onClick={handleCreate}
                  disabled={creating || !name.trim()}
                >
                  {creating ? 'CREATING...' : 'CREATE GAME'}
                </RetroButton>
              </div>
            </>
          ) : (
            <>
              <p className="text-yellow-400 text-xs font-bold uppercase mb-2">
                ⚠ Save your API key — it won't be shown again
              </p>
              <p className="text-gray-400 text-xs font-mono mb-4">
                Game: <span className="text-white font-bold">{createdGame.name}</span>
              </p>

              <div className="bg-gray-950 border-4 border-yellow-400 p-4 mb-4 break-all">
                <p className="text-yellow-300 font-mono text-xs leading-relaxed">
                  {createdGame.apiKey}
                </p>
              </div>

              <div className="flex gap-3 justify-end">
                <RetroButton
                  variant={copied ? 'green' : 'yellow'}
                  size="sm"
                  onClick={handleCopy}
                >
                  {copied ? '✓ COPIED!' : 'COPY API KEY'}
                </RetroButton>
                <RetroButton variant="cyan" size="sm" onClick={onClose}>
                  DONE
                </RetroButton>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Revoke API Key Modal ───────────────────────────────────────────────────

interface RevokeModalProps {
  game: Game
  onClose: () => void
  onRevoked: (updatedGame: Game) => void
}

function RevokeModal({ game, onClose, onRevoked }: RevokeModalProps) {
  const [revoking, setRevoking] = useState(false)
  const [error, setError] = useState('')
  const [newKey, setNewKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const handleRevoke = async () => {
    setRevoking(true)
    setError('')
    try {
      const response = await fetch(`/api/games/${encodeURIComponent(game.id)}/regenerate-key`, {
        method: 'POST',
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error ?? 'Failed to regenerate API key')
      }
      const updated = await response.json()
      setNewKey(updated.apiKey)
      onRevoked({ ...game, apiKey: updated.apiKey })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate API key')
    } finally {
      setRevoking(false)
    }
  }

  const handleCopy = () => {
    if (!newKey) return
    navigator.clipboard.writeText(newKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="w-full max-w-lg border-4 border-red-500 bg-black shadow-[8px_8px_0px_0px_rgba(239,68,68,1)]">
        {/* Header */}
        <div className="border-b-4 border-red-500 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white uppercase tracking-wider">
            {newKey ? '✓ New API Key Generated' : '⚠ Revoke API Key'}
          </h2>
          <button
            onClick={onClose}
            className="text-red-400 hover:text-white text-xl font-bold transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-6">
          {!newKey ? (
            <>
              <p className="text-gray-300 text-sm font-mono mb-2">
                Game: <span className="text-white font-bold">{game.name}</span>
              </p>
              <div className="border-2 border-red-500/40 bg-red-950/20 p-4 mb-5">
                <p className="text-red-300 text-xs font-mono leading-relaxed">
                  Are you sure you want to revoke the current API key and generate a new one?
                  Any integrations using the old key will <span className="text-red-400 font-bold">immediately stop working</span>.
                </p>
              </div>

              {error && (
                <p className="mb-4 text-xs text-red-400 font-mono">{error}</p>
              )}

              <div className="flex gap-3 justify-end">
                <RetroButton variant="cyan" size="sm" onClick={onClose} disabled={revoking}>
                  CANCEL
                </RetroButton>
                <RetroButton
                  variant="red"
                  size="sm"
                  onClick={handleRevoke}
                  disabled={revoking}
                >
                  {revoking ? 'REVOKING...' : 'YES, REVOKE & REGENERATE'}
                </RetroButton>
              </div>
            </>
          ) : (
            <>
              <p className="text-yellow-400 text-xs font-bold uppercase mb-2">
                ⚠ Save your new API key — the old one is now invalid
              </p>
              <p className="text-gray-400 text-xs font-mono mb-4">
                Game: <span className="text-white font-bold">{game.name}</span>
              </p>

              <div className="bg-gray-950 border-4 border-yellow-400 p-4 mb-4 break-all">
                <p className="text-yellow-300 font-mono text-xs leading-relaxed">
                  {newKey}
                </p>
              </div>

              <div className="flex gap-3 justify-end">
                <RetroButton
                  variant={copied ? 'green' : 'yellow'}
                  size="sm"
                  onClick={handleCopy}
                >
                  {copied ? '✓ COPIED!' : 'COPY NEW KEY'}
                </RetroButton>
                <RetroButton variant="cyan" size="sm" onClick={onClose}>
                  DONE
                </RetroButton>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Key Icon SVG ───────────────────────────────────────────────────────────

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="m21 2-9.6 9.6" />
      <path d="m15.5 7.5 3 3L22 7l-3-3" />
    </svg>
  )
}

// ── Main Games Page ────────────────────────────────────────────────────────

export default function GamesPage() {
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<Game | null>(null)

  const loadGames = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/games')
      if (!response.ok) throw new Error('Failed to fetch games')
      const payload = await response.json()
      setGames(Array.isArray(payload) ? payload : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load games')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadGames()
  }, [loadGames])

  const handleGameCreated = (newGame: Game) => {
    setGames((prev) => [{ ...newGame, characterCount: 0 }, ...prev])
  }

  const handleKeyRevoked = (updatedGame: Game) => {
    setGames((prev) =>
      prev.map((g) => (g.id === updatedGame.id ? { ...g, apiKey: updatedGame.apiKey } : g))
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <TopNav />

      <main className="p-8 max-w-7xl mx-auto">
        <div className="mb-12 flex items-center justify-between">
          <div>
            <h1 className="gradient-text gradient-cyan-magenta text-4xl font-bold mb-2">
              MY GAMES
            </h1>
            <p className="text-cyan-400 text-sm uppercase font-bold">
              Select a game to manage assigned agents
            </p>
          </div>

          <RetroButton
            variant="green"
            size="md"
            onClick={() => setShowCreate(true)}
          >
            + CREATE NEW
          </RetroButton>
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
            <p className="text-gray-400 font-mono mb-6">
              Create a game to get an API key and assign agents.
            </p>
            <RetroButton variant="yellow" size="lg" onClick={() => setShowCreate(true)}>
              CREATE YOUR FIRST GAME
            </RetroButton>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {games.map((game) => (
              <div
                key={game.id}
                className="border-4 border-cyan-500 bg-black hover:border-magenta-500 transition-all group relative"
              >
                {/* Key revoke button — top right corner */}
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setRevokeTarget(game)
                  }}
                  title="Revoke & regenerate API key"
                  className="absolute top-3 right-3 z-10 p-2 border-2 border-gray-700 hover:border-red-500 text-gray-500 hover:text-red-400 transition-all bg-black"
                >
                  <KeyIcon className="w-4 h-4" />
                </button>

                {/* Clickable card area */}
                <Link href={`/games/${game.id}`} className="block p-6">
                  <h3 className="text-xl font-bold text-white uppercase mb-2 pr-8">
                    {game.name}
                  </h3>
                  <p className="text-sm text-cyan-300 font-bold mb-1">
                    {game.characterCount}{' '}
                    {game.characterCount === 1 ? 'CHARACTER' : 'CHARACTERS'}
                  </p>
                  <p className="text-xs text-gray-400 font-mono mb-4">
                    {new Date(game.createdAt).toLocaleDateString()}
                  </p>

                  <div className="border-t-2 border-cyan-500 pt-4 mt-4">
                    <RetroButton variant="cyan" size="md" className="w-full text-xs">
                      VIEW CHARACTERS
                    </RetroButton>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Game Modal */}
      {showCreate && (
        <CreateGameModal
          onClose={() => setShowCreate(false)}
          onCreated={handleGameCreated}
        />
      )}

      {/* Revoke API Key Modal */}
      {revokeTarget && (
        <RevokeModal
          game={revokeTarget}
          onClose={() => setRevokeTarget(null)}
          onRevoked={(updated) => {
            handleKeyRevoked(updated)
          }}
        />
      )}
    </div>
  )
}