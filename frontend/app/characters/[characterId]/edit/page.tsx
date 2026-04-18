'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ethers } from 'ethers'
import TopNav from '@/components/TopNav'
import LeftPanel from '@/components/creator/LeftPanel'
import ConfigurationForm from '@/components/creator/ConfigurationForm'
import FundWalletModal from '@/components/FundWalletModal'
import RetroButton from '@/components/ui/RetroButton'
import { PRIMARY_TOKEN_ADDRESS, PRIMARY_TOKEN_SYMBOL } from '@/lib/token-config'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

interface CharacterRecord {
  id: string
  name: string
  walletAddress: string
  projectIds?: string[]
  config: Record<string, unknown>
}

interface GameCharacterOption {
  id: string
  name: string
  walletAddress: string
}

interface GameCharactersResponse {
  game: {
    id: string
    name: string
  }
  characters: GameCharacterOption[]
}

const KITE_RPC = 'https://rpc-testnet.gokite.ai'
const ERC20_BALANCE_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
]

interface CharacterLookupResponse {
  character: CharacterRecord
}

interface FormConfigSnapshot {
  baseCapital?: string
  capital?: string
  pricingAlgorithm?: string
  marginPercentage?: string
  systemPrompt?: string
  openness?: number
  factions?: string
  hostility?: string
  canTrade?: boolean
  canMove?: boolean
  canCraft?: boolean
  interGameTransactionsEnabled?: boolean
  teeExecution?: string
  computeBudget?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return undefined
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeInitialConfig(config?: Record<string, unknown> | null): FormConfigSnapshot | undefined {
  if (!isRecord(config)) return undefined

  const snapshot = isRecord(config.configSnapshot) ? config.configSnapshot : null
  const isAdaptationShape =
    Boolean(snapshot) ||
    'specializationActive' in config ||
    'turnCount' in config ||
    'preferences' in config ||
    'lastUpdatedAt' in config ||
    'summary' in config

  return {
    baseCapital: asString(config.baseCapital ?? config.capital),
    capital: asString(config.capital),
    pricingAlgorithm: asString(config.pricingAlgorithm),
    marginPercentage: asString(config.marginPercentage),
    systemPrompt:
      asString(config.systemPrompt) ??
      (isAdaptationShape ? asString(snapshot?.systemPrompt) : undefined),
    openness:
      asNumber(config.openness) ??
      (isAdaptationShape ? asNumber(snapshot?.openness) : undefined),
    factions: asString(config.factions),
    hostility: asString(config.hostility),
    canTrade: asBoolean(config.canTrade),
    canMove: asBoolean(config.canMove),
    canCraft: asBoolean(config.canCraft),
    interGameTransactionsEnabled: asBoolean(config.interGameTransactionsEnabled),
    teeExecution: asString(config.teeExecution),
    computeBudget: asString(config.computeBudget),
  }
}

export default function EditCharacterPage() {
  const params = useParams()
  const characterId = String(params.characterId)

  const [character, setCharacter] = useState<CharacterRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showFundModal, setShowFundModal] = useState(false)
  const [kiteBalance, setKiteBalance] = useState<string | null>(null)
  const [erc20Balance, setErc20Balance] = useState<string | null>(null)
  const [erc20Symbol, setErc20Symbol] = useState('TOKEN')
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [transferTargets, setTransferTargets] = useState<GameCharacterOption[]>([])
  const [targetCharacterId, setTargetCharacterId] = useState('')
  const [transferAmount, setTransferAmount] = useState('0.01')
  const [transferLoading, setTransferLoading] = useState(false)
  const [transferError, setTransferError] = useState('')
  const [transferSuccess, setTransferSuccess] = useState('')

  useEffect(() => {
    let cancelled = false

    const loadCharacter = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await fetch(`/api/characters/${encodeURIComponent(characterId)}`)
        if (!response.ok) throw new Error('Failed to load character')
        const payload = (await response.json()) as CharacterLookupResponse
        if (!cancelled) setCharacter(payload.character)
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load character')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    if (characterId) loadCharacter()
    return () => { cancelled = true }
  }, [characterId])

  useEffect(() => {
    let cancelled = false

    const loadBalance = async () => {
      if (!character?.walletAddress) {
        setKiteBalance(null)
        setErc20Balance(null)
        return
      }

      setBalanceLoading(true)
      try {
        const provider = new ethers.JsonRpcProvider(KITE_RPC)
        const tokenContract = new ethers.Contract(PRIMARY_TOKEN_ADDRESS, ERC20_BALANCE_ABI, provider)
        const [rawBalance, tokenRawBalance, tokenDecimals, tokenSymbol] = await Promise.all([
          provider.getBalance(character.walletAddress),
          tokenContract.balanceOf(character.walletAddress).catch(() => BigInt(0)),
          tokenContract.decimals().catch(() => 18),
          tokenContract.symbol().catch(() => 'TOKEN'),
        ])

        if (!cancelled) {
          setKiteBalance(ethers.formatEther(rawBalance))
          setErc20Balance(ethers.formatUnits(tokenRawBalance, Number(tokenDecimals)))
          setErc20Symbol(typeof tokenSymbol === 'string' ? tokenSymbol : 'TOKEN')
        }
      } catch {
        if (!cancelled) {
          setKiteBalance(null)
          setErc20Balance(null)
        }
      } finally {
        if (!cancelled) {
          setBalanceLoading(false)
        }
      }
    }

    void loadBalance()

    return () => {
      cancelled = true
    }
  }, [character?.walletAddress])

  useEffect(() => {
    let cancelled = false

    const loadTransferTargets = async () => {
      const gameId = character?.projectIds?.[0]
      if (!gameId || !character?.id) {
        setTransferTargets([])
        setTargetCharacterId('')
        return
      }

      try {
        const response = await fetch(`/api/games/${encodeURIComponent(gameId)}/characters`)
        if (!response.ok) {
          throw new Error('Failed to load transfer targets')
        }

        const payload = (await response.json()) as GameCharactersResponse
        const options = (Array.isArray(payload.characters) ? payload.characters : []).filter(
          (candidate) => candidate.id !== character.id
        )

        if (!cancelled) {
          setTransferTargets(options)
          setTargetCharacterId((current) => {
            if (current && options.some((option) => option.id === current)) return current
            return options[0]?.id ?? ''
          })
        }
      } catch {
        if (!cancelled) {
          setTransferTargets([])
          setTargetCharacterId('')
        }
      }
    }

    void loadTransferTargets()

    return () => {
      cancelled = true
    }
  }, [character?.id, character?.projectIds])

  const submitBotToBotTransfer = async () => {
    if (!character) return

    const target = transferTargets.find((option) => option.id === targetCharacterId)
    if (!target) {
      setTransferError('Select a target character first.')
      setTransferSuccess('')
      return
    }

    const parsed = Number(transferAmount)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setTransferError('Enter a transfer amount greater than 0.')
      setTransferSuccess('')
      return
    }

    setTransferLoading(true)
    setTransferError('')
    setTransferSuccess('')

    try {
      const valueWei = ethers.parseEther(parsed.toString()).toString()
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          characterId: character.id,
          transferMode: 'bot_to_bot',
          transaction: {
            to: target.walletAddress,
            value: valueWei,
            data: '0x',
            tokenAddress: PRIMARY_TOKEN_ADDRESS,
            amount: transferAmount,
          },
        }),
      })

      const payload = (await response.json().catch(() => ({}))) as {
        txHash?: string
        error?: string
        details?: string
        hint?: string
        newWalletAddress?: string
      }

      if (!response.ok) {
        if (response.status === 409 && payload.newWalletAddress) {
          const refreshed = await fetch(`/api/characters/${encodeURIComponent(character.id)}`)
          if (refreshed.ok) {
            const refreshedPayload = (await refreshed.json()) as CharacterLookupResponse
            setCharacter(refreshedPayload.character)
          }
        }

        const errorMessage = payload.error ?? 'Transfer failed'
        const detailLine = payload.details ? `\n${payload.details}` : ''
        const hintLine = payload.hint ? `\nHint: ${payload.hint}` : ''
        throw new Error(`${errorMessage}${detailLine}${hintLine}`)
      }

      setTransferSuccess(
        payload.txHash
          ? `x402 transfer sent. Tx hash: ${payload.txHash}`
          : 'x402 transfer submitted.'
      )
    } catch (transferRequestError) {
      const message =
        transferRequestError instanceof Error ? transferRequestError.message : 'Transfer failed'
      setTransferError(message)
    } finally {
      setTransferLoading(false)
    }
  }

  return (
    <main className="bg-black min-h-screen flex flex-col text-white">
      <TopNav />

      <div className="px-8 pt-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/games">Games</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/characters">Characters</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{character?.name ?? 'Edit'}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="flex flex-1 overflow-hidden mt-4">
        <div className="w-1/3 min-h-screen">
          <LeftPanel characterId={characterId} />
        </div>

        <div className="w-2/3 overflow-y-auto">
          <div className="p-8 bg-black">
            <div className="mb-8 flex items-start justify-between">
              <div>
                <h1 className="gradient-text gradient-cyan-magenta text-4xl font-bold mb-2">
                  EDIT YOUR AGENT
                </h1>
                <p className="text-cyan-400 text-sm uppercase font-bold">
                  Update configuration and save changes.
                </p>
              </div>

              {character && (
                <div className="flex flex-col items-end gap-2">
                  {/* Wallet info */}
                  <div className="border-2 border-cyan-500/40 p-3 text-right">
                    <p className="text-xs text-gray-400 uppercase font-bold mb-1">Wallet Address</p>
                    <p className="text-xs font-mono text-cyan-300 max-w-48 break-all">
                      {character.walletAddress}
                    </p>
                    <p className="mt-3 text-xs text-gray-400 uppercase font-bold mb-1">Token Balance</p>
                    <p className="text-sm font-bold text-green-300">
                      {balanceLoading ? 'Loading...' : kiteBalance ? `${kiteBalance} ${PRIMARY_TOKEN_SYMBOL}` : 'Unavailable'}
                    </p>
                    <p className="mt-2 text-xs text-gray-400 uppercase font-bold mb-1">ERC-20 Balance</p>
                    <p className="text-sm font-bold text-yellow-300">
                      {balanceLoading ? 'Loading...' : erc20Balance ? `${erc20Balance} ${erc20Symbol || PRIMARY_TOKEN_SYMBOL}` : 'Unavailable'}
                    </p>

                    <div className="mt-4 border-t border-cyan-500/30 pt-3 text-left">
                      <p className="text-xs text-gray-400 uppercase font-bold mb-2">x402 Bot-to-Bot Transfer</p>

                      <label className="block text-[11px] text-gray-400 uppercase font-bold mb-1">
                        Target Character
                      </label>
                      <select
                        value={targetCharacterId}
                        onChange={(event) => setTargetCharacterId(event.target.value)}
                        className="w-full bg-gray-900 border-2 border-cyan-500/40 text-cyan-200 text-xs font-mono px-2 py-2 mb-2"
                      >
                        {transferTargets.length === 0 ? (
                          <option value="">No available targets</option>
                        ) : (
                          transferTargets.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name}
                            </option>
                          ))
                        )}
                      </select>

                      <label className="block text-[11px] text-gray-400 uppercase font-bold mb-1">
                        Amount (PYUSD)
                      </label>
                      <input
                        type="number"
                        min="0.000000000000000001"
                        step="0.001"
                        value={transferAmount}
                        onChange={(event) => setTransferAmount(event.target.value)}
                        className="w-full bg-gray-900 border-2 border-cyan-500/40 text-cyan-200 text-xs font-mono px-2 py-2 mb-2"
                      />

                      <RetroButton
                        variant="cyan"
                        size="sm"
                        onClick={submitBotToBotTransfer}
                        disabled={transferLoading || !targetCharacterId || !transferAmount}
                        className="w-full text-xs"
                      >
                        {transferLoading ? 'SENDING X402...' : 'SEND X402 TX'}
                      </RetroButton>

                      {transferSuccess ? (
                        <p className="mt-2 text-[11px] text-green-300 font-mono break-all">{transferSuccess}</p>
                      ) : null}
                      {transferError ? (
                        <p className="mt-2 text-[11px] text-red-300 font-mono">{transferError}</p>
                      ) : null}
                    </div>
                  </div>
                  <RetroButton
                    variant="yellow"
                    size="sm"
                    onClick={() => setShowFundModal(true)}
                    className="text-xs"
                  >
                    💰 FUND WALLET
                  </RetroButton>
                </div>
              )}
            </div>

            {loading ? (
              <p className="text-cyan-400 font-mono">Loading character configuration...</p>
            ) : error || !character ? (
              <div className="border-4 border-red-500 p-4 text-red-400">{error || 'Character not found'}</div>
            ) : (
              <ConfigurationForm
                characterName={character.name}
                characterId={character.id}
                initialConfig={normalizeInitialConfig(character.config)}
              />
            )}

            <div className="mt-12" />
          </div>
        </div>
      </div>

      {showFundModal && character && (
        <FundWalletModal
          characterName={character.name}
          walletAddress={character.walletAddress}
          onClose={() => setShowFundModal(false)}
        />
      )}
    </main>
  )
}