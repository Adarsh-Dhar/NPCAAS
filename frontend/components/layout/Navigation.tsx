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
          <RetroButton variant="magenta" size="sm">(base) adarsh@Adarshs-MacBook-Air-2 frontend % pnpm run build

&gt; my-project@0.1.0 build /Users/adarsh/Documents/kite-ai/frontend
&gt; next build

▲ Next.js 16.2.0 (Turbopack)
- Environments: .env.local, .env

⚠ The "middleware" file convention is deprecated. Please use "proxy" instead. Learn more: https://nextjs.org/docs/messages/middleware-to-proxy
  Creating an optimized production build ...
✓ Compiled successfully in 6.2s
  Skipping validation of types
✓ Finished TypeScript config validation in 55ms    
✓ Collecting page data using 7 workers in 1507ms    
⨯ useSearchParams() should be wrapped in a suspense boundary at page "/creator". Read more: https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout
    at S (/Users/adarsh/Documents/kite-ai/frontend/.next/server/chunks/ssr/0-5p_next_13s.0ff._.js:2:2692)
    at r (/Users/adarsh/Documents/kite-ai/frontend/.next/server/chunks/ssr/0-5p_next_13s.0ff._.js:4:6761)
    at /Users/adarsh/Documents/kite-ai/frontend/.next/server/chunks/ssr/app_creator_page_tsx_05fd010._.js:1:145
    at an (/Users/adarsh/Documents/kite-ai/frontend/node_modules/.pnpm/next@16.2.0_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/next/dist/compiled/next-server/app-page-turbo.runtime.prod.js:2:84267)
    at ai (/Users/adarsh/Documents/kite-ai/frontend/node_modules/.pnpm/next@16.2.0_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/next/dist/compiled/next-server/app-page-turbo.runtime.prod.js:2:86086)
    at al (/Users/adarsh/Documents/kite-ai/frontend/node_modules/.pnpm/next@16.2.0_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/next/dist/compiled/next-server/app-page-turbo.runtime.prod.js:2:107860)
    at ao (/Users/adarsh/Documents/kite-ai/frontend/node_modules/.pnpm/next@16.2.0_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/next/dist/compiled/next-server/app-page-turbo.runtime.prod.js:2:105275)
    at aa (/Users/adarsh/Documents/kite-ai/frontend/node_modules/.pnpm/next@16.2.0_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/next/dist/compiled/next-server/app-page-turbo.runtime.prod.js:2:84619)
    at ai (/Users/adarsh/Documents/kite-ai/frontend/node_modules/.pnpm/next@16.2.0_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/next/dist/compiled/next-server/app-page-turbo.runtime.prod.js:2:86135)
    at ai (/Users/adarsh/Documents/kite-ai/frontend/node_modules/.pnpm/next@16.2.0_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/next/dist/compiled/next-server/app-page-turbo.runtime.prod.js:2:104615)
Error occurred prerendering page "/creator". Read more: https://nextjs.org/docs/messages/prerender-error
Export encountered an error on /creator/page: /creator, exiting the build.
⨯ Next.js build worker exited with code: 1 and signal: null
 ELIFECYCLE  Command failed with exit code 1.
(base) adarsh@Adarshs-MacBook-Air-2 frontend % 
            ENTER CREATOR
          </RetroButton>
        </Link>
      </div>
    </nav>
  )
}
