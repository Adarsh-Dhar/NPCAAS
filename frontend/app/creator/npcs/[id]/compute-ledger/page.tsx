'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Loader, TrendingDown, TrendingUp } from 'lucide-react'
import { useParams } from 'next/navigation'

interface Transaction {
  id: string
  type: string
  timestamp: string
  kiteUsdAmount?: number
  computeTokensAwarded?: number
  tokensUsed?: number
  estUsdCost?: number
  balanceAfter: number
}

interface BalanceSheetData {
  currentBalance?: {
    computeLimitTokens: number
    computeUsageTokens: number
    remainingTokens: number
    kiteUsdWalletBalance: string
    estimatedComputePurchaseable: number
  }
  transactions?: Transaction[]
  stats?: {
    totalRechargeUsd: number
    totalRechargeTokens: number
    totalSpendTokens: number
    totalSpendUsd: string
    averageTokensPerChat: number
  }
}

export default function ComputeLedgerPage() {
  const params = useParams()
  const npcId = params.id as string
  const [data, setData] = useState<BalanceSheetData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<'all' | 'spend' | 'recharge'>('all')

  useEffect(() => {
    const fetchData = async () => {
      try {
        setError(null)
        
        // Extract NPC name from ID - assuming format is stored in a mapping
        // For now, we'll use the ID as fallback
        const res = await fetch(`/api/npcs/${encodeURIComponent(npcId)}/compute/balance-sheet`)
        
        if (!res.ok) {
          throw new Error('Failed to fetch ledger')
        }

        const result = await res.json()
        if (result.success) {
          setData(result)
        } else {
          throw new Error(result.error || 'Unknown error')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch ledger')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [npcId])

  const filteredTransactions = data?.transactions?.filter((tx) => {
    if (filterType === 'all') return true
    if (filterType === 'spend') return tx.type === 'COMPUTE_SPEND'
    if (filterType === 'recharge') return tx.type === 'COMPUTE_RECHARGE'
    return true
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-gray-600">Loading ledger...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Error Loading Ledger</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const { currentBalance, transactions, stats } = data || {}

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Compute Unit Ledger</h1>
        <p className="text-gray-600">Track all compute purchases and spending</p>
      </div>

      {/* Stats Grid */}
      {currentBalance && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">Current Balance</p>
            <p className="text-2xl font-bold text-gray-900">
              {currentBalance.remainingTokens.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              of {currentBalance.computeLimitTokens.toLocaleString()} total
            </p>
          </div>
          {stats && (
            <>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-700 mb-1">Total Recharged</p>
                <p className="text-2xl font-bold text-green-900">
                  {stats.totalRechargeTokens.toLocaleString()}
                </p>
                <p className="text-xs text-green-700 mt-1">
                  ${stats.totalRechargeUsd.toFixed(2)} USD
                </p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-700 mb-1">Total Spent</p>
                <p className="text-2xl font-bold text-red-900">
                  {stats.totalSpendTokens.toLocaleString()}
                </p>
                <p className="text-xs text-red-700 mt-1">
                  ~${parseFloat(stats.totalSpendUsd).toFixed(8)} USD
                </p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-700 mb-1">Avg per Chat</p>
                <p className="text-2xl font-bold text-blue-900">
                  {stats.averageTokensPerChat.toLocaleString()}
                </p>
                <p className="text-xs text-blue-700 mt-1">tokens per conversation</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2">
        {['all', 'recharge', 'spend'].map((filter) => (
          <button
            key={filter}
            onClick={() => setFilterType(filter as any)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filterType === filter
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {filter.charAt(0).toUpperCase() + filter.slice(1)}
          </button>
        ))}
      </div>

      {/* Transactions Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  Timestamp
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase">
                  Amount
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase">
                  Cost (USD)
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase">
                  Balance After
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions && filteredTransactions.length > 0 ? (
                filteredTransactions.map((tx) => (
                  <tr key={tx.id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        {tx.type === 'COMPUTE_RECHARGE' ? (
                          <>
                            <TrendingUp className="w-4 h-4 text-green-600" />
                            <span className="font-medium text-green-700">Recharge</span>
                          </>
                        ) : (
                          <>
                            <TrendingDown className="w-4 h-4 text-red-600" />
                            <span className="font-medium text-red-700">Spend</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600">
                      {new Date(tx.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-3 text-sm text-right font-medium">
                      {tx.type === 'COMPUTE_RECHARGE'
                        ? `+${tx.computeTokensAwarded?.toLocaleString()}`
                        : `-${tx.tokensUsed?.toLocaleString()}`}
                      {' '}
                      <span className="text-gray-500 text-xs">tokens</span>
                    </td>
                    <td className="px-6 py-3 text-sm text-right font-medium">
                      {tx.type === 'COMPUTE_RECHARGE'
                        ? `$${tx.kiteUsdAmount?.toFixed(2)}`
                        : `~$${tx.estUsdCost?.toFixed(8)}`}
                    </td>
                    <td className="px-6 py-3 text-sm text-right font-semibold text-gray-900">
                      {tx.balanceAfter.toLocaleString()}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center">
                    <p className="text-gray-500">No transactions found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
