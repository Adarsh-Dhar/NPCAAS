'use client'

import Link from 'next/link'
import { useWallet } from '@/components/WalletContext'

export default function TopNav() {
  const { address, connecting, onKiteNetwork, connect, disconnect, switchToKite } = useWallet()

  const shortAddress = address
    ? `${address.slice(0, 6)}···${address.slice(-4)}`
    : null

  const handleClick = async () => {
    if (address) {
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
    if (connecting) return 'Connecting…'
    if (!address) return 'Connect Wallet'
    if (!onKiteNetwork) return 'Switch Network'
    return shortAddress
  }

  return (
    <nav style={{
      width: '100%',
      backgroundColor: 'rgba(30, 27, 24, 0.96)',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      padding: '0 2rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 50,
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      height: '60px',
    }}>
      {/* Left: Logo + Nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2.5rem' }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <span className="font-display" style={{
            fontSize: '1.35rem',
            fontWeight: 400,
            color: '#ffffff',
            letterSpacing: '-0.01em',
          }}>
            Guild<span style={{ color: '#D8315B' }}>Craft</span>
          </span>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.75rem' }}>
          {[
            { href: '/games', label: 'Games' },
            { href: '/quickstart', label: 'Quickstart' },
            { href: '/about', label: 'About' },
          ].map(({ href, label }) => (
            <Link key={href} href={href} style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.55)',
              textDecoration: 'none',
              transition: 'color 0.15s ease',
            }}
              className="font-condensed"
              onMouseEnter={e => (e.currentTarget.style.color = '#ffffff')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.55)')}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* Right: Wallet */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
        {address && onKiteNetwork && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <div style={{
              width: '6px', height: '6px',
              borderRadius: '50%',
              backgroundColor: '#D8315B',
              animation: 'pulse-crimson 2s ease-in-out infinite',
            }} />
            <span style={{
              fontSize: '0.65rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.4)',
            }} className="font-condensed">
              Kite Testnet
            </span>
          </div>
        )}

        <button
          onClick={handleClick}
          disabled={connecting}
          className="font-display"
          style={{
            fontSize: '0.7rem',
            fontWeight: 400,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            padding: '0.4rem 1rem',
            border: '1px solid',
            borderColor: address && onKiteNetwork ? 'rgba(216,49,91,0.4)' : 'rgba(255,255,255,0.2)',
            backgroundColor: address && onKiteNetwork ? 'rgba(216,49,91,0.1)' : 'transparent',
            color: address && onKiteNetwork ? '#ffffff' : 'rgba(255,255,255,0.75)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            borderRadius: 0,
          }}
        >
          {buttonLabel()}
        </button>
      </div>
    </nav>
  )
}