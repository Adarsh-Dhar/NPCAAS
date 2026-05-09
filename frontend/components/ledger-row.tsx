'use client';

import { Transaction } from '@/lib/types';

export function LedgerRow({ transaction }: { transaction: Transaction }) {
  return (
    <div
      className={`py-4 px-4 border-b border-border/20 flex items-center justify-between text-xs transition-all hover:bg-primary/5 group ${
        transaction.isSettlement ? 'text-primary font-semibold' : 'text-muted-foreground'
      }`}
    >
      <span className="text-muted-foreground/70 w-20 flex-shrink-0 font-mono group-hover:text-primary/70">{transaction.timestamp}</span>
      <span
        className={`flex-1 font-medium ${
          transaction.isBlurred && !transaction.isSettlement
            ? 'blur-sm group-hover:blur-none transition-all'
            : ''
        }`}
      >
        {transaction.content}
      </span>
      {transaction.isSettlement && (
        <span className="ml-4 text-primary font-bold flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
          SETTLED
        </span>
      )}
    </div>
  );
}
