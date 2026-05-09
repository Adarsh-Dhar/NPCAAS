import Link from 'next/link';
import { NexusLayout } from '@/components/nexus-layout';
import { trades } from '@/lib/mock-data';
import { ScrollArea } from '@/components/ui/scroll-area';

const statusColors = {
  PENDING: 'text-secondary border-secondary/50 bg-secondary/10',
  ACTIVE: 'text-primary border-primary/50 bg-primary/10',
  SETTLED: 'text-accent border-accent/50 bg-accent/10',
};

export default function TradesPage() {
  return (
    <NexusLayout>
      <div className="flex flex-col h-full">
        <div className="border-b border-border/20 px-6 py-5 flex-shrink-0 bg-gradient-to-r from-primary/5 to-secondary/5 backdrop-blur-sm rounded-lg mb-6">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            <h2 className="text-lg font-bold text-foreground uppercase tracking-wider">
              Trade Ledger
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mt-2">All negotiations, active trades, and settlements</p>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-3 pr-4">
            {trades.map((trade) => (
              <Link key={trade.id} href={`/trades/${trade.id}`}>
                <div className="border border-border/40 rounded-lg p-4 bg-card/50 hover:bg-card/80 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10 transition-all cursor-pointer group backdrop-blur-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                        Trade #{trade.id}
                      </h3>
                      <div className="text-xs text-muted-foreground mt-1">
                        Agents: {trade.agents.join(', ')}
                      </div>
                    </div>
                    <span className={`text-xs px-3 py-1.5 border rounded-full font-semibold ${statusColors[trade.status as keyof typeof statusColors]}`}>
                      {trade.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-xs">
                    <div>
                      <div className="text-muted-foreground uppercase tracking-wider mb-1 font-medium">Amount</div>
                      <div className="text-primary font-bold">{trade.amount}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground uppercase tracking-wider mb-1 font-medium">Created</div>
                      <div className="text-foreground font-medium">{trade.createdAt}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground uppercase tracking-wider mb-1 font-medium">Details</div>
                      <div className="text-accent truncate">{trade.details}</div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </ScrollArea>
      </div>
    </NexusLayout>
  );
}
