'use client';

import { useNexus } from '@/lib/nexus-context';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEffect, useRef } from 'react';
import { FeedActivity } from '@/lib/api';

function FeedRow({ item }: { item: FeedActivity }) {
  return (
    <div
      className={`py-3 px-4 border-b border-border/20 flex items-center gap-3 text-xs transition-all hover:bg-primary/5 group ${
        item.isSettlement
          ? 'bg-primary/5 border-l-2 border-l-primary'
          : ''
      }`}
    >
      <span className="text-muted-foreground/70 w-24 flex-shrink-0 font-mono tabular-nums">
        {item.timestamp}
      </span>

      <span
        className={`flex-1 font-medium transition-all ${
          item.isSettlement
            ? 'text-primary font-semibold'
            : 'text-muted-foreground'
        } ${
          item.isBlurred && !item.isSettlement
            ? 'blur-[3px] group-hover:blur-none transition-all duration-300 select-none'
            : ''
        }`}
      >
        {item.content}
      </span>

      {item.isSettlement && (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
          <span className="text-primary font-bold">CLEARED</span>
        </div>
      )}

      {item.type === 'NEGOTIATION' && (
        <div className="flex-shrink-0">
          <span className="text-muted-foreground/40 text-xs">●●●</span>
        </div>
      )}

      {item.type === 'BROKER_JOINED' && (
        <div className="flex-shrink-0">
          <span className="text-accent text-xs font-semibold">ONLINE</span>
        </div>
      )}
    </div>
  );
}

export function LiveMatchingEngine() {
  const { feedItems, connected, serverOnline, trades } = useNexus();
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  // Auto-scroll to top when new items arrive (newest first)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [feedItems.length]);

  const isEmpty = feedItems.length === 0;

  return (
    <div className="flex flex-col h-full bg-card/50 rounded-lg border border-border/20 overflow-hidden">
      {/* Header */}
      <div className="border-b border-border/20 px-6 py-4 flex-shrink-0 bg-gradient-to-r from-primary/5 to-secondary/5 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <div className={`w-2 h-2 rounded-full ${connected ? 'bg-primary animate-pulse' : 'bg-muted-foreground/40'}`} />
              <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
                Live Matching Engine
              </h2>
            </div>
            <p className="text-xs text-muted-foreground">Settlement ledger & transaction pool</p>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div className="text-right">
              <div className="text-muted-foreground uppercase tracking-wider">Events</div>
              <div className="font-bold text-foreground font-mono">{feedItems.length}</div>
            </div>
            <div className="text-right">
              <div className="text-muted-foreground uppercase tracking-wider">Settled</div>
              <div className="font-bold text-primary font-mono">{trades.length}</div>
            </div>
          </div>
        </div>

        {/* Status bar */}
        {!serverOnline && (
          <div className="mt-2 px-3 py-1.5 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive font-mono">
            ⚠ Server offline — start nexus-server on localhost:3000
          </div>
        )}
        {serverOnline && !connected && (
          <div className="mt-2 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded text-xs text-yellow-500 font-mono">
            ◌ Connecting to real-time feed…
          </div>
        )}
      </div>

      {/* Feed */}
      <ScrollArea className="flex-1">
        <div ref={scrollRef}>
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <div className="w-12 h-12 border border-border/30 rounded-full flex items-center justify-center">
                <div className={`w-3 h-3 rounded-full ${serverOnline ? 'bg-primary/40 animate-ping' : 'bg-muted'}`} />
              </div>
              <p className="text-sm font-medium">
                {serverOnline ? 'Waiting for activity…' : 'Server offline'}
              </p>
              <p className="text-xs opacity-60 text-center max-w-48">
                {serverOnline
                  ? 'Deploy agents via nexus CLI to see live negotiations'
                  : 'Start the nexus-server to connect'}
              </p>
            </div>
          ) : (
            feedItems.map((item, i) => (
              <FeedRow key={`${item.timestamp}-${i}`} item={item} />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}