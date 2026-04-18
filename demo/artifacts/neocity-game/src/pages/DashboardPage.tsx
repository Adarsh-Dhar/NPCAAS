import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Activity, Wallet, Gauge, Lock, Unlock } from 'lucide-react'
import { getClient } from '@/lib/sdk'
import { emitPlayerEvent, setEscrowFunded as setEscrowFundedEvent, setPlayerInventory } from '@/lib/playerState'
import {
  formatNpcDisplayName,
  PROTOCOL_BABEL_NODE_NAMES,
  toCanonicalNpcName,
} from '@/lib/protocolBabel'
import { usePlayerState } from '@/context/PlayerStateContext'
import { PRIMARY_TOKEN_SYMBOL } from '@/lib/token-config'

type CharacterSnapshot = {
  id: string
  name: string
}

type WalletBalancePayload = {
  npcId: string
  npcName: string
  walletAddress: string
  native: { symbol: string; balance: string; balanceFormatted: string }
  tokens: Array<{ address: string; name: string; symbol: string; balanceFormatted: string }>
  fetchedAt: string
}

type LogPayload = {
  npcId: string
  npcName: string
  totalLogs: number
  returnedLogs: number
  logs: Array<{ id: string; type: string; timestamp: string; summary: string; details?: Record<string, unknown> }>
}

type DashboardErrorState = {
  wallet?: string
  logs?: string
}

interface DashboardPageProps {
  characters?: CharacterSnapshot[]
  onClose?: () => void
}

const ESCROW_THRESHOLD = 1

function isHexAddress(value: unknown): value is string {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value)
}

function parseAmount(value: string) {
  const parsed = Number.parseFloat(value || '0')
  return Number.isFinite(parsed) ? parsed : 0
}

function toErrorText(error: unknown) {
  if (error instanceof Error && error.message) return error.message
  if (error && typeof error === 'object') {
    const payload = error as Record<string, unknown>
    const message = typeof payload.message === 'string' ? payload.message : null
    if (message) return message
  }
  return 'request failed'
}

export default function DashboardPage({ characters = [], onClose }: DashboardPageProps) {
  const [balances, setBalances] = useState<Record<string, WalletBalancePayload | null>>({})
  const [logs, setLogs] = useState<Record<string, LogPayload | null>>({})
  const [errors, setErrors] = useState<Record<string, DashboardErrorState>>({})
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)
  const [fundingEscrow, setFundingEscrow] = useState(false)
  const [fundEscrowMessage, setFundEscrowMessage] = useState<string | null>(null)
  const lastEscrowStateRef = useRef<boolean | null>(null)
  const lastAegisDownRef = useRef<boolean | null>(null)
  const lastTradeStateRef = useRef<boolean | null>(null)
  const { credits, escrowFunded, escrowCost, canFundEscrow, fundEscrow, markEscrowFunded } = usePlayerState()

  const activeNames = useMemo(() => {
    const discovered = characters.map((character) => toCanonicalNpcName(character.name))
    return discovered.length ? discovered : [...PROTOCOL_BABEL_NODE_NAMES]
  }, [characters])

  const dispatchFirewallCracked = useCallback(() => {
    emitPlayerEvent('FIREWALL_CRACKED')
    window.dispatchEvent(new CustomEvent('FIREWALL_CRACKED'))
  }, [])

  const handleFundEscrow = useCallback(async () => {
    if (fundingEscrow) return

    if (escrowFunded) {
      setFundEscrowMessage('Escrow already funded.')
      return
    }

    if (!canFundEscrow) {
      setFundEscrowMessage(`Need ${escrowCost} ${PRIMARY_TOKEN_SYMBOL} to fund escrow.`)
      return
    }

    if (!window.ethereum) {
      setFundEscrowMessage('No wallet detected. Connect a wallet to fund escrow.')
      return
    }

    const client = getClient()
    if (!client) {
      setFundEscrowMessage('GuildCraft client unavailable.')
      return
    }

    setFundingEscrow(true)
    setFundEscrowMessage(null)

    try {
      let recipient = balances['Node_Alpha']?.walletAddress
      if (!isHexAddress(recipient)) {
        const alphaBalance = (await client.getWalletBalances('Node_Alpha')) as WalletBalancePayload
        recipient = alphaBalance?.walletAddress
      }

      if (!isHexAddress(recipient)) {
        throw new Error('Node-Alpha wallet unavailable. Wait for balances to sync and retry.')
      }

      await window.ethereum.request({ method: 'eth_requestAccounts' })
      const accounts = await window.ethereum.request({ method: 'eth_accounts' })
      const from = Array.isArray(accounts) ? accounts.find((entry) => isHexAddress(entry)) : undefined
      if (!from) {
        throw new Error('Wallet account unavailable. Unlock wallet and retry.')
      }

      const chainId = await window.ethereum.request({ method: 'eth_chainId' })
      if (typeof chainId === 'string' && chainId.toLowerCase() !== '0x940') {
        throw new Error('Wallet is on the wrong network. Switch to KITE_USD Testnet (2368) and retry.')
      }

      const valueHex = `0x${(BigInt(escrowCost) * 10n ** 18n).toString(16)}`
      const txHashResponse = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [
          {
            from,
            to: recipient,
            value: valueHex,
            data: '0x',
          },
        ],
      })
      const txHash = typeof txHashResponse === 'string' ? txHashResponse : undefined

      await client.triggerNpcEvent('Node_Alpha', {
        event: 'ESCROW_FUNDED',
        asset: 'Compute Escrow',
        data: {
          amount: escrowCost,
          currency: PRIMARY_TOKEN_SYMBOL,
          source: 'player_dashboard',
          txHash,
          payer: from,
          recipient,
        },
      })

      const funded = fundEscrow()
      if (!funded) {
        throw new Error(`Need ${escrowCost} credits to fund escrow.`)
      }

      lastEscrowStateRef.current = true
      markEscrowFunded(true)
      setEscrowFundedEvent(true)
      dispatchFirewallCracked()
      setFundEscrowMessage(
        txHash
          ? `Escrow funded on-chain. Tx: ${txHash}`
          : 'Escrow funded on-chain. Node-Alpha trigger accepted.'
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Escrow funding failed.'
      setFundEscrowMessage(message)
    } finally {
      setFundingEscrow(false)
    }
  }, [
    canFundEscrow,
    dispatchFirewallCracked,
    balances,
    escrowCost,
    escrowFunded,
    fundEscrow,
    fundingEscrow,
    markEscrowFunded,
  ])

  useEffect(() => {
    const client = getClient()
    if (!client) return

    let cancelled = false

    const poll = async () => {
      try {
        const nextBalances: Record<string, WalletBalancePayload | null> = {}
        const nextLogs: Record<string, LogPayload | null> = {}
        const nextErrors: Record<string, DashboardErrorState> = {}

        await Promise.all(
          activeNames.map(async (npcName) => {
            try {
              const balanceResponse = (await client.getWalletBalances(npcName)) as WalletBalancePayload
              nextBalances[npcName] = balanceResponse
            } catch (error) {
              nextBalances[npcName] = null
              nextErrors[npcName] = {
                ...(nextErrors[npcName] ?? {}),
                wallet: toErrorText(error),
              }
            }

            try {
              const logResponse = (await client.getNpcLogs(npcName, { limit: 10 })) as LogPayload
              nextLogs[npcName] = logResponse
            } catch (error) {
              nextLogs[npcName] = null
              nextErrors[npcName] = {
                ...(nextErrors[npcName] ?? {}),
                logs: toErrorText(error),
              }
            }
          })
        )

        if (cancelled) return

        setBalances(nextBalances)
        setLogs(nextLogs)
        setErrors(nextErrors)
        setLastUpdatedAt(new Date().toISOString())

        const alpha = nextBalances['Node_Alpha'] ?? null
        const omega = nextBalances['Node_Omega'] ?? null
        const aBalance = alpha ? parseAmount(alpha.native.balanceFormatted) : 0
        const oBalance = omega ? parseAmount(omega.native.balanceFormatted) : 0
        const escrowFundedByBalances = aBalance >= ESCROW_THRESHOLD && oBalance >= ESCROW_THRESHOLD
        const previousEscrowState = lastEscrowStateRef.current
        if (escrowFundedByBalances && previousEscrowState !== true) {
          lastEscrowStateRef.current = true
          markEscrowFunded(true)
          setEscrowFundedEvent(true)
          dispatchFirewallCracked()
        }

        const aegi = nextBalances['Aegis_Prime'] ?? null
        const aegiBalance = aegi ? parseAmount(aegi.native.balanceFormatted) : 0
        const aegisDown = aegiBalance <= 0
        if (lastAegisDownRef.current !== aegisDown) {
          lastAegisDownRef.current = aegisDown
          if (aegisDown) {
            emitPlayerEvent('BANKRUPTCY')
          }
        }

        const tradeDetected = activeNames.some((npcName) => {
          const npcLogs = nextLogs[npcName]?.logs ?? []
          return npcLogs.some((entry) => /trade|transaction|transfer|queued/i.test(entry.summary))
        })
        if (lastTradeStateRef.current !== tradeDetected) {
          lastTradeStateRef.current = tradeDetected
          if (tradeDetected) {
            emitPlayerEvent('TRADE_ACCEPTED')
          }
        }

        setPlayerInventory([
          { name: 'Raw Data', quantity: Math.max(0, Math.round(aBalance)) },
          { name: 'Root Key Fragments', quantity: Math.max(0, Math.round(oBalance)) },
        ])
      } catch {
        // Keep dashboard resilient during backend warmup.
      }
    }

    void poll()
    const interval = window.setInterval(() => void poll(), 10_000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [activeNames, dispatchFirewallCracked, markEscrowFunded])

  const aegiBalance = balances['Aegis_Prime'] ?? null
  const systemHealthy = !aegiBalance || parseAmount(aegiBalance.native.balanceFormatted) > 0

  return (
    <div className="absolute inset-0 z-30 bg-black/90 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,255,204,0.12),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(255,0,102,0.12),transparent_28%)]" />
      <div className="relative flex h-full flex-col gap-4 p-4 font-mono">
        <div className="flex items-center justify-between border-b border-cyan-500/30 pb-3">
          <div>
            <div className="flex items-center gap-2 text-cyan-300 text-xs tracking-[0.35em] uppercase">
              <Activity size={14} />
              Macro Dashboard
            </div>
            <h2 className="mt-1 text-2xl font-bold text-white">Protocol Babel Monitor</h2>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="rounded border border-white/10 bg-white/5 px-2 py-1 text-white/70">
              Updated {lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString() : '...'}
            </span>
            <button
              className="rounded border border-cyan-400/40 px-3 py-1 text-cyan-200 hover:bg-cyan-400/10"
              onClick={onClose}
            >
              Return to Game
            </button>
          </div>
        </div>

        <div className="grid flex-1 gap-4 lg:grid-cols-[1.2fr_1fr_0.8fr]">
          <section className="rounded border border-cyan-400/30 bg-cyan-950/20 p-4">
            <div className="mb-4 flex items-center gap-2 text-cyan-300 text-sm uppercase tracking-[0.2em]">
              <Wallet size={14} />
              Macro Liquidity
            </div>
            <div className="space-y-3">
              {activeNames.map((npcName) => {
                const row = balances[npcName]
                const balance = row ? row.native.balanceFormatted : '—'
                const walletError = errors[npcName]?.wallet
                return (
                  <div key={npcName} className="rounded border border-white/10 bg-black/40 p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white">{formatNpcDisplayName(npcName)}</span>
                      <span className="text-cyan-300">{balance} {PRIMARY_TOKEN_SYMBOL}</span>
                    </div>
                    <div className="mt-2 text-[11px] text-white/45 break-all">
                      {row?.walletAddress ?? 'wallet unavailable'}
                    </div>
                    {!row && walletError ? (
                      <div className="mt-2 text-[10px] text-red-300 break-all">wallet error: {walletError}</div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </section>

          <section className="rounded border border-fuchsia-400/30 bg-fuchsia-950/15 p-4">
            <div className="mb-4 flex items-center gap-2 text-fuchsia-300 text-sm uppercase tracking-[0.2em]">
              <Gauge size={14} />
              Active Contracts
            </div>
            <div className="space-y-3 max-h-[calc(100vh-10rem)] overflow-y-auto pr-1">
              {activeNames.map((npcName) => {
                const rows = logs[npcName]?.logs ?? []
                const logsError = errors[npcName]?.logs
                return (
                  <div key={npcName} className="rounded border border-white/10 bg-black/40 p-3">
                    <div className="mb-2 text-sm text-white">{formatNpcDisplayName(npcName)}</div>
                    <div className="space-y-2">
                      {rows.length === 0 ? (
                        <>
                          <p className="text-xs text-white/40">Waiting for backend logs...</p>
                          {logsError ? (
                            <p className="text-[10px] text-red-300 break-all">logs error: {logsError}</p>
                          ) : null}
                        </>
                      ) : rows.slice(0, 3).map((log) => (
                        <div key={log.id} className="text-[11px] leading-snug text-white/70">
                          <span className="mr-2 inline-block rounded bg-white/10 px-1.5 py-0.5 uppercase text-[9px] text-white/80">
                            {log.type}
                          </span>
                          {log.summary}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="rounded border border-yellow-400/30 bg-yellow-950/20 p-4">
            <div className="mb-4 flex items-center gap-2 text-yellow-300 text-sm uppercase tracking-[0.2em]">
              <Lock size={14} />
              System Health
            </div>
            <div className={`rounded border p-4 ${systemHealthy ? 'border-emerald-400/30 bg-emerald-950/20' : 'border-red-400/40 bg-red-950/20'}`}>
              <div className="flex items-center gap-2 text-sm font-bold">
                {systemHealthy ? <Unlock size={14} /> : <AlertTriangle size={14} />}
                {systemHealthy ? 'Online' : 'Aegis-Prime depleted'}
              </div>
              <p className="mt-3 text-xs text-white/70">
                Firewall unlock is tied to the Node-Alpha and Node-Omega escrow state. When both balances clear the threshold, the scene emits FIREWALL_CRACKED.
              </p>
            </div>

            <div className="mt-4 rounded border border-cyan-400/30 bg-cyan-950/20 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/70">Player Credits</span>
                <span className="font-semibold text-cyan-200">{credits.toLocaleString()} {PRIMARY_TOKEN_SYMBOL}</span>
              </div>
              <div className="mt-1 text-[11px] text-white/60">
                Escrow: {escrowFunded ? 'Funded' : 'Unfunded'}
              </div>
              <button
                className="mt-3 w-full rounded border px-3 py-2 text-xs font-semibold tracking-wide transition disabled:cursor-not-allowed"
                disabled={fundingEscrow || escrowFunded || !canFundEscrow}
                onClick={() => void handleFundEscrow()}
              >
                {escrowFunded
                  ? 'Escrow Funded'
                  : fundingEscrow
                    ? 'Funding Escrow...'
                    : `Fund Escrow (${escrowCost.toLocaleString()} ${PRIMARY_TOKEN_SYMBOL})`}
              </button>
              {fundEscrowMessage && (
                <p className="mt-2 text-[11px] text-cyan-200/90">{fundEscrowMessage}</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}