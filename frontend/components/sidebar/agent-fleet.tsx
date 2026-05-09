'use client';

import { agents } from '@/lib/mock-data';
import { AgentCard } from '../agent-card';
import { ScrollArea } from '@/components/ui/scroll-area';

export function AgentFleet() {
  return (
    <div className="flex flex-col h-full pt-4 px-4">
      <div className="pb-4 border-b border-border/20">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 bg-secondary rounded-full animate-pulse" />
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
            Deployed Agents
          </h2>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Active broker fleet</p>
      </div>

      <ScrollArea className="flex-1 mt-4">
        <div className="space-y-3 pr-4">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
