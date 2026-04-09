'use client'

import { useState } from 'react'
import { ethers } from 'ethers'
import RetroButton from '@/components/ui/RetroButton'
import RetroInput from '@/components/ui/RetroInput'
import { useWallet } from '@/components/WalletContext'

interface FundWalletModalProps {
  characterName: string
  walletAddress: string
  onClose: () => void
}

const KITE_CHAIN_ID_HEX = '0x940'
const KITE_EXPLORER = 'https://testnet.kitescan.io'

export default function FundWalletModal({ characterName, walletAddress, onClose }: FundWalletModalProps) {
  const { address, connect, onKiteNetwork, switchToKite } = useWallet()
  const [amount, setAmount] = useState('0.01')
  const [status, setStatus] = useState<'idle' | 'switching' | 'sending' | 'success' | 'error'>('idle')
  const [txHash, setTxHash] = useState('')
  const [error, setError] = useState('')

  const handleSend = async () => {
    if (!window.ethereum) {
      setError('Please install MetaMask or another Web3 wallet to send funds.')
      return
    }

    setStatus('sending')
    setError('')

    try {
      // Ensure connected
      if (!address) {
        await connect()
      }

      // Ensure on Kite network
      if (!onKiteNetwork) {
        setStatus('switching')
        await switchToKite()
      }

      setStatus('sending')

      const provider = new ethers.BrowserProvider(window.ethereum as ethers.Eip1193Provider)
      const signer = await provider.getSigner()

      const parsedAmount = parseFloat(amount)
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        throw new Error('Invalid amount')
      }

      const tx = await signer.sendTransaction({
        to: walletAddress,
        value: ethers.parseEther(parsedAmount.toString()),
      })

      setTxHash(tx.hash)
      setStatus('success')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transaction failed'
      // User rejection
      if (msg.includes('user rejected') || msg.includes('User denied')) {
        setError('Transaction rejected by user.')
      } else {
        setError(msg)
      }
      setStatus('error')
    }
  }

  const shortAddress = `${walletAddress.slice(0, 10)}...${walletAddress.slice(-6)}`

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="w-full max-w-md border-4 border-yellow-400 bg-black shadow-[8px_8px_0px_0px_rgba(234,179,8,1)]">
        {/* Header */}
        <div className="border-b-4 border-yellow-400 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white uppercase">Fund Agent</h2>
            <p className="text-yellow-400 text-xs mt-1">{characterName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-yellow-400 hover:text-white text-xl font-bold transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-6">
          {/* Network badge */}
          <div className="flex items-center gap-2 mb-4">
            <div className={`w-2 h-2 rounded-full ${onKiteNetwork && address ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`} />
            <span className="text-xs font-mono text-gray-400">
              {!address ? 'Wallet not connected' : onKiteNetwork ? 'Kite Testnet' : 'Wrong network — will switch on send'}
            </span>
          </div>

          {/* Recipient address */}
          <div className="mb-4">
            <p className="text-xs font-bold uppercase text-gray-400 mb-1">Character Wallet</p>
            <div className="bg-gray-950 border-2 border-yellow-400/40 p-3 break-all">
              <p className="text-yellow-300 font-mono text-xs leading-relaxed">{walletAddress}</p>
            </div>
          </div>

          {status === 'success' ? (
            <div>
              <div className="border-4 border-green-400 bg-green-950/20 p-4 mb-4">
                <p className="text-green-400 text-sm font-bold mb-2">✓ {amount} KITE sent!</p>
                <p className="text-xs text-gray-400 font-mono break-all">
                  Tx: {txHash.slice(0, 20)}...{txHash.slice(-8)}
                </p>
              </div>
              <div className="flex gap-3">
                <a
                  href={`${KITE_EXPLORER}/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1"
                >
                  <RetroButton variant="yellow" size="sm" className="w-full text-xs">
                    VIEW ON EXPLORER
                  </RetroButton>
                </a>
                <RetroButton variant="cyan" size="sm" onClick={onClose} className="flex-1">
                  DONE
                </RetroButton>
              </div>
            </div>
          ) : (
            <>
              <RetroInput
                borderColor="yellow"
                label="Amount (KITE)"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.01"
                step="0.001"
                min="0.001"
                disabled={status === 'sending' || status === 'switching'}
              />

              <p className="mt-2 text-xs text-gray-500 font-mono">
                Sending native KITE tokens on Kite Testnet
              </p>

              {error && (
                <div className="mt-3 border-2 border-red-500 bg-red-950/20 p-3">
                  <p className="text-red-400 text-xs font-mono">{error}</p>
                </div>
              )}

              <div className="mt-6 flex gap-3 justify-end">
                <RetroButton
                  variant="magenta"
                  size="sm"
                  onClick={onClose}
                  disabled={status === 'sending' || status === 'switching'}
                >
                  CANCEL
                </RetroButton>
                <RetroButton
                  variant="yellow"
                  size="sm"
                  onClick={handleSend}
                  disabled={status === 'sending' || status === 'switching' || !amount}
                >
                  {status === 'switching'
                    ? 'SWITCHING NETWORK...'
                    : status === 'sending'
                      ? 'SENDING...'
                      : address
                        ? 'SEND KITE'
                        : 'CONNECT & SEND'}
                </RetroButton>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}