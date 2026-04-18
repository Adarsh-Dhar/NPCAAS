'use client'

import { useState } from 'react'
import { AlertCircle, CheckCircle, Loader } from 'lucide-react'

interface RechargeDialogProps {
  characterId: string
  npcName: string
  maxAvailable: number
  onRechargeSuccess?: () => void
  onClose?: () => void
}

export function ComputeRechargeDialog({
  characterId,
  npcName,
  maxAvailable,
  onRechargeSuccess,
  onClose,
}: RechargeDialogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleOpen = () => {
    setIsOpen(true)
    setError(null)
    setSuccess(false)
    setAmount('')
  }

  const handleClose = () => {
    setIsOpen(false)
    onClose?.()
  }

  const previewTokens = amount ? Math.floor(parseFloat(amount || '0') * 1000) : 0

  const handleRecharge = async () => {
    try {
      setLoading(true)
      setError(null)

      const amountNum = parseFloat(amount)
      if (!amount || amountNum <= 0) {
        setError('Please enter a valid amount')
        setLoading(false)
        return
      }

      if (amountNum > maxAvailable) {
        setError(`Insufficient wallet balance. Maximum: ${maxAvailable.toFixed(2)} KITE_USD`)
        setLoading(false)
        return
      }

      const res = await fetch(`/api/npcs/${encodeURIComponent(npcName)}/compute/recharge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kiteUsdAmount: amountNum }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Recharge failed')
      }

      setSuccess(true)
      setAmount('')
      onRechargeSuccess?.()

      // Auto-close after 2 seconds
      setTimeout(() => {
        handleClose()
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recharge failed')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={handleOpen}
        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
      >
        Recharge Compute
      </button>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4">
        {/* Header */}
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recharge Compute Units</h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700 text-xl"
            disabled={loading}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {success ? (
            <div className="text-center py-4">
              <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-3" />
              <h3 className="font-semibold text-green-900 mb-1">Recharge Successful!</h3>
              <p className="text-sm text-green-700">
                {previewTokens.toLocaleString()} compute tokens have been added to your NPC.
              </p>
            </div>
          ) : (
            <>
              {/* Wallet Info */}
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
                <p className="text-xs text-blue-600 mb-1">Available in wallet</p>
                <p className="text-lg font-bold text-blue-900">
                  {maxAvailable.toFixed(2)} KITE_USD
                </p>
              </div>

              {/* Amount Input */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amount to Recharge (KITE_USD)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max={maxAvailable}
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={loading}
                  />
                  <span
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 font-medium cursor-pointer hover:text-gray-700"
                    onClick={() => setAmount(maxAvailable.toString())}
                  >
                    Max
                  </span>
                </div>
              </div>

              {/* Preview */}
              {amount && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded">
                  <p className="text-xs text-green-600 mb-1">You will receive</p>
                  <p className="text-xl font-bold text-green-900">
                    {previewTokens.toLocaleString()} tokens
                  </p>
                  <p className="text-xs text-green-700 mt-1">
                    @ 1:1000 ratio (1 USD = 1000 tokens)
                  </p>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Actions */}
        <div className="border-t px-6 py-4 flex gap-3 justify-end">
          <button
            onClick={handleClose}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            disabled={loading}
          >
            {success ? 'Done' : 'Cancel'}
          </button>
          {!success && (
            <button
              onClick={handleRecharge}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              disabled={loading || !amount}
            >
              {loading && <Loader className="w-4 h-4 animate-spin" />}
              {loading ? 'Processing...' : 'Confirm Recharge'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
