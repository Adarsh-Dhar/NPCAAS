'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, TrendingDown, Zap } from 'lucide-react'

interface ComputeBalance {
  computeLimitTokens: number
  computeUsageTokens: number
  remainingTokens: number
  kiteUsdWalletBalance: string
  estimatedComputePurchaseable: number
}

interface Props {
  characterId: string
  npcName: string
  onBalanceUpdated?: (balance: ComputeBalance) => void
}

export function ComputeBalance({ characterId, npcName, onBalanceUpdated }: Props) {
  const [balance, setBalance] = useState<ComputeBalance | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchBalance = async () => {
    try {
      setError(null)
      const res = await fetch(`/api/npcs/${encodeURIComponent(npcName)}/compute/balance-sheet`)
      
      if (!res.ok) {
        throw new Error('Failed to fetch balance')
      }

      const data = await res.json()
      if (data.success && data.currentBalance) {
        setBalance(data.currentBalance)
        setLastUpdated(new Date())
        onBalanceUpdated?.(data.currentBalance)
      } else {
        throw new Error(data.error || 'Unknown error')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch balance')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBalance()
    // Poll every 30 seconds
    const interval = setInterval(fetchBalance, 30000)
    return () => clearInterval(interval)
  }, [npcName])

  if (loading && !balance) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
        <div className="space-y-2">
          <div className="h-3 bg-gray-200 rounded w-1/3"></div>
          <div className="h-3 bg-gray-200 rounded w-1/3"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-red-900">Error loading balance</p>
          <p className="text-sm text-red-700 mt-1">{error}</p>
          <button
            onClick={fetchBalance}
            className="text-sm text-red-700 underline hover:text-red-900 mt-2"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (!balance) {
    return null
  }

  const percentageUsed = balance.computeLimitTokens > 0 
    ? Math.round((balance.computeUsageTokens / balance.computeLimitTokens) * 100)
    : 0

  const isLowBalance = balance.remainingTokens < 500
  const isOutOfTokens = balance.remainingTokens <= 0

  return (
    <div className="space-y-4">
      {/* Main Balance Card */}
      <div className={`border rounded-lg p-4 ${isOutOfTokens ? 'bg-red-50 border-red-200' : isLowBalance ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className={`w-5 h-5 ${isOutOfTokens ? 'text-red-600' : isLowBalance ? 'text-amber-600' : 'text-blue-600'}`} />
            <h3 className={`font-semibold ${isOutOfTokens ? 'text-red-900' : isLowBalance ? 'text-amber-900' : 'text-blue-900'}`}>
              Compute Budget
            </h3>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
            isOutOfTokens ? 'bg-red-200 text-red-800' : 
            isLowBalance ? 'bg-amber-200 text-amber-800' : 
            'bg-blue-200 text-blue-800'
          }`}>
            {percentageUsed}% used
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-2 mb-4 overflow-hidden">
          <div
            className={`h-full transition-all ${
              isOutOfTokens ? 'bg-red-600' : isLowBalance ? 'bg-amber-500' : 'bg-blue-600'
            }`}
            style={{ width: `${percentageUsed}%` }}
          ></div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-white bg-opacity-50 rounded p-2">
            <p className="text-xs text-gray-600 mb-1">Remaining Tokens</p>
            <p className="text-lg font-bold text-gray-900">
              {balance.remainingTokens.toLocaleString()}
            </p>
          </div>
          <div className="bg-white bg-opacity-50 rounded p-2">
            <p className="text-xs text-gray-600 mb-1">Total Limit</p>
            <p className="text-lg font-bold text-gray-900">
              {balance.computeLimitTokens.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Wallet Info */}
        <div className="bg-white bg-opacity-50 rounded p-2">
          <p className="text-xs text-gray-600 mb-1">Wallet Balance / Purchaseable</p>
          <p className="text-sm font-semibold text-gray-900">
            {parseFloat(balance.kiteUsdWalletBalance).toFixed(2)} KITE_USD / 
            <span className="text-blue-600"> {balance.estimatedComputePurchaseable.toLocaleString()} tokens</span>
          </p>
        </div>
      </div>

      {/* Status Messages */}
      {isOutOfTokens && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">
            <strong>Out of compute tokens!</strong> Recharge to continue conversations.
          </p>
        </div>
      )}

      {isLowBalance && !isOutOfTokens && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
          <TrendingDown className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700">
            <strong>Low balance.</strong> Consider recharging soon.
          </p>
        </div>
      )}

      {/* Last Updated */}
      {lastUpdated && (
        <p className="text-xs text-gray-500 text-right">
          Updated {lastUpdated.toLocaleTimeString()}
        </p>
      )}
    </div>
  )
}
