'use client';

import { useNexus } from '@/lib/nexus-context';
import { AgentCard } from '@/components/agent-card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2 } from 'lucide-react';

export function AgentFleet() {
  const { agents, serverOnline } = useNexus();

  return (
    <div className="flex flex-col h-full pt-4 px-4">
      <div className="pb-4 border-b border-border/20">
        <div className="flex items-center gap-2 mb-1">
          <div className={`w-2 h-2 rounded-full ${agents.length > 0 ? 'bg-secondary animate-pulse' : 'bg-muted'}`} />
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
            Deployed Agents
          </h2>
          {agents.length > 0 && (
            <span className="ml-auto text-xs text-muted-foreground font-mono">{agents.length}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">Active broker fleet</p>
      </div>

      <ScrollArea className="flex-1 mt-4">
        {!serverOnline ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
            <Loader2 className="w-6 h-6 animate-spin opacity-40" />
            <p className="text-xs text-center">Connecting to Nexus server…</p>
            <p className="text-xs text-center opacity-60 font-mono">localhost:3000</p>
          </div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
            <div className="w-8 h-8 border border-border/40 rounded-full flex items-center justify-center">
              <div className="w-2 h-2 bg-muted rounded-full" />
            </div>
            <p className="text-xs text-center">No agents deployed</p>
            <p className="text-xs text-center opacity-60">Run nexus CLI to deploy brokers</p>
          </div>
        ) : (
          <div className="space-y-3 pr-4">
            {agents.map((agent) => (
              <AgentCard key={`${agent.agentId}-${agent.poolId}`} agent={agent} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}