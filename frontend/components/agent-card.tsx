'use client';

import Link from 'next/link';
import { Agent } from '@/lib/types';

const STATUS_COLORS = {
  NEGOTIATING: 'text-secondary border-secondary/50 bg-secondary/10',
  SETTLING: 'text-primary border-primary/50 bg-primary/10',
  IDLE: 'text-muted-foreground border-border bg-muted/5',
};

export function AgentCard({ agent }: { agent: Agent }) {
  const statusColor = STATUS_COLORS[agent.status];
  const progressPercent = (agent.sessionLimit / agent.maxLimit) * 100;

  return (
    <Link href={`/agents/${agent.id}`}>
      <div className="p-4 border border-border/40 rounded-lg bg-card/50 hover:bg-card/80 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10 transition-all cursor-pointer group backdrop-blur-sm">
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate">{agent.name}</h3>
          <span className={`text-xs px-2.5 py-1.5 border rounded-full font-semibold ${statusColor}`}>
            {agent.status}
          </span>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-medium">Session Capacity</span>
            <span className="text-primary font-bold">{agent.sessionLimit}%</span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden border border-border/20">
            <div
              className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="text-xs text-muted-foreground">Last active: {agent.lastActive}</div>
        </div>
      </div>
    </Link>
  );
}
