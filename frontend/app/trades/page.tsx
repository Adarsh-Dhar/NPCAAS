"use client";

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { NexusLayout } from '@/components/nexus-layout';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNexus } from '@/lib/nexus-context';

const statusColors: Record<string, string> = {
  PENDING: 'text-secondary border-secondary/50 bg-secondary/10',
  ACTIVE: 'text-primary border-primary/50 bg-primary/10',
  SETTLED: 'text-accent border-accent/50 bg-accent/10',
};

export default function TradesPage() {
  const {
    trades,
    activePoolId,
    pools,
    agents,
    executeTrade,
    refreshState,
    paymentRequired,
    submitXPayment,
    dismissPaymentRequired,
  } = useNexus();
  const [manualToken, setManualToken] = useState('');
  const paymentTerms = useMemo(() => paymentRequired?.accepts?.[0] ?? null, [paymentRequired]);

  async function handleDemoSettlement() {
    const poolId = activePoolId ?? pools[0]?.poolId;
    const brokerName = agents[0]?.brokerName;

    if (!poolId || !brokerName) {
      console.warn('[TradesPage] No pool or broker available for demo settlement');
      return;
    }

    await executeTrade({
      poolId,
      brokerName,
      asset: 'Crop Data',
      price: '45.00',
      negotiation: 'Trade ledger demo trigger',
    });
  }

  return (
    <NexusLayout>
      <div className="flex flex-col h-full">
        {paymentRequired && (
          <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
            <div className="mb-2 font-semibold text-amber-200">Payment Required (HTTP 402)</div>
            <div className="mb-3 text-amber-100/90">
              {paymentRequired.error || 'This trade requires an x402 payment token.'}
            </div>
            {paymentTerms && (
              <div className="mb-3 space-y-1 text-xs text-amber-100/80 font-mono">
                <div>merchant: {paymentTerms.merchantName || 'Nexus OTC Clearinghouse'}</div>
                <div>network: {String(paymentTerms.network || '')}</div>
                <div>amount: {String(paymentTerms.maxAmountRequired || '')}</div>
                <div>payTo: {String(paymentTerms.payTo || '')}</div>
              </div>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="Paste X-Payment token"
                className="w-full rounded-md border border-amber-300/40 bg-black/30 px-3 py-2 text-xs text-amber-100 placeholder:text-amber-100/50"
              />
              <button
                type="button"
                onClick={async () => {
                  if (!manualToken.trim()) return;
                  await submitXPayment(manualToken.trim());
                  setManualToken('');
                }}
                className="rounded-md border border-amber-300/50 bg-amber-400/20 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-400/30"
              >
                Submit Token
              </button>
              <button
                type="button"
                onClick={dismissPaymentRequired}
                className="rounded-md border border-amber-300/30 bg-transparent px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-400/10"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <div className="border-b border-border/20 px-6 py-5 flex-shrink-0 bg-gradient-to-r from-primary/5 to-secondary/5 backdrop-blur-sm rounded-lg mb-6">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-1">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              <h2 className="text-lg font-bold text-foreground uppercase tracking-wider">
                Trade Ledger
              </h2>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleDemoSettlement}
                className="rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
              >
                Trigger Settlement
              </button>
              <button
                type="button"
                onClick={refreshState}
                className="rounded-full border border-border/40 bg-card/70 px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-card"
              >
                Refresh Trades
              </button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            All negotiations, active trades, and settlements
          </p>
        </div>

        <ScrollArea className="flex-1">
          {trades.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
              <div className="w-12 h-12 border border-border/30 rounded-full flex items-center justify-center">
                <div className="w-3 h-3 bg-muted rounded-full" />
              </div>
              <p className="text-sm font-medium">No trades recorded yet</p>
              <p className="text-xs opacity-60 text-center max-w-56">
                Use the CLI to deploy brokers or trigger a demo settlement above
              </p>
            </div>
          ) : (
            <div className="space-y-3 pr-4">
              {trades.map((trade) => (
                <Link key={trade.id} href={`/trades/${trade.id}`}>
                  <div className="border border-border/40 rounded-lg p-4 bg-card/50 hover:bg-card/80 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10 transition-all cursor-pointer group backdrop-blur-sm">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors font-mono">
                          Trade #{trade.id}
                        </h3>
                        <div className="text-xs text-muted-foreground mt-1 font-mono">
                          {trade.buyer && trade.seller
                            ? `Buyer: ${trade.buyer} | Seller: ${trade.seller}`
                            : trade.agents.length > 0
                            ? `Agents: ${trade.agents.join(', ')}`
                            : trade.brokerName
                            ? `Broker: ${trade.brokerName}`
                            : 'Unknown agents'}
                        </div>
                      </div>
                      <span
                        className={`text-xs px-3 py-1.5 border rounded-full font-semibold flex-shrink-0 ml-3 ${
                          statusColors[trade.status] ?? 'text-muted-foreground border-border bg-muted/5'
                        }`}
                      >
                        {trade.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-4 text-xs">
                      <div>
                        <div className="text-muted-foreground uppercase tracking-wider mb-1 font-medium">
                          Amount
                        </div>
                        <div className="text-primary font-bold font-mono">
                          ${trade.price || '0'} USDC
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground uppercase tracking-wider mb-1 font-medium">
                          Time
                        </div>
                        <div className="text-foreground font-medium font-mono">
                          {trade.timestamp || trade.createdAt}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground uppercase tracking-wider mb-1 font-medium">
                          Asset
                        </div>
                        <div className="text-accent truncate font-mono">
                          {trade.asset || 'Live settlement'}
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </NexusLayout>
  );
}