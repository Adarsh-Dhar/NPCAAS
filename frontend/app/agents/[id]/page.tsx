'use client';

import Link from 'next/link';
import { NexusLayout } from '@/components/nexus-layout';
import { useNexus } from '@/lib/nexus-context';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { use } from 'react';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { agents, trades, serverOnline } = useNexus();
  const agent = agents.find(a => a.agentId === id);
  const agentTrades = trades.filter(t => t.brokerName === agent?.brokerName || t.agents?.includes(agent?.brokerName || ''));

  const statusColor = {
    NEGOTIATING: 'text-secondary border-secondary/50 bg-secondary/10',
    SETTLING: 'text-primary border-primary/50 bg-primary/10',
    IDLE: 'text-muted-foreground border-border bg-muted/5',
  };

  if (!serverOnline) {
    return (
      <NexusLayout>
        <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin opacity-40" />
          <p>Connecting to server…</p>
        </div>
      </NexusLayout>
    );
  }

  if (!agent) {
    return (
      <NexusLayout>
        <div className="flex flex-col h-full overflow-auto">
          <div className="border-b border-border/20 px-6 py-5 flex-shrink-0 bg-gradient-to-r from-primary/5 to-secondary/5 backdrop-blur-sm rounded-lg mb-6">
            <div className="flex items-center gap-3">
              <Link href="/agents" className="hover:text-primary transition-colors text-muted-foreground">
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <h2 className="text-lg font-bold text-foreground uppercase tracking-wider">Agent Not Found</h2>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center flex-1 gap-3 text-muted-foreground">
            <p className="text-sm">Agent ID not found in active pools</p>
            <Link href="/agents" className="text-primary text-sm hover:underline">← Back to agents</Link>
          </div>
        </div>
      </NexusLayout>
    );
  }

  const sc = statusColor[agent.status] || statusColor.IDLE;
  const progressPercent = agent.maxLimit > 0
    ? Math.min(100, (agent.sessionLimit / agent.maxLimit) * 100)
    : 0;

  return (
    <NexusLayout>
      <div className="flex flex-col h-full overflow-auto">
        <div className="border-b border-border/20 px-6 py-5 flex-shrink-0 bg-gradient-to-r from-primary/5 to-secondary/5 backdrop-blur-sm rounded-lg mb-6">
          <div className="flex items-center gap-3 mb-1">
            <Link href="/agents" className="hover:text-primary transition-colors text-muted-foreground">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h2 className="text-lg font-bold text-foreground uppercase tracking-wider">Agent Details</h2>
          </div>
          <p className="text-xs text-muted-foreground mt-2 ml-7">Live broker configuration and session metrics</p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto pr-4">
          {/* Main info */}
          <div className="border border-border/40 rounded-lg p-5 bg-card/50 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-foreground font-mono">{agent.brokerName}</h3>
              <span className={`text-xs px-3 py-1.5 border rounded-full font-semibold ${sc}`}>
                {agent.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-muted/30 rounded p-3">
                <div className="text-muted-foreground text-xs uppercase tracking-wider mb-2 font-medium">Pool</div>
                <div className="font-bold text-foreground font-mono text-sm">{agent.poolId || 'unassigned'}</div>
              </div>
              <div className="bg-muted/30 rounded p-3">
                <div className="text-muted-foreground text-xs uppercase tracking-wider mb-2 font-medium">Session Capacity</div>
                <div className="text-primary font-bold font-mono">{agent.sessionLimit}%</div>
              </div>
              <div className="bg-muted/30 rounded p-3">
                <div className="text-muted-foreground text-xs uppercase tracking-wider mb-2 font-medium">Agent ID</div>
                <div className="text-accent font-bold font-mono text-xs truncate">{agent.agentId || 'N/A'}</div>
              </div>
              <div className="bg-muted/30 rounded p-3">
                <div className="text-muted-foreground text-xs uppercase tracking-wider mb-2 font-medium">Last Active</div>
                <div className="text-foreground font-medium">{timeAgo(agent.lastActive)}</div>
              </div>
            </div>

            <div className="mt-5 pt-5 border-t border-border/20">
              <div className="text-muted-foreground text-xs uppercase tracking-wider mb-3 font-medium">
                Capacity Utilization
              </div>
              <div className="w-full h-3 bg-muted rounded-full overflow-hidden border border-border/20">
                <div
                  className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-700"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2 font-mono">{Math.round(progressPercent)}% capacity used</p>
            </div>
          </div>

          {/* Session info */}
          <div className="border border-border/40 rounded-lg p-5 bg-card/50 backdrop-blur-sm">
            <h4 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wider">Session Details</h4>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-border/20">
                <span className="text-muted-foreground">Session ID</span>
                <span className="font-mono text-foreground truncate max-w-48">{agent.sessionId || 'N/A'}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/20">
                <span className="text-muted-foreground">Joined Pool</span>
                <span className="font-mono text-foreground">{new Date(agent.joinedAt).toLocaleTimeString()}</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-muted-foreground">Trades Settled</span>
                <span className="font-mono text-primary font-bold">{agentTrades.length}</span>
              </div>
            </div>
          </div>

          {/* Recent trades */}
          {agentTrades.length > 0 && (
            <div className="border border-border/40 rounded-lg p-5 bg-card/50 backdrop-blur-sm">
              <h4 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wider">
                Recent Trades ({agentTrades.length})
              </h4>
              <ul className="space-y-4">
                {agentTrades.slice(0, 5).map((trade, i) => (
                  <li key={trade.id || `${trade.asset || 'trade'}-${i}`}>
                    <Link href={`/trades/${trade.id}`} className="block">
                      <div className="flex justify-between items-start border-b border-green-900/50 pb-3 hover:border-green-700/70 transition-colors">
                        <div>
                          <div className="text-white font-bold">
                            {trade.asset || 'Real-Time Sentiment Dataset'}
                          </div>

                          <div className="text-xs text-green-500 mt-1 flex items-center gap-2 flex-wrap">
                            <span className="bg-green-950 px-1 border border-green-800 rounded">
                              BUYER: {trade.buyer || 'QuantBot-Alpha'}
                            </span>
                            <span className="text-green-700">⟷</span>
                            <span className="bg-green-950 px-1 border border-green-800 rounded">
                              SELLER: {trade.seller || 'DataOracle_7'}
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-green-400 font-mono">
                            ${trade.price || '0.50'} USDC
                          </div>
                          <div className="text-xs text-green-800 mt-1">
                            {trade.timestamp || trade.createdAt || '—'}
                          </div>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </NexusLayout>
  );
}