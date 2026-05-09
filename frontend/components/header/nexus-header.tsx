'use client';

import Link from 'next/link';
import { Activity, Wifi, WifiOff } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useNexus } from '@/lib/nexus-context';

const navLinks = [
  { href: '/', label: 'Dashboard' },
  { href: '/agents', label: 'Agents' },
  { href: '/trades', label: 'Trades' },
  { href: '/settings', label: 'Settings' },
];

export function NexusHeader() {
  const pathname = usePathname();
  const { connected, serverOnline, activeEnclaves, totalVolume, agents } = useNexus();

  const negotiatingCount = agents.filter(a => a.status === 'NEGOTIATING').length;

  return (
    <div className="w-full bg-gradient-to-r from-card via-card to-card border-b border-border/30 backdrop-blur-sm sticky top-0 z-50">
      <div className="px-6 py-5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <Link href="/" className="hover:opacity-80 transition-opacity">
              <div className="space-y-1">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                  NEXUS OTC
                </h1>
                <p className="text-xs text-muted-foreground">AI Agent Dark Pool</p>
              </div>
            </Link>

            {/* Connection status */}
            <div className={`flex items-center gap-2 ml-4 px-3 py-1 rounded-full border transition-all ${
              connected && serverOnline
                ? 'bg-primary/10 border-primary/20'
                : serverOnline
                ? 'bg-yellow-500/10 border-yellow-500/20'
                : 'bg-destructive/10 border-destructive/20'
            }`}>
              {connected && serverOnline ? (
                <>
                  <Activity className="w-4 h-4 text-primary animate-pulse" />
                  <span className="text-sm text-primary font-medium">LIVE</span>
                </>
              ) : serverOnline ? (
                <>
                  <Wifi className="w-4 h-4 text-yellow-500" />
                  <span className="text-sm text-yellow-500 font-medium">CONNECTING</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-4 h-4 text-destructive" />
                  <span className="text-sm text-destructive font-medium">OFFLINE</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-8">
            {negotiatingCount > 0 && (
              <div className="text-right">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">ACTIVE DEALS</div>
                <div className="text-lg font-bold text-secondary animate-pulse">{negotiatingCount}</div>
              </div>
            )}
            <div className="text-right">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">24H VOL</div>
              <div className="text-lg font-bold text-primary">{totalVolume || '$0.00'}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">ACTIVE ENCLAVES</div>
              <div className="text-lg font-bold text-accent">{activeEnclaves}</div>
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