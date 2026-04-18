'use client'

import Link from 'next/link'
import RetroButton from '@/components/ui/RetroButton'

export default function HeroSection() {
  return (
    <section className="min-h-screen bg-black flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* Floating decorative elements */}
      <div className="absolute top-20 left-20 w-16 h-16 border-4 border-cyan-500 opacity-30" />
      <div className="absolute bottom-32 right-20 w-12 h-12 border-4 border-pink-500 opacity-30" />
      <div className="absolute top-1/3 right-1/4 w-20 h-20 border-4 border-yellow-500 opacity-20" />

      <div className="text-center z-10 max-w-4xl">
        {/* Main Title */}
        <h1 className="gradient-text gradient-neon text-5xl md:text-7xl font-bold mb-6 drop-shadow-lg">
          NPCS ARE DEAD.
        </h1>

        {/* Subtitle */}
        <p className="text-cyan-400 text-sm md:text-base font-bold uppercase mb-12 leading-relaxed max-w-2xl mx-auto">
          Meet the future of autonomous agents. 
          <br />
          Create dynamic AI NPCs with <span className="text-yellow-400">Account Abstraction</span> on{' '}
          <span className="text-green-400">KITE_USD Network</span>.
        </p>

        {/* CTA Button */}
        <Link href="/creator">
          <RetroButton variant="green" size="lg" className="mb-16">
            BUILD AN AGENT {'>>'}
          </RetroButton>
        </Link>

        {/* Pixel art weapon placeholders */}
        <div className="flex items-center justify-center gap-12 mb-12">
          <div className="text-6xl">⚔️</div>
          <div className="text-6xl">🛡️</div>
          <div className="text-6xl">🔮</div>
        </div>
      </div>

      {/* Bottom accent line */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-pink-500 to-yellow-500" />
    </section>
  )
}
