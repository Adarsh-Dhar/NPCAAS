'use client'

import Link from 'next/link'
import RetroButton from '@/components/ui/RetroButton'
import { useWallet } from '@/components/WalletContext'

export default function TopNav() {
  const { address, connecting, onKiteNetwork, connect, disconnect, switchToKite } = useWallet()

  const shortAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : null

  const handleClick = async () => {
    if (address) {
      // If connected but wrong network, switch
      if (!onKiteNetwork) {
        await switchToKite()
      } else {
        disconnect()
      }
    } else {
      await connect()
    }
  }

  const buttonLabel = () => {
    if (connecting) return '[ CONNECTING... ]'
    if (!address) return '[ CONNECT WALLET ]'
    if (!onKiteNetwork) return '[ SWITCH TO PYUSD ]'
    return `[ ${shortAddress} ]`
  }

  const buttonVariant = () => {
    if (!address) return 'blue' as const
    if (!onKiteNetwork) return 'purple' as const
    return 'blue' as const
  }

  return (
    <nav className="w-full bg-black/95 border-b-4 border-blue-500 px-8 py-4 flex items-center justify-between sticky top-0 z-50 backdrop-blur-sm">
      {/* Left: Logo + Nav */}
      <div className="text-2xl font-bold flex items-center gap-8">
        <Link href="/" className="gradient-text gradient-neon">
          GUILDCRAFT
        </Link>
        <div className="flex items-center gap-4 text-xs uppercase font-bold">
          <Link href="/games" className="text-blue-300 hover:text-blue-100 transition-colors">
            Games
          </Link>
          <Link href="/characters" className="text-purple-300 hover:text-purple-100 transition-colors">
            Characters
          </Link>
        </div>
      </div>

      {/* Right: Wallet */}
      <div className="flex items-center gap-3">
        {address && onKiteNetwork && (
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            <span className="text-blue-400 text-xs font-mono">PYUSD Testnet</span>
          </div>
        )}
        <RetroButton
          variant={buttonVariant()}
          size="md"
          onClick={handleClick}
          disabled={connecting}
        >
          {buttonLabel()}
        </RetroButton>
      </div>
    </nav>
  )
}