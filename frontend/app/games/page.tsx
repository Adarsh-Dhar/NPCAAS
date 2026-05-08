'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import TopNav from '@/components/TopNav'

interface Game {
  id: string
  name: string
  apiKey: string
  characterCount: number
  createdAt: string
}

interface CreateGameModalProps {
  onClose: () => void
  onCreated: (game: Game) => void
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  backgroundColor: 'rgba(255,255,255,0.05)',
  color: '#ffffff',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 0,
  padding: '0.65rem 0.875rem',
  fontSize: '0.875rem',
  outline: 'none',
}

function CreateGameModal({ onClose, onCreated }: CreateGameModalProps) {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [createdGame, setCreatedGame] = useState<Game | null>(null)
  const [copied, setCopied] = useState(false)

  const handleCreate = async () => {
    if (!name.trim()) { setError('Game name is required'); return }
    setCreating(true); setError('')
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
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      backgroundColor: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
    }}>
      <div style={{
        width: '100%', maxWidth: '500px',
        backgroundColor: '#252220',
        border: '1px solid rgba(255,255,255,0.1)',
      }}>
        <div style={{
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          padding: '1.25rem 1.5rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span className="font-condensed" style={{
            fontSize: '0.8rem', fontWeight: 700,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: '#ffffff',
          }}>
            {createdGame ? '✓ Game Created' : 'Create New Game'}
          </span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none',
            color: 'rgba(255,255,255,0.4)', cursor: 'pointer',
            fontSize: '1.1rem', lineHeight: 1,
          }}>✕</button>
        </div>

        <div style={{ padding: '1.5rem' }}>
          {!createdGame ? (
            <>
              <p style={{
                fontSize: '0.8rem', color: 'rgba(255,255,255,0.45)',
                marginBottom: '1.25rem',
              }} className="font-body">
                Name your game to receive an API key for NPC integration.
              </p>

              <div style={{ marginBottom: '1rem' }}>
                <label className="font-condensed" style={{
                  fontSize: '0.65rem', fontWeight: 700,
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '0.375rem',
                }}>Game Name</label>
                <input
                  style={INPUT_STYLE}
                  placeholder="e.g. Dragon Quest Online"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !creating && handleCreate()}
                  disabled={creating}
                />
              </div>

              {error && (
                <p className="font-body" style={{
                  fontSize: '0.8rem', color: 'rgba(255,255,255,0.85)',
                  marginBottom: '1rem',
                }}>{error}</p>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <GcButton variant="ghost" onClick={onClose} disabled={creating}>Cancel</GcButton>
                <GcButton variant="primary" onClick={handleCreate} disabled={creating || !name.trim()}>
                  {creating ? 'Creating…' : 'Create Game'}
                </GcButton>
              </div>
            </>
          ) : (
            <>
              <p style={{
                fontSize: '0.65rem', fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                color: '#D8315B', marginBottom: '0.5rem',
              }}>
                ⚠ Save this key — it won't be shown again
              </p>
              <p style={{
                fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)',
                marginBottom: '1rem',
              }}>
                Game: <strong style={{ color: '#ffffff' }}>{createdGame.name}</strong>
              </p>
              <div style={{
                backgroundColor: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '1rem', marginBottom: '1.25rem',
                wordBreak: 'break-all',
              }}>
                <p className="font-mono" style={{
                  fontSize: '0.75rem', color: 'rgba(216,49,91,0.9)',
                }}>{createdGame.apiKey}</p>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <GcButton variant={copied ? 'primary' : 'outline'} onClick={handleCopy}>
                  {copied ? '✓ Copied' : 'Copy Key'}
                </GcButton>
                <GcButton variant="primary" onClick={onClose}>Done</GcButton>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function RevokeModal({ game, onClose, onRevoked }: { game: Game; onClose: () => void; onRevoked: (g: Game) => void }) {
  const [revoking, setRevoking] = useState(false)
  const [error, setError] = useState('')
  const [newKey, setNewKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const handleRevoke = async () => {
    setRevoking(true); setError('')
    try {
      const response = await fetch(`/api/games/${encodeURIComponent(game.id)}/regenerate-key`, { method: 'POST' })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error ?? 'Failed to regenerate API key')
      }
      const updated = await response.json()
      setNewKey(updated.apiKey)
      onRevoked({ ...game, apiKey: updated.apiKey })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setRevoking(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      backgroundColor: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
    }}>
      <div style={{
        width: '100%', maxWidth: '500px',
        backgroundColor: '#252220',
        border: '1px solid rgba(216,49,91,0.25)',
      }}>
        <div style={{
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          padding: '1.25rem 1.5rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span className="font-condensed" style={{
            fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: '#ffffff',
          }}>
            {newKey ? '✓ New Key Generated' : '⚠ Revoke API Key'}
          </span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none',
            color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '1.1rem',
          }}>✕</button>
        </div>

        <div style={{ padding: '1.5rem' }}>
          {!newKey ? (
            <>
              <p className="font-body" style={{
                fontSize: '0.875rem', color: 'rgba(255,255,255,0.6)',
                marginBottom: '1rem',
              }}>
                Game: <strong style={{ color: '#ffffff' }}>{game.name}</strong>
              </p>
              <div style={{
                backgroundColor: 'rgba(216,49,91,0.06)',
                border: '1px solid rgba(216,49,91,0.2)',
                padding: '0.875rem', marginBottom: '1.25rem',
              }}>
                <p className="font-body" style={{
                  fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6,
                }}>
                  Revoking the current key will <strong style={{ color: '#ffffff' }}>immediately break</strong> any integrations using it.
                </p>
              </div>
              {error && <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.8rem', marginBottom: '1rem' }}>{error}</p>}
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <GcButton variant="ghost" onClick={onClose} disabled={revoking}>Cancel</GcButton>
                <GcButton variant="danger" onClick={handleRevoke} disabled={revoking}>
                  {revoking ? 'Revoking…' : 'Revoke & Regenerate'}
                </GcButton>
              </div>
            </>
          ) : (
            <>
              <p style={{
                fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: '#D8315B', marginBottom: '1rem',
              }}>⚠ Old key is now invalid</p>
              <div style={{
                backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
                padding: '1rem', marginBottom: '1.25rem', wordBreak: 'break-all',
              }}>
                <p className="font-mono" style={{ fontSize: '0.75rem', color: 'rgba(216,49,91,0.9)' }}>{newKey}</p>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <GcButton variant={copied ? 'primary' : 'outline'} onClick={() => {
                  navigator.clipboard.writeText(newKey)
                  setCopied(true); setTimeout(() => setCopied(false), 2000)
                }}>{copied ? '✓ Copied' : 'Copy Key'}</GcButton>
                <GcButton variant="primary" onClick={onClose}>Done</GcButton>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// Minimal button component inline
type BtnVariant = 'primary' | 'outline' | 'ghost' | 'danger'
function GcButton({ variant = 'outline', onClick, disabled, children }: {
  variant?: BtnVariant; onClick?: () => void; disabled?: boolean; children: React.ReactNode
}) {
  const styles: Record<BtnVariant, React.CSSProperties> = {
    primary: { backgroundColor: '#D8315B', borderColor: '#D8315B', color: '#ffffff' },
    outline: { backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.8)' },
    ghost: { backgroundColor: 'transparent', borderColor: 'transparent', color: 'rgba(255,255,255,0.5)' },
    danger: { backgroundColor: 'rgba(216,49,91,0.15)', borderColor: 'rgba(216,49,91,0.5)', color: '#ffffff' },
  }
  return (
    <button onClick={onClick} disabled={disabled} className="font-condensed" style={{
      fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
      padding: '0.45rem 1rem', border: '2px solid', borderRadius: 0, cursor: 'pointer',
      transition: 'all 0.15s ease', opacity: disabled ? 0.4 : 1,
      ...styles[variant],
    }}>
      {children}
    </button>
  )
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="m21 2-9.6 9.6" />
      <path d="m15.5 7.5 3 3L22 7l-3-3" />
    </svg>
  )
}

export default function GamesPage() {
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<Game | null>(null)

  const loadGames = useCallback(async () => {
    setLoading(true); setError('')
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

  useEffect(() => { loadGames() }, [loadGames])

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#1E1B18', color: '#ffffff' }}>
      <TopNav />

      <main style={{ padding: '3rem 2rem', maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          marginBottom: '3rem', paddingBottom: '1.5rem',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          <div>
            <p className="font-condensed" style={{
              fontSize: '0.65rem', letterSpacing: '0.15em', textTransform: 'uppercase',
              color: '#D8315B', marginBottom: '0.5rem',
            }}>Management Console</p>
            <h1 className="font-display" style={{
              fontSize: 'clamp(2rem, 4vw, 3rem)',
              fontWeight: 400, letterSpacing: '-0.02em', color: '#ffffff',
            }}>Games</h1>
            <p className="font-body" style={{
              fontSize: '0.875rem', color: 'rgba(255,255,255,0.4)',
              marginTop: '0.25rem',
            }}>
              {games.length} game{games.length !== 1 ? 's' : ''} · Select to manage agents
            </p>
          </div>

            <button
            onClick={() => setShowCreate(true)}
              className="font-condensed"
            style={{
              fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', padding: '0.6rem 1.5rem',
              backgroundColor: '#D8315B', border: '2px solid #D8315B',
              color: '#ffffff', cursor: 'pointer', borderRadius: 0,
              boxShadow: '0 0 20px rgba(216,49,91,0.3)',
              transition: 'all 0.15s ease',
            }}
          >
            + New Game
          </button>
        </div>

        {loading ? (
          <div style={{
            textAlign: 'center', padding: '5rem 0',
            color: 'rgba(255,255,255,0.3)', fontSize: '0.875rem',
          }} className="font-body">
            Loading…
          </div>
        ) : error ? (
          <div style={{
            padding: '1.5rem',
            backgroundColor: 'rgba(216,49,91,0.08)',
            border: '1px solid rgba(216,49,91,0.25)',
            color: 'rgba(255,255,255,0.85)',
            fontSize: '0.875rem',
          }} className="font-body">{error}</div>
        ) : games.length === 0 ? (
          <div style={{
            border: '1px dashed rgba(255,255,255,0.1)',
            padding: '5rem 2rem', textAlign: 'center',
          }}>
            <p className="font-display" style={{
              fontSize: '1.5rem', color: 'rgba(255,255,255,0.2)',
              marginBottom: '1rem',
            }}>No games yet</p>
            <p className="font-body" style={{
              fontSize: '0.875rem', color: 'rgba(255,255,255,0.35)',
              marginBottom: '2rem',
            }}>Create a game to get an API key and start assigning agents.</p>
            <button
              onClick={() => setShowCreate(true)}
              className="font-condensed"
              style={{
                fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', padding: '0.75rem 2rem',
                backgroundColor: '#D8315B', border: '2px solid #D8315B',
                color: '#ffffff', cursor: 'pointer', borderRadius: 0,
              }}
            >
              Create First Game
            </button>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '1px',
            backgroundColor: 'rgba(255,255,255,0.06)',
          }}>
            {games.map((game) => (
              <div key={game.id} style={{
                backgroundColor: '#1E1B18', position: 'relative',
                transition: 'background-color 0.2s ease',
              }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(216,49,91,0.04)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#1E1B18')}
              >
                {/* Key button */}
                <button
                  onClick={e => { e.preventDefault(); e.stopPropagation(); setRevokeTarget(game) }}
                  title="Revoke & regenerate API key"
                  style={{
                    position: 'absolute', top: '1rem', right: '1rem', zIndex: 10,
                    padding: '0.375rem',
                    background: 'none', border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.3)', cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'rgba(216,49,91,0.4)'
                    e.currentTarget.style.color = '#ffffff'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                    e.currentTarget.style.color = 'rgba(255,255,255,0.3)'
                  }}
                >
                  <KeyIcon className="w-3.5 h-3.5" />
                </button>

                <Link href={`/games/${game.id}`} style={{ textDecoration: 'none', display: 'block', padding: '1.75rem' }}>
                  <div className="font-condensed" style={{
                    fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase',
                    color: 'rgba(216,49,91,0.7)', marginBottom: '0.5rem',
                  }}>
                    {new Date(game.createdAt).toLocaleDateString()}
                  </div>

                  <h3 className="font-display" style={{
                    fontSize: '1.35rem', fontWeight: 400,
                    color: '#ffffff', letterSpacing: '-0.01em',
                    marginBottom: '0.5rem', paddingRight: '2rem',
                  }}>
                    {game.name}
                  </h3>

                  <p className="font-condensed" style={{
                    fontSize: '0.7rem', letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.35)',
                    marginBottom: '1.5rem',
                  }}>
                    {game.characterCount} {game.characterCount === 1 ? 'agent' : 'agents'}
                  </p>

                  <div className="font-condensed" style={{
                    fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase',
                    color: 'rgba(216,49,91,0.7)',
                    display: 'flex', alignItems: 'center', gap: '0.375rem',
                  }}>
                    View Agents →
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </main>

      {showCreate && (
        <CreateGameModal
          onClose={() => setShowCreate(false)}
          onCreated={(game) => setGames(prev => [{ ...game, characterCount: 0 }, ...prev])}
        />
      )}

      {revokeTarget && (
        <RevokeModal
          game={revokeTarget}
          onClose={() => setRevokeTarget(null)}
          onRevoked={(updated) => {
            setGames(prev => prev.map(g => g.id === updated.id ? { ...g, apiKey: updated.apiKey } : g))
            setRevokeTarget(null)
          }}
        />
      )}
    </div>
  )
}