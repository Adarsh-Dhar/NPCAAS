'use client';

import { NexusHeader } from './header/nexus-header';
import { AgentFleet } from './sidebar/agent-fleet';

export function NexusLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-screen bg-background text-foreground overflow-hidden">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10">
        <NexusHeader />
      </div>

      {/* Main content area below header */}
      <div className="flex w-full pt-32">
        {/* Sidebar - 30% */}
        <div className="w-[30%] border-r border-border/30 overflow-hidden flex flex-col bg-gradient-to-b from-card/50 to-background/30 backdrop-blur-sm">
          <AgentFleet />
        </div>

        {/* Main feed - 70% */}
        <div className="w-[70%] overflow-hidden p-6 bg-gradient-to-br from-background via-background to-primary/5">
          {children}
        </div>
      </div>
    </div>
  );
}
