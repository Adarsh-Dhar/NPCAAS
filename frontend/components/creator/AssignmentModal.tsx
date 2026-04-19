'use client'

import { useEffect, useMemo, useState } from 'react'
import RetroButton from '@/components/ui/RetroButton'
import RetroInput from '@/components/ui/RetroInput'

interface GameOption {
  id: string
  name: string
}

interface AssignmentModalProps {
  open: boolean
  characterId: string | null
  characterName: string
  initialSelectedGameId?: string
  onClose: () => void
  onFinished: () => void
}

interface ConflictInfo {
  gameId: string
  gameName: string
}

export default function AssignmentModal({
  open,
  characterId,
  characterName,
  initialSelectedGameId,
  onClose,
  onFinished,
}: AssignmentModalProps) {
  const [games, setGames] = useState<GameOption[]>([])
  const [selectedGameIds, setSelectedGameIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [error, setError] = useState('')

  // Rename flow
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([])
  const [showRenameStep, setShowRenameStep] = useState(false)
  const [newName, setNewName] = useState(characterName)
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState('')

  useEffect(() => {
    if (!open) return

    let cancelled = false

    const loadGames = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await fetch('/api/games')
        if (!response.ok) throw new Error('Failed to load games')
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

        if (cancelled) return

        setGames(nextGames)

        if (initialSelectedGameId && nextGames.some((g) => g.id === initialSelectedGameId)) {
          setSelectedGameIds([initialSelectedGameId])
        } else {
          setSelectedGameIds([])
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load games')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadGames()
    return () => { cancelled = true }
  }, [open, initialSelectedGameId])

  // Reset rename step when modal closes
  useEffect(() => {
    if (!open) {
      setShowRenameStep(false)
      setConflicts([])
      setNewName(characterName)
      setRenameError('')
    }
  }, [open, characterName])

  const canAssign = useMemo(
    () => Boolean(characterId) && selectedGameIds.length > 0 && !assigning,
    [characterId, selectedGameIds, assigning]
  )

  const toggleSelection = (gameId: string) => {
    setSelectedGameIds((prev) =>
      prev.includes(gameId) ? prev.filter((id) => id !== gameId) : [...prev, gameId]
    )
  }

  // Check for name conflicts in selected games
  const checkForConflicts = async (): Promise<ConflictInfo[]> => {
    const foundConflicts: ConflictInfo[] = []

    await Promise.all(
      selectedGameIds.map(async (gameId) => {
        try {
          const res = await fetch(`/api/games/${encodeURIComponent(gameId)}/characters`)
          if (!res.ok) return
          const data = await res.json()
          const chars = Array.isArray(data.characters) ? data.characters : []
          const nameConflict = chars.some(
            (c: { id: string; name: string }) =>
              c.name.toLowerCase() === characterName.toLowerCase() && c.id !== characterId
          )
          if (nameConflict) {
            const game = games.find((g) => g.id === gameId)
            if (game) foundConflicts.push({ gameId, gameName: game.name })
          }
        } catch {
          // ignore individual errors
        }
      })
    )

    return foundConflicts
  }

  const doAssign = async (nameOverride?: string) => {
    if (!characterId || selectedGameIds.length === 0) return

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
      setError(assignError instanceof Error ? assignError.message : 'Failed to assign character')
    } finally {
      setAssigning(false)
    }
  }

  const handleAssign = async () => {
    if (!characterId || selectedGameIds.length === 0) return

    // Check for name conflicts first
    setAssigning(true)
    const foundConflicts = await checkForConflicts()
    setAssigning(false)

    if (foundConflicts.length > 0) {
      setConflicts(foundConflicts)
      setNewName(characterName + '_' + Math.floor(Math.random() * 100))
      setShowRenameStep(true)
      return
    }

    await doAssign()
  }

  const handleRenameAndAssign = async () => {
    if (!newName.trim() || !characterId) return

    setRenaming(true)
    setRenameError('')

    try {
      // Rename the character
      const renameRes = await fetch('/api/characters', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId,
          name: newName.trim().toUpperCase().replace(/\s+/g, '_'),
          config: {}, // will be merged server-side without overwriting
        }),
      })

      if (!renameRes.ok) {
        const payload = await renameRes.json().catch(() => ({}))
        throw new Error(payload.error ?? 'Failed to rename character')
      }

      // Then assign
      await doAssign(newName.trim())
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : 'Rename failed')
    } finally {
      setRenaming(false)
    }
  }

  if (!open) return null

  // Rename step UI
  if (showRenameStep) {
    return (
      <div className="fixed inset-0 z-[100] bg-black/75 flex items-center justify-center p-4">
        <div className="w-full max-w-xl border-4 border-blue-400 bg-black p-6">
          <h2 className="text-xl font-bold text-white mb-2">Name Conflict Detected</h2>

          <div className="border-2 border-blue-400/40 bg-blue-950/20 p-4 mb-4">
            <p className="text-blue-300 text-xs font-mono mb-2">
              A character named <span className="font-bold text-white">{characterName}</span> already
              exists in:
            </p>
            <ul className="space-y-1">
              {conflicts.map((c) => (
                <li key={c.gameId} className="text-blue-400 text-xs font-mono">
                  • {c.gameName}
                </li>
              ))}
            </ul>
            <p className="text-gray-400 text-xs mt-3">
              All settings stay the same — only the name changes for this game assignment.
            </p>
          </div>

          <RetroInput
            borderColor="blue"
            label="New Character Name"
            value={newName}
            onChange={(e) =>
              setNewName(e.target.value.toUpperCase().replace(/\s+/g, '_'))
            }
            placeholder="UNIQUE_NAME"
          />

          {renameError && (
            <p className="mt-3 text-xs text-purple-300 font-mono">{renameError}</p>
          )}

          <div className="mt-5 flex items-center justify-end gap-3">
            <RetroButton
              variant="purple"
              size="sm"
              onClick={() => {
                setShowRenameStep(false)
                setConflicts([])
              }}
              disabled={renaming}
            >
              BACK
            </RetroButton>
            <RetroButton
              variant="blue"
              size="sm"
              onClick={handleRenameAndAssign}
              disabled={!newName.trim() || renaming}
            >
              {renaming ? 'RENAMING...' : 'RENAME & ASSIGN'}
            </RetroButton>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/75 flex items-center justify-center p-4">
      <div className="w-full max-w-xl border-4 border-blue-400 bg-black p-6">
        <h2 className="text-2xl font-bold text-white mb-2">Agent Deployed! Where should they go?</h2>
        <p className="text-blue-300 text-xs uppercase mb-1">
          Select one or more games to assign this agent.
        </p>
        <p className="text-gray-500 text-xs font-mono mb-4">
          If a game already has a character with the same name, you'll be prompted to rename.
        </p>

        {loading ? (
          <p className="text-blue-400 font-mono text-sm">Loading games...</p>
        ) : games.length === 0 ? (
          <p className="text-purple-300 text-sm">
            No games found. You can finish now and assign later from a game page.
          </p>
        ) : (
          <div className="max-h-60 overflow-y-auto border-2 border-blue-500 p-3 space-y-2">
            {games.map((game) => (
              <label
                key={game.id}
                className="flex items-center justify-between gap-3 border border-blue-500/40 px-3 py-2 cursor-pointer hover:border-blue-300 transition-colors"
              >
                <span className="text-white text-sm font-bold uppercase">{game.name}</span>
                <input
                  type="checkbox"
                  checked={selectedGameIds.includes(game.id)}
                  onChange={() => toggleSelection(game.id)}
                  className="w-4 h-4 accent-blue-400"
                />
              </label>
            ))}
          </div>
        )}

        {error && <p className="mt-3 text-xs text-purple-300 font-mono">{error}</p>}

        <div className="mt-5 flex items-center justify-end gap-3">
          <RetroButton variant="purple" size="sm" onClick={onClose}>
            CLOSE
          </RetroButton>
          <RetroButton
            variant="blue"
            size="sm"
            onClick={handleAssign}
            disabled={!canAssign}
          >
            {assigning ? 'CHECKING...' : 'ASSIGN & FINISH'}
          </RetroButton>
        </div>
      </div>
    </div>
  )
}