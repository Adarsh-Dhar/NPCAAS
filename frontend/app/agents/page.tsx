import { NexusLayout } from '@/components/nexus-layout';
import { agents } from '@/lib/mock-data';
import { AgentCard } from '@/components/agent-card';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function AgentsPage() {
  return (
    <NexusLayout>
      <div className="flex flex-col h-full">
        <div className="border-b border-border/20 px-6 py-5 flex-shrink-0 bg-gradient-to-r from-primary/5 to-secondary/5 backdrop-blur-sm rounded-lg mb-6">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 bg-secondary rounded-full animate-pulse" />
            <h2 className="text-lg font-bold text-foreground uppercase tracking-wider">
              All Deployed Agents
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Complete overview of your active broker network</p>
        </div>

        <ScrollArea className="flex-1">
          <div className="grid grid-cols-2 gap-4 pr-4">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        </ScrollArea>
      </div>
    </NexusLayout>
  );
}
