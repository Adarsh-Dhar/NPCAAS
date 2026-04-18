'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

const KITE_CHAIN_ID_HEX = '0x940' // 2368
const KITE_CHAIN_ID = 2368

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
      on: (event: string, handler: (...args: unknown[]) => void) => void
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void
    }
  }
}

interface WalletContextType {
  address: string | null
  chainId: number | null
  connecting: boolean
  onKiteNetwork: boolean
  connect: () => Promise<void>
  disconnect: () => void
  switchToKite: () => Promise<void>
}

const WalletContext = createContext<WalletContextType>({
  address: null,
  chainId: null,
  connecting: false,
  onKiteNetwork: false,
  connect: async () => {},
  disconnect: () => {},
  switchToKite: async () => {},
})

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)
  const [connecting, setConnecting] = useState(false)

  const addKiteNetwork = async () => {
    await window.ethereum!.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: KITE_CHAIN_ID_HEX,
          chainName: 'KITE_USD Testnet',
          nativeCurrency: { name: 'KITE_USD', symbol: 'KITE_USD', decimals: 18 },
          rpcUrls: ['https://rpc-testnet.gokite.ai'],
          blockExplorerUrls: ['https://testnet.kitescan.ai'],
        },
      ],
    })
  }

  const switchToKite = useCallback(async () => {
    if (!window.ethereum) return
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: KITE_CHAIN_ID_HEX }],
      })
    } catch (err: unknown) {
      const switchError = err as { code?: number }
      if (switchError?.code === 4902) {
        await addKiteNetwork()
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.ethereum) return

    // Check if already connected
    window.ethereum.request({ method: 'eth_accounts' }).then((accounts) => {
      const accs = accounts as string[]
      if (accs[0]) setAddress(accs[0])
    })

    window.ethereum.request({ method: 'eth_chainId' }).then((id) => {
      setChainId(parseInt(id as string, 16))
    })

    const handleAccountsChanged = (accounts: unknown) => {
      const accs = accounts as string[]
      setAddress(accs[0] || null)
    }

    const handleChainChanged = (id: unknown) => {
      setChainId(parseInt(id as string, 16))
    }

    window.ethereum.on('accountsChanged', handleAccountsChanged)
    window.ethereum.on('chainChanged', handleChainChanged)

    return () => {
      window.ethereum?.removeListener('accountsChanged', handleAccountsChanged)
      window.ethereum?.removeListener('chainChanged', handleChainChanged)
    }
  }, [])

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      alert('Please install MetaMask or another Web3 wallet to connect.')
      return
    }

    setConnecting(true)
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      const accs = accounts as string[]
      if (accs[0]) {
        setAddress(accs[0])
        await switchToKite()
        const id = await window.ethereum.request({ method: 'eth_chainId' })
        setChainId(parseInt(id as string, 16))
      }
    } catch (err) {
      console.error('Wallet connect error:', err)
    } finally {
      setConnecting(false)
    }
  }, [switchToKite])

  const disconnect = useCallback(() => {
    setAddress(null)
  }, [])

  return (
    <WalletContext.Provider
      value={{
        address,
        chainId,
        connecting,
        onKiteNetwork: chainId === KITE_CHAIN_ID,
        connect,
        disconnect,
        switchToKite,
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}

export function useWallet() {
  return useContext(WalletContext)
}