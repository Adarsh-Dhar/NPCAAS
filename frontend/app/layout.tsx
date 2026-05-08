import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { WalletProvider } from '@/components/WalletContext'
import './globals.css'

export const metadata: Metadata = {
  title: 'GuildCraft | Autonomous NPC Platform',
  description: 'Create autonomous AI NPCs for the PYUSD network',
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
  const currentYear = new Date().getFullYear()

  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="https://use.typekit.net/syc1pzu.css" />
      </head>
      <body className="font-body">
        <WalletProvider>
          {children}
        </WalletProvider>
        <footer
          className="font-condensed"
          style={{
            borderTop: '1px solid rgba(255,255,255,0.08)',
            backgroundColor: '#1a1715',
            padding: '1rem 1.5rem',
            textAlign: 'center',
            fontSize: '0.75rem',
            letterSpacing: '0.06em',
            color: 'rgba(255,255,255,0.3)',
            textTransform: 'uppercase',
          }}
        >
          {`© ${currentYear} Adarsh — MIT License`}
        </footer>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}