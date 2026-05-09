import Link from 'next/link';
import { NexusLayout } from '@/components/nexus-layout';
import { agents } from '@/lib/mock-data';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

export default function AgentDetailPage({ params }: { params: { id: string } }) {
  const agent = agents.find((a) => a.id === params.id);

  if (!agent) {
    notFound();
  }

  const statusColor = {
    NEGOTIATING: 'text-secondary border-secondary/50 bg-secondary/10',
    SETTLING: 'text-primary border-primary/50 bg-primary/10',
    IDLE: 'text-muted-foreground border-border bg-muted/5',
  }[agent.status];

  return (
    <NexusLayout>
      <div className="flex flex-col h-full overflow-auto">
        <div className="border-b border-border/20 px-6 py-5 flex-shrink-0 bg-gradient-to-r from-primary/5 to-secondary/5 backdrop-blur-sm rounded-lg mb-6">
          <div className="flex items-center gap-3 mb-1">
            <Link href="/agents" className="hover:text-primary transition-colors text-muted-foreground hover:text-primary/80">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h2 className="text-lg font-bold text-foreground uppercase tracking-wider">
              Agent Details
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mt-2 ml-7">View broker configuration and performance metrics</p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto pr-4">
          <div className="border border-border/40 rounded-lg p-5 bg-card/50 hover:bg-card/80 transition-all backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-foreground">{agent.name}</h3>
              <span className={`text-xs px-3 py-1.5 border rounded-full font-semibold ${statusColor}`}>
                {agent.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-muted/30 rounded p-3">
                <div className="text-muted-foreground text-xs uppercase tracking-wider mb-2 font-medium">Status</div>
                <div className="font-bold text-foreground">{agent.status}</div>
              </div>

              <div className="bg-muted/30 rounded p-3">
                <div className="text-muted-foreground text-xs uppercase tracking-wider mb-2 font-medium">
                  Session Limit
                </div>
                <div className="text-primary font-bold">{agent.sessionLimit}%</div>
              </div>

              <div className="bg-muted/30 rounded p-3">
                <div className="text-muted-foreground text-xs uppercase tracking-wider mb-2 font-medium">Max Limit</div>
                <div className="text-accent font-bold">{agent.maxLimit}%</div>
              </div>

              <div className="bg-muted/30 rounded p-3">
                <div className="text-muted-foreground text-xs uppercase tracking-wider mb-2 font-medium">
                  Last Active
                </div>
                <div className="text-foreground font-medium">{agent.lastActive}</div>
              </div>
            </div>

            <div className="mt-5 pt-5 border-t border-border/20">
              <div className="text-muted-foreground text-xs uppercase tracking-wider mb-3 font-medium">
                Capacity Utilization
              </div>
              <div className="w-full h-3 bg-muted rounded-full overflow-hidden border border-border/20">
                <div
                  className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-500"
                  style={{ width: `${(agent.sessionLimit / agent.maxLimit) * 100}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">{Math.round((agent.sessionLimit / agent.maxLimit) * 100)}% capacity utilization</p>
            </div>
          </div>

          <div className="border border-border/40 rounded-lg p-5 bg-card/50 backdrop-blur-sm">
            <h4 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wider">
              Recent Activity
            </h4>
            <div className="space-y-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2 p-2 bg-muted/20 rounded hover:bg-muted/40 transition-colors">
                <div className="w-1.5 h-1.5 bg-secondary rounded-full flex-shrink-0" />
                <p>Initiated 2 negotiations in the last hour</p>
              </div>
              <div className="flex items-center gap-2 p-2 bg-muted/20 rounded hover:bg-muted/40 transition-colors">
                <div className="w-1.5 h-1.5 bg-primary rounded-full flex-shrink-0" />
                <p>Successfully settled 1 trade today</p>
              </div>
              <div className="flex items-center gap-2 p-2 bg-muted/20 rounded hover:bg-muted/40 transition-colors">
                <div className="w-1.5 h-1.5 bg-accent rounded-full flex-shrink-0" />
                <p>Connected to 2 active counterparties</p>
              </div>
              <div className="flex items-center gap-2 p-2 bg-muted/20 rounded hover:bg-muted/40 transition-colors">
                <div className="w-1.5 h-1.5 bg-primary/60 rounded-full flex-shrink-0" />
                <p className="font-mono text-xs">Security checksum: 0x{Math.random().toString(16).slice(2, 10)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </NexusLayout>
  );
}
