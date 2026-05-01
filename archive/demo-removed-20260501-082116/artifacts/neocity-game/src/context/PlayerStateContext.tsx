import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

const STARTING_CREDITS = 12_000
const ESCROW_COST = 5_000

type PlayerStateContextValue = {
  credits: number
  escrowFunded: boolean
  escrowCost: number
  canFundEscrow: boolean
  debitCredits: (amount: number) => boolean
  addCredits: (amount: number) => void
  markEscrowFunded: (value: boolean) => void
  fundEscrow: () => boolean
}

const PlayerStateContext = createContext<PlayerStateContextValue | null>(null)

export function PlayerStateProvider({ children }: { children: ReactNode }) {
  const [credits, setCredits] = useState(STARTING_CREDITS)
  const [escrowFunded, setEscrowFunded] = useState(false)

  const value = useMemo<PlayerStateContextValue>(() => {
    const debitCredits = (amount: number) => {
      if (!Number.isFinite(amount) || amount <= 0) return false
      let didDebit = false
      setCredits((current) => {
        if (current < amount) return current
        didDebit = true
        return current - amount
      })
      return didDebit
    }

    const markEscrowFunded = (value: boolean) => {
      setEscrowFunded(value)
    }

    const addCredits = (amount: number) => {
      if (!Number.isFinite(amount) || amount <= 0) return
      setCredits((current) => current + amount)
    }

    const fundEscrow = () => {
      if (escrowFunded) return true
      const didDebit = debitCredits(ESCROW_COST)
      if (!didDebit) return false
      setEscrowFunded(true)
      return true
    }

    return {
      credits,
      escrowFunded,
      escrowCost: ESCROW_COST,
      canFundEscrow: !escrowFunded && credits >= ESCROW_COST,
      debitCredits,
      addCredits,
      markEscrowFunded,
      fundEscrow,
    }
  }, [credits, escrowFunded])

  return <PlayerStateContext.Provider value={value}>{children}</PlayerStateContext.Provider>
}

export function usePlayerState() {
  const ctx = useContext(PlayerStateContext)
  if (!ctx) {
    throw new Error('usePlayerState must be used within PlayerStateProvider')
  }
  return ctx
}
