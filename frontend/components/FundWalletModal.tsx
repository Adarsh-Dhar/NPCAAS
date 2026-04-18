'use client'

import { useState } from 'react'
import { ethers } from 'ethers'
import RetroButton from '@/components/ui/RetroButton'
import RetroInput from '@/components/ui/RetroInput'
import { useWallet } from '@/components/WalletContext'
import { PRIMARY_TOKEN_ADDRESS, PRIMARY_TOKEN_SYMBOL } from '@/lib/token-config'

interface FundWalletModalProps {
  characterName: string
  walletAddress: string
  onClose: () => void
}

const KITE_EXPLORER = 'https://testnet.kitescan.ai'
const FUNDING_TOKEN_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
]

export default function FundWalletModal({ characterName, walletAddress, onClose }: FundWalletModalProps) {
  const { address, connecting, onKiteNetwork, connect, switchToKite } = useWallet()
  const [amount, setAmount] = useState('0.01')
  const [status, setStatus] = useState<'idle' | 'connecting' | 'switching' | 'sending' | 'success' | 'error'>('idle')
  const [txHash, setTxHash] = useState('')
  const [error, setError] = useState('')

  const handleSend = async () => {
    if (!window.ethereum) {
      setError('Please install MetaMask or another Web3 wallet to send funds.')
      setStatus('error')
      return
    }

    setError('')

    try {
      // Step 1: ensure wallet is connected
      let currentAddress = address
      if (!currentAddress) {
        setStatus('connecting')
        await connect()
        // After connect(), re-read accounts directly since React state may not update yet
        const accounts = await window.ethereum.request({ method: 'eth_accounts' }) as string[]
        currentAddress = accounts[0] ?? null
        if (!currentAddress) {
          setError('Wallet connection was cancelled or failed.')
          setStatus('error')
          return
        }
      }

      // Step 2: ensure we're on the KITE_USD network
      const currentChainIdHex = await window.ethereum.request({ method: 'eth_chainId' }) as string
      const currentChainId = parseInt(currentChainIdHex, 16)
      if (currentChainId !== 2368) {
        setStatus('switching')
        await switchToKite()
        // Verify the switch actually happened
        const newChainIdHex = await window.ethereum.request({ method: 'eth_chainId' }) as string
        const newChainId = parseInt(newChainIdHex, 16)
        if (newChainId !== 2368) {
          setError('Please switch to KITE_USD Testnet (Chain ID 2368) in your wallet to continue.')
          setStatus('error')
          return
        }
      }

      // Step 3: validate amount
      const parsedAmount = parseFloat(amount)
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        setError('Please enter a valid amount greater than 0.')
        setStatus('error')
        return
      }

      // Step 4: send transaction
      setStatus('sending')
      const provider = new ethers.BrowserProvider(window.ethereum as ethers.Eip1193Provider)
      const signer = await provider.getSigner()

      console.log("signer", signer)

      const tokenContract = new ethers.Contract(PRIMARY_TOKEN_ADDRESS, FUNDING_TOKEN_ABI, signer)
      const decimals = Number(await tokenContract.decimals().catch(() => 18))
      const tokenAmount = ethers.parseUnits(parsedAmount.toString(), Number.isFinite(decimals) ? decimals : 18)
      const tx = await tokenContract.transfer(walletAddress, tokenAmount)
      console.log("tx", tx)

      setTxHash(tx.hash)
      setStatus('success')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transaction failed'
      if (
        msg.includes('user rejected') ||
        msg.includes('User denied') ||
        msg.includes('ACTION_REJECTED')
      ) {
        setError('Transaction was rejected by the user.')
      } else if (msg.includes('insufficient funds') || msg.includes('transfer amount exceeds balance')) {
        setError('Insufficient ERC-20 token balance in your wallet.')
      } else {
        setError(msg)
      }
      setStatus('error')
    }
  }

  const isBusy = status === 'connecting' || status === 'switching' || status === 'sending'

  const buttonLabel = () => {
    if (status === 'connecting') return 'CONNECTING WALLET...'
    if (status === 'switching') return 'SWITCHING NETWORK...'
    if (status === 'sending') return 'SENDING...'
    if (address) return 'SEND TOKEN'
    return 'CONNECT & SEND'
  }

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
              {!address
                ? 'Wallet not connected'
                : onKiteNetwork
                  ? 'KITE_USD Testnet ✓'
                  : 'Wrong network — will switch automatically on send'}
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
                <p className="text-green-400 text-sm font-bold mb-2">✓ {amount} {PRIMARY_TOKEN_SYMBOL} sent!</p>
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
                label="Amount (Token)"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.01"
                step="0.001"
                min="0.001"
                disabled={isBusy}
              />

              <p className="mt-2 text-xs text-gray-500 font-mono">
                Sending {PRIMARY_TOKEN_SYMBOL} token {PRIMARY_TOKEN_ADDRESS} on KITE_USD Testnet (Chain ID: 2368)
              </p>

              {(status === 'error' && error) && (
                <div className="mt-3 border-2 border-red-500 bg-red-950/20 p-3">
                  <p className="text-red-400 text-xs font-mono">{error}</p>
                </div>
              )}

              <div className="mt-6 flex gap-3 justify-end">
                <RetroButton
                  variant="magenta"
                  size="sm"
                  onClick={onClose}
                  disabled={isBusy}
                >
                  CANCEL
                </RetroButton>
                <RetroButton
                  variant="yellow"
                  size="sm"
                  onClick={handleSend}
                  disabled={isBusy || !amount || parseFloat(amount) <= 0}
                >
                  {buttonLabel()}
                </RetroButton>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}