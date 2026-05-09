'use client';

import { transactions } from '@/lib/mock-data';
import { LedgerRow } from '../ledger-row';
import { ScrollArea } from '@/components/ui/scroll-area';

export function LiveMatchingEngine() {
  return (
    <div className="flex flex-col h-full bg-card/50 rounded-lg border border-border/20 overflow-hidden">
      <div className="border-b border-border/20 px-6 py-5 flex-shrink-0 bg-gradient-to-r from-primary/5 to-secondary/5 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
            Live Matching Engine
          </h2>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Settlement ledger & transaction pool</p>
      </div>

      <ScrollArea className="flex-1">
        <div>
          {transactions.map((transaction) => (
            <LedgerRow key={transaction.id} transaction={transaction} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
