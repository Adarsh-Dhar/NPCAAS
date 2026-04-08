'use client'

import { useState } from 'react'
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
      <div className="text-2xl font-bold">
        <span className="gradient-text gradient-cyan-magenta">GUILDCRAFT</span>
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
