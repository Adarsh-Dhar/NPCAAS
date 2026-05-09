import Link from 'next/link';
import { NexusLayout } from '@/components/nexus-layout';
import { trades } from '@/lib/mock-data';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

export default function TradeDetailPage({ params }: { params: { id: string } }) {
  const trade = trades.find((t) => t.id === params.id);

  if (!trade) {
    notFound();
  }

  const statusColor = {
    PENDING: 'text-secondary border-secondary/50 bg-secondary/10',
    ACTIVE: 'text-primary border-primary/50 bg-primary/10',
    SETTLED: 'text-accent border-accent/50 bg-accent/10',
  }[trade.status];

  return (
    <NexusLayout>
      <div className="flex flex-col h-full overflow-auto">
        <div className="border-b border-border/20 px-6 py-5 flex-shrink-0 bg-gradient-to-r from-primary/5 to-secondary/5 backdrop-blur-sm rounded-lg mb-6">
          <div className="flex items-center gap-3 mb-1">
            <Link href="/trades" className="hover:text-primary transition-colors text-muted-foreground hover:text-primary/80">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h2 className="text-lg font-bold text-foreground uppercase tracking-wider">
              Trade Details
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mt-2 ml-7">Trade execution, agents & settlement status</p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto pr-4">
          <div className="border border-border/40 rounded-lg p-5 bg-card/50 backdrop-blur-sm">
            <div className="flex items-start justify-between mb-5">
              <h3 className="text-lg font-bold text-foreground">Trade #{trade.id}</h3>
              <span className={`text-sm px-3 py-1.5 border rounded-full font-semibold ${statusColor}`}>
                {trade.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm mb-5">
              <div className="bg-muted/30 rounded p-3">
                <div className="text-muted-foreground text-xs uppercase tracking-wider mb-2 font-medium">Amount</div>
                <div className="text-primary font-bold text-lg">{trade.amount}</div>
              </div>

              <div className="bg-muted/30 rounded p-3">
                <div className="text-muted-foreground text-xs uppercase tracking-wider mb-2 font-medium">
                  Created At
                </div>
                <div className="text-foreground font-medium">{trade.createdAt}</div>
              </div>
            </div>

            <div className="pt-5 border-t border-border/20">
              <div className="text-muted-foreground text-xs uppercase tracking-wider mb-3 font-medium">
                Participating Agents
              </div>
              <div className="space-y-2">
                {trade.agents.map((agent) => (
                  <div key={agent} className="text-foreground font-medium text-sm flex items-center gap-2 p-2 bg-muted/20 rounded hover:bg-muted/40 transition-colors">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full flex-shrink-0" />
                    {agent}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="border border-border/40 rounded-lg p-5 bg-card/50 backdrop-blur-sm">
            <h4 className="text-sm font-bold text-foreground mb-3 uppercase tracking-wider">
              Trade Details
            </h4>
            <p className="text-muted-foreground text-sm leading-relaxed">{trade.details}</p>
          </div>

          <div className="border border-border/40 rounded-lg p-5 bg-card/50 backdrop-blur-sm">
            <h4 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wider">
              Settlement Status
            </h4>
            <div className="space-y-2 text-xs text-muted-foreground">
              {trade.status === 'SETTLED' ? (
                <>
                  <div className="flex items-center gap-2 p-2 bg-accent/10 rounded hover:bg-accent/20 transition-colors">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full flex-shrink-0" />
                    <p>Trade settlement confirmed</p>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-accent/10 rounded hover:bg-accent/20 transition-colors">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full flex-shrink-0" />
                    <p>Vault transfer completed</p>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-accent/10 rounded hover:bg-accent/20 transition-colors">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full flex-shrink-0" />
                    <p>All parties acknowledged</p>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-accent/10 rounded hover:bg-accent/20 transition-colors">
                    <div className="w-1.5 h-1.5 bg-accent rounded-full flex-shrink-0" />
                    <p className="font-mono text-xs">Hash: 0x{Math.random().toString(16).slice(2, 18)}</p>
                  </div>
                </>
              ) : trade.status === 'ACTIVE' ? (
                <>
                  <div className="flex items-center gap-2 p-2 bg-primary/10 rounded hover:bg-primary/20 transition-colors">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse flex-shrink-0" />
                    <p>Settlement in progress</p>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-primary/10 rounded hover:bg-primary/20 transition-colors">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse flex-shrink-0" />
                    <p>Awaiting final confirmations</p>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-primary/10 rounded hover:bg-primary/20 transition-colors">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse flex-shrink-0" />
                    <p>Vault transfer pending</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 p-2 bg-secondary/10 rounded hover:bg-secondary/20 transition-colors">
                    <div className="w-1.5 h-1.5 bg-secondary rounded-full flex-shrink-0" />
                    <p>Awaiting counterparty acceptance</p>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-secondary/10 rounded hover:bg-secondary/20 transition-colors">
                    <div className="w-1.5 h-1.5 bg-secondary rounded-full flex-shrink-0" />
                    <p>Pending agent confirmation</p>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-secondary/10 rounded hover:bg-secondary/20 transition-colors">
                    <div className="w-1.5 h-1.5 bg-secondary rounded-full flex-shrink-0" />
                    <p>Vault access verification</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </NexusLayout>
  );
}
