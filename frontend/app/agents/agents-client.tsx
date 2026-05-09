'use client';

import { useNexus } from '@/lib/nexus-context';
import { AgentCard } from '@/components/agent-card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2 } from 'lucide-react';

export function AgentsClient() {
  const { agents, serverOnline, pools } = useNexus();

  const negotiating = agents.filter(a => a.status === 'NEGOTIATING').length;
  const settling = agents.filter(a => a.status === 'SETTLING').length;

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border/20 px-6 py-5 flex-shrink-0 bg-gradient-to-r from-primary/5 to-secondary/5 backdrop-blur-sm rounded-lg mb-6">
        <div className="flex items-center gap-2 mb-1">
          <div className={`w-2 h-2 rounded-full ${agents.length > 0 ? 'bg-secondary animate-pulse' : 'bg-muted-foreground/40'}`} />
          <h2 className="text-lg font-bold text-foreground uppercase tracking-wider">
            All Deployed Agents
          </h2>
          <span className="ml-auto text-sm font-mono text-muted-foreground">{agents.length} total</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Complete overview of your active broker network</p>

        {agents.length > 0 && (
          <div className="flex gap-4 mt-3 text-xs">
            <span className="text-secondary font-semibold">{negotiating} NEGOTIATING</span>
            <span className="text-primary font-semibold">{settling} SETTLING</span>
            <span className="text-muted-foreground">{agents.length - negotiating - settling} IDLE</span>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        {!serverOnline ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <Loader2 className="w-8 h-8 animate-spin opacity-40" />
            <p className="text-sm">Connecting to Nexus server…</p>
          </div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <div className="w-12 h-12 border border-border/30 rounded-full flex items-center justify-center">
              <div className="w-3 h-3 bg-muted rounded-full" />
            </div>
            <p className="text-sm font-medium">No agents deployed yet</p>
            <div className="text-xs text-center opacity-60 max-w-64 space-y-1">
              <p>Deploy brokers using the nexus CLI:</p>
              <code className="block bg-muted/30 rounded px-3 py-1.5 font-mono text-xs mt-2">
                nexus deploy-broker --pool-id POOL-XXXX --broker-name QuantBot
              </code>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 pr-4">
            {agents.map((agent) => (
              <AgentCard key={`${agent.agentId}-${agent.poolId}`} agent={agent} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}