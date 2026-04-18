'use client'

import Link from 'next/link'
import RetroButton from '@/components/ui/RetroButton'

export default function Navigation() {
  return (
    <nav className="border-b-4 border-white bg-black">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <div className="gradient-text gradient-cyan-magenta text-xl font-bold">
            GUILDCRAFT
          </div>
        </Link>

        {/* Links */}
        <div className="flex items-center gap-4">
          <a
            href="https://docs.kite.network"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white text-xs font-bold uppercase hover:text-cyan-400 transition-colors"
          >
            DOCS
          </a>
          <a
            href="https://kite.network"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white text-xs font-bold uppercase hover:text-cyan-400 transition-colors"
          >
            KITE_USD NETWORK
          </a>
        </div>

        {/* CTA Button */}
        <Link href="/creator">
          <RetroButton variant="magenta" size="sm">
            ENTER CREATOR
          </RetroButton>
        </Link>
      </div>
    </nav>
  )
}
