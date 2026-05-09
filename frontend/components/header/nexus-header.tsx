'use client';

import Link from 'next/link';
import { Activity } from 'lucide-react';
import { usePathname } from 'next/navigation';

const navLinks = [
  { href: '/', label: 'Dashboard' },
  { href: '/agents', label: 'Agents' },
  { href: '/trades', label: 'Trades' },
  { href: '/settings', label: 'Settings' },
];

export function NexusHeader() {
  const pathname = usePathname();

  return (
    <div className="w-full bg-gradient-to-r from-card via-card to-card border-b border-border/30 backdrop-blur-sm sticky top-0 z-50">
      <div className="px-6 py-5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <Link href="/" className="hover:opacity-80 transition-opacity">
              <div className="space-y-1">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">NEXUS OTC</h1>
                <p className="text-xs text-muted-foreground">Trading Network</p>
              </div>
            </Link>
            <div className="flex items-center gap-2 ml-4 px-3 py-1 bg-primary/10 rounded-full border border-primary/20">
              <Activity className="w-4 h-4 text-primary animate-pulse" />
              <span className="text-sm text-primary font-medium">CONNECTED</span>
            </div>
          </div>

          <div className="flex items-center gap-8">
            <div className="text-right">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">24H VOL</div>
              <div className="text-lg font-bold text-primary">$12.5M</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">ACTIVE ENCLAVES</div>
              <div className="text-lg font-bold text-accent">3</div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6 text-sm border-t border-border/30 pt-4">
          {navLinks.map((link) => {
            const isActive =
              pathname === link.href ||
              (link.href !== '/' && pathname.startsWith(link.href));

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`font-medium transition-all duration-300 pb-2 ${
                  isActive 
                    ? 'text-primary border-b-2 border-primary' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
