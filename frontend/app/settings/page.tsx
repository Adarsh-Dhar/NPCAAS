import Link from 'next/link';
import { NexusLayout } from '@/components/nexus-layout';
import { ArrowLeft } from 'lucide-react';

export default function SettingsPage() {
  return (
    <NexusLayout>
      <div className="flex flex-col h-full overflow-auto">
        <div className="border-b border-border/20 px-6 py-5 flex-shrink-0 bg-gradient-to-r from-primary/5 to-secondary/5 backdrop-blur-sm rounded-lg mb-6">
          <div className="flex items-center gap-3 mb-1">
            <Link href="/" className="hover:text-primary transition-colors text-muted-foreground hover:text-primary/80">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h2 className="text-lg font-bold text-foreground uppercase tracking-wider">
              Configuration
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mt-2 ml-7">Network, agent & security settings</p>
        </div>

        <div className="flex-1 space-y-4 max-w-2xl overflow-y-auto pr-4">
          <div className="border border-border/40 rounded-lg p-5 bg-card/50 backdrop-blur-sm">
            <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wider">
              Network Settings
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between pb-3 border-b border-border/20">
                <span className="text-foreground font-medium">Connection Status</span>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                  <span className="text-primary font-semibold">Connected</span>
                </div>
              </div>
              <div className="flex items-center justify-between pb-3 border-b border-border/20">
                <span className="text-foreground font-medium">Network ID</span>
                <span className="text-muted-foreground font-mono">mainnet-8219</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-foreground font-medium">Enclave Pool</span>
                <span className="text-accent font-mono">POOL-8219</span>
              </div>
            </div>
          </div>

          <div className="border border-border/40 rounded-lg p-5 bg-card/50 backdrop-blur-sm">
            <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wider">
              Agent Configuration
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between pb-3 border-b border-border/20">
                <span className="text-foreground font-medium">Active Brokers</span>
                <span className="text-primary font-bold">3</span>
              </div>
              <div className="flex items-center justify-between pb-3 border-b border-border/20">
                <span className="text-foreground font-medium">Max Session Limit</span>
                <span className="text-secondary font-bold">100%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-foreground font-medium">Auto-Settlement</span>
                <span className="text-accent font-bold">ENABLED</span>
              </div>
            </div>
          </div>

          <div className="border border-border/40 rounded-lg p-5 bg-card/50 backdrop-blur-sm">
            <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wider">
              Security
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between pb-3 border-b border-border/20">
                <span className="text-foreground font-medium">Encryption</span>
                <span className="text-primary font-semibold">AES-256</span>
              </div>
              <div className="flex items-center justify-between pb-3 border-b border-border/20">
                <span className="text-foreground font-medium">Vault Access</span>
                <span className="text-accent font-semibold">MFA ENABLED</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-foreground font-medium">Last Security Audit</span>
                <span className="text-muted-foreground font-mono">2 hours ago</span>
              </div>
            </div>
          </div>

          <div className="border border-border/40 rounded-lg p-5 bg-gradient-to-br from-primary/5 to-secondary/5 backdrop-blur-sm">
            <h3 className="text-sm font-bold text-foreground mb-3 uppercase tracking-wider">
              About NEXUS OTC
            </h3>
            <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
              <p>
                NEXUS is a decentralized peer-to-peer OTC trading network designed for secure,
                private transactions between autonomous trading agents.
              </p>
              <p className="pt-2">
                Version: <span className="text-primary font-semibold">v1.0.0-beta</span>
              </p>
              <p>
                Protocol: <span className="text-secondary font-semibold">EnclaveMesh Protocol v2</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </NexusLayout>
  );
}
