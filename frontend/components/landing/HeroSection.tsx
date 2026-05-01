'use client'

import Link from 'next/link'

export default function HeroSection() {
  return (
    <section style={{
      minHeight: 'calc(100vh - 60px)',
      backgroundColor: '#1E1B18',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '4rem 2rem',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background texture */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `
          radial-gradient(ellipse at 20% 50%, rgba(216,49,91,0.06) 0%, transparent 60%),
          radial-gradient(ellipse at 80% 20%, rgba(216,49,91,0.04) 0%, transparent 50%)
        `,
        pointerEvents: 'none',
      }} />

      {/* Grid overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `
          linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px',
        pointerEvents: 'none',
      }} />

      <div style={{
        position: 'relative',
        zIndex: 1,
        maxWidth: '860px',
        textAlign: 'center',
      }}>
        {/* Eyebrow */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '2rem',
          padding: '0.3rem 0.875rem',
          border: '1px solid rgba(216,49,91,0.3)',
          backgroundColor: 'rgba(216,49,91,0.06)',
        }}>
          <div style={{
            width: '5px', height: '5px',
            backgroundColor: '#D8315B',
            borderRadius: '50%',
            animation: 'pulse-crimson 2s ease-in-out infinite',
          }} />
          <span style={{
            fontSize: '0.65rem',
            fontWeight: 700,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: 'rgba(216,49,91,0.9)',
          }} className="font-condensed">
            Autonomous NPC Platform
          </span>
        </div>

        {/* Headline */}
        <h1 className="font-display" style={{
          fontSize: 'clamp(3rem, 8vw, 6rem)',
          fontWeight: 400,
          lineHeight: 1.0,
          letterSpacing: '-0.03em',
          color: '#ffffff',
          marginBottom: '0.25rem',
        }}>
          NPCs Are
        </h1>
        <h1 className="font-display" style={{
          fontSize: 'clamp(3rem, 8vw, 6rem)',
          fontWeight: 400,
          lineHeight: 1.0,
          letterSpacing: '-0.03em',
          color: '#D8315B',
          marginBottom: '2.5rem',
        }}>
          Dead.
        </h1>

        {/* Subtitle */}
        <p className="font-body" style={{
          fontSize: 'clamp(0.95rem, 2vw, 1.15rem)',
          lineHeight: 1.7,
          color: 'rgba(255,255,255,0.55)',
          maxWidth: '560px',
          margin: '0 auto 3rem',
          fontWeight: 300,
        }}>
          Create dynamic AI NPCs with Account Abstraction on{' '}
          <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 400 }}>PYUSD Network</span>.
          Live economies. Real transactions. Zero scripting.
        </p>

        {/* CTA */}
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/creator" style={{ textDecoration: 'none' }}>
            <button className="font-display" style={{
              fontSize: '0.8rem',
              fontWeight: 400,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              padding: '0.875rem 2.5rem',
              backgroundColor: '#D8315B',
              border: '2px solid #D8315B',
              color: '#ffffff',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: '0 0 30px rgba(216,49,91,0.35)',
              borderRadius: 0,
            }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = '#D8315B'
                e.currentTarget.style.boxShadow = '0 0 40px rgba(216,49,91,0.55)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = '#D8315B'
                e.currentTarget.style.boxShadow = '0 0 30px rgba(216,49,91,0.35)'
              }}
            >
              Build an Agent →
            </button>
          </Link>

          <Link href="/quickstart" style={{ textDecoration: 'none' }}>
            <button className="font-display" style={{
              fontSize: '0.8rem',
              fontWeight: 400,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              padding: '0.875rem 2.5rem',
              backgroundColor: 'transparent',
              border: '2px solid rgba(255,255,255,0.2)',
              color: 'rgba(255,255,255,0.75)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              borderRadius: 0,
            }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'rgba(216,49,91,0.5)'
                e.currentTarget.style.color = '#ffffff'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'
                e.currentTarget.style.color = 'rgba(255,255,255,0.75)'
              }}
            >
              Read Docs
            </button>
          </Link>
        </div>

        {/* Stats strip */}
        <div style={{
          marginTop: '5rem',
          display: 'flex',
          gap: '3rem',
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}>
          {[
            { value: 'Web3', label: 'Native' },
            { value: 'x402', label: 'Protocol' },
            { value: 'TEE', label: 'Execution' },
          ].map(({ value, label }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div className="font-display" style={{
                fontSize: '1.5rem',
                color: '#D8315B',
                fontWeight: 400,
              }}>{value}</div>
              <div className="font-condensed" style={{
                fontSize: '0.65rem',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.35)',
                marginTop: '0.25rem',
              }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom line */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '1px',
        background: 'linear-gradient(to right, transparent, rgba(216,49,91,0.5), transparent)',
      }} />
    </section>
  )
}