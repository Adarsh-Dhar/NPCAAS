'use client'

import { useEffect, useMemo, useState } from 'react'
import RetroButton from '@/components/ui/RetroButton'

interface GameOption {
  id: string
  name: string
}

interface AssignmentModalProps {
  open: boolean
  characterId: string | null
  initialSelectedGameId?: string
  onClose: () => void
  onFinished: () => void
}

export default function AssignmentModal({
  open,
  characterId,
  initialSelectedGameId,
  onClose,
  onFinished,
}: AssignmentModalProps) {
  const [games, setGames] = useState<GameOption[]>([])
  const [selectedGameIds, setSelectedGameIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) {
      return
    }

    let cancelled = false

    const loadGames = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await fetch('/api/games')
        if (!response.ok) {
          throw new Error('Failed to load games')
        }
        const payload = await response.json()
        const nextGames = Array.isArray(payload)
          ? payload
              .filter((item): item is { id: string; name: string } =>
                Boolean(item) &&
                typeof item === 'object' &&
                typeof (item as { id?: unknown }).id === 'string' &&
                typeof (item as { name?: unknown }).name === 'string'
              )
              .map((item) => ({ id: item.id, name: item.name }))
          : []

        if (cancelled) {
          return
        }

        setGames(nextGames)

        if (initialSelectedGameId && nextGames.some((game) => game.id === initialSelectedGameId)) {
          setSelectedGameIds([initialSelectedGameId])
        } else {
          setSelectedGameIds([])
        }
      } catch (loadError) {
        if (!cancelled) {
          const message =
            loadError instanceof Error ? loadError.message : 'Failed to load games'
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
  }, [open, initialSelectedGameId])

  const canAssign = useMemo(
    () => Boolean(characterId) && selectedGameIds.length > 0 && !assigning,
    [characterId, selectedGameIds, assigning]
  )

  const toggleSelection = (gameId: string) => {
    setSelectedGameIds((prev) =>
      prev.includes(gameId) ? prev.filter((id) => id !== gameId) : [...prev, gameId]
    )
  }

  const handleAssign = async () => {
    if (!characterId || selectedGameIds.length === 0) {
      return
    }

    setAssigning(true)
    setError('')

    try {
      await Promise.all(
        selectedGameIds.map(async (gameId) => {
          const response = await fetch(`/api/games/${encodeURIComponent(gameId)}/characters`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ characterId }),
          })

          if (!response.ok) {
            const payload = await response.json().catch(() => ({}))
            const message =
              typeof payload.error === 'string' && payload.error.trim()
                ? payload.error
                : 'Failed to assign character to game'
            throw new Error(message)
          }
        })
      )

      onFinished()
    } catch (assignError) {
      const message =
        assignError instanceof Error ? assignError.message : 'Failed to assign character'
      setError(message)
    } finally {
      setAssigning(false)
    }
  }

  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/75 flex items-center justify-center p-4">
      <div className="w-full max-w-xl border-4 border-cyan-400 bg-black p-6">
        <h2 className="text-2xl font-bold text-white mb-2">Agent Deployed! Where should they go?</h2>
        <p className="text-cyan-300 text-xs uppercase mb-4">
          Select one or more games to assign this agent.
        </p>

        {loading ? (
          <p className="text-cyan-400 font-mono text-sm">Loading games...</p>
        ) : games.length === 0 ? (
          <p className="text-yellow-300 text-sm">
            No games found yet. You can finish now and assign later from a game page.
          </p>
        ) : (
          <div className="max-h-60 overflow-y-auto border-2 border-cyan-500 p-3 space-y-2">
            {games.map((game) => (
              <label
                key={game.id}
                className="flex items-center justify-between gap-3 border border-cyan-500/40 px-3 py-2 cursor-pointer"
              >
                <span className="text-white text-sm font-bold uppercase">{game.name}</span>
                <input
                  type="checkbox"
                  checked={selectedGameIds.includes(game.id)}
                  onChange={() => toggleSelection(game.id)}
                  className="w-4 h-4 accent-cyan-400"
                />
              </label>
            ))}
          </div>
        )}

        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

        <div className="mt-5 flex items-center justify-end gap-3">
          <RetroButton variant="magenta" size="sm" onClick={onClose}>
            CLOSE
          </RetroButton>
          <RetroButton
            variant="green"
            size="sm"
            onClick={handleAssign}
            disabled={!canAssign}
          >
            {assigning ? 'ASSIGNING...' : 'ASSIGN & FINISH'}
          </RetroButton>
        </div>
      </div>
    </div>
  )
}
