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
    if (!onKiteNetwork) return '[ SWITCH TO KITE_USD ]'
    return `[ ${shortAddress} ]`
  }

  const buttonVariant = () => {
    if (!address) return 'cyan' as const
    if (!onKiteNetwork) return 'yellow' as const
    return 'green' as const
  }

  return (
    <nav className="w-full bg-black border-b-4 border-white px-8 py-4 flex items-center justify-between sticky top-0 z-50">
      {/* Left: Logo + Nav */}
      <div className="text-2xl font-bold flex items-center gap-8">
        <Link href="/" className="gradient-text gradient-cyan-magenta">
          GUILDCRAFT
        </Link>
        <div className="flex items-center gap-4 text-xs uppercase font-bold">
          <Link href="/games" className="text-cyan-300 hover:text-cyan-100 transition-colors">
            My Games
          </Link>
          <Link href="/characters" className="text-magenta-300 hover:text-magenta-100 transition-colors">
            My Characters
          </Link>
        </div>
      </div>

      {/* Right: Wallet */}
      <div className="flex items-center gap-3">
        {address && onKiteNetwork && (
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-green-400 text-xs font-mono">KITE_USD Testnet</span>
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