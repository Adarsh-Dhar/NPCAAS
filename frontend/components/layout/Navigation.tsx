'use client'

import Link from 'next/link'
import RetroButton from '@/components/ui/RetroButton'

export default function Navigation() {
  return (
    <nav className="border-b-4 border-blue-500 bg-black/95 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <div className="gradient-text gradient-neon text-xl font-bold">
            GUILDCRAFT
          </div>
        </Link>

        {/* Links */}
        <div className="flex items-center gap-4">
          <Link
            href="/quickstart"
            className="text-white text-xs font-bold uppercase hover:text-blue-400 transition-colors"
          >
            QUICKSTART
          </Link>
          <Link
            href="/about"
            className="text-white text-xs font-bold uppercase hover:text-purple-400 transition-colors"
          >
            ABOUT
          </Link>
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
