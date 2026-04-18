import type { Metadata } from 'next'
import { Press_Start_2P, VT323 } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { WalletProvider } from '@/components/WalletContext'
import './globals.css'

const pressStart2P = Press_Start_2P({ 
  weight: '400',
  subsets: ['latin'],
  variable: '--font-press-start-2p'
});

const vt323 = VT323({ 
  weight: '400',
  subsets: ['latin'],
  variable: '--font-vt323'
});

export const metadata: Metadata = {
  title: 'GuildCraft | Retro 8-Bit NPC Creator',
  description: 'Create autonomous AI NPCs for the KITE_USD network with a retro 8-bit aesthetic',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${pressStart2P.variable} ${vt323.variable}`}>
      <body className="font-press-start-2p bg-black text-white antialiased">
        <WalletProvider>
          {children}
        </WalletProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}