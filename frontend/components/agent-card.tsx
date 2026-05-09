'use client';

import Link from 'next/link';
import { Broker } from '@/lib/api';

const STATUS_COLORS = {
  NEGOTIATING: 'text-secondary border-secondary/50 bg-secondary/10',
  SETTLING: 'text-primary border-primary/50 bg-primary/10',
  IDLE: 'text-muted-foreground border-border bg-muted/5',
};

const STATUS_DOT = {
  NEGOTIATING: 'bg-secondary animate-pulse',
  SETTLING: 'bg-primary animate-pulse',
  IDLE: 'bg-muted-foreground/40',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export function AgentCard({ agent }: { agent: Broker }) {
  const statusColor = STATUS_COLORS[agent.status] || STATUS_COLORS.IDLE;
  const dotColor = STATUS_DOT[agent.status] || STATUS_DOT.IDLE;
  const progressPercent = agent.maxLimit > 0
    ? Math.min(100, (agent.sessionLimit / agent.maxLimit) * 100)
    : 0;

  return (
    <Link href={`/agents/${agent.agentId}`}>
      <div className="p-4 border border-border/40 rounded-lg bg-card/50 hover:bg-card/80 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10 transition-all cursor-pointer group backdrop-blur-sm">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
            <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate font-mono">
              {agent.brokerName}
            </h3>
          </div>
          <span className={`text-xs px-2 py-0.5 border rounded-full font-semibold flex-shrink-0 ml-2 ${statusColor}`}>
            {agent.status}
          </span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-medium">Session Capacity</span>
            <span className="text-primary font-bold font-mono">{agent.sessionLimit}%</span>
          </div>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden border border-border/20">
            <div
              className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-700"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-mono truncate">{agent.poolId || 'unassigned'}</span>
            <span>{timeAgo(agent.lastActive)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}