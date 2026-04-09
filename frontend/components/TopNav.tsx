'use client'

import { useState } from 'react'
import Link from 'next/link'
import RetroButton from '@/components/ui/RetroButton'

export default function TopNav() {
  const [isConnected, setIsConnected] = useState(false)
  const mockAddress = '0x7F...4A2B'

  const handleToggle = () => {
    setIsConnected(!isConnected)
  }

  return (
    <nav className="w-full bg-black border-b-4 border-white px-8 py-4 flex items-center justify-between sticky top-0 z-50">
      {/* Left: Logo */}
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

      {/* Right: Wallet Button */}
      <RetroButton
        variant={isConnected ? 'green' : 'cyan'}
        size="md"
        onClick={handleToggle}
        className={isConnected ? 'border-4 border-green-400' : ''}
      >
        {isConnected ? `[ ${mockAddress} ]` : '[ CONNECT WALLET ]'}
      </RetroButton>
    </nav>
  )
}
