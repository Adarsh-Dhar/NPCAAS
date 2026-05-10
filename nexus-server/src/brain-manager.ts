import type { Server as SocketServer } from 'socket.io';

const { runBrain, buildInitialAsk, buildInitialBid } = require('../../.nexus-client/economic-engine.js');

type AgentConfig = {
  brokerName: string;
  agentId?: string;
  role?: 'buyer' | 'seller';
  hiddenFloor?: number;
  hiddenCeiling?: number;
  asset?: string;
  model?: string;
  maxRounds?: number;
};

export default class BrainManager {
  io: SocketServer;
  agents: Map<string, AgentConfig>;
  serverUrl: string;

  constructor(io: SocketServer, serverUrl?: string) {
    this.io = io;
    this.agents = new Map();
    this.serverUrl = serverUrl || (process.env.NEXUS_SERVER_URL || `http://localhost:${process.env.PORT || 5000}`);
  }

  registerAgent(poolId: string, broker: any) {
    const name = String(broker.brokerName || broker.name || 'unknown');
    const cfg: AgentConfig = {
      brokerName: name,
      agentId: broker.agentId,
      role: (broker.brainConfig && broker.brainConfig.role) || (broker.role as any) || 'buyer',
      hiddenFloor: broker.brainConfig?.hiddenFloor ?? broker.hiddenFloor ?? 0.45,
      hiddenCeiling: broker.brainConfig?.hiddenCeiling ?? broker.hiddenCeiling ?? 0.75,
      asset: broker.brainConfig?.asset ?? 'Real-Time Sentiment Dataset',
      model: broker.brainConfig?.model,
      maxRounds: broker.brainConfig?.maxRounds || 10,
    };
    this.agents.set(name, cfg);
  }

  unregisterAgent(agentName: string) {
    this.agents.delete(agentName);
  }

  async handleIncoming(poolId: string, msg: any) {
    const from = String(msg.from || msg.broker || '');
    const cfg = this.agents.get(from);
    if (!cfg) return; // no brain configured for this agent

    try {
      // run the brain with incoming message and agent-specific config
      const decision = await runBrain(msg, cfg);

      // emit a more detailed negotiation feed item for UI
      const ts = new Date().toISOString();
      this.io.to(poolId).emit('pool:negotiation', {
        poolId,
        timestamp: ts,
        from,
        action: decision.action,
        amount: decision.amount,
        isBlurred: true,
      });

      // If brain accepts, attempt to execute a trade (fire-and-forget)
      if (decision.action === 'ACCEPT' && typeof decision.amount === 'number' && decision.amount > 0) {
        try {
          const payload = {
            poolId,
            brokerName: cfg.brokerName,
            buyer: cfg.role === 'buyer' ? cfg.brokerName : undefined,
            seller: cfg.role === 'seller' ? cfg.brokerName : undefined,
            asset: cfg.asset,
            price: decision.amount,
            negotiation: { action: 'ACCEPT', amount: decision.amount, from: cfg.brokerName },
          };

          // call local execute-trade endpoint to follow same settlement flow
          const url = `${this.serverUrl.replace(/\/\/$/, '')}/api/execute-trade`;
          // use global fetch (Node 18+) or polyfilled fetch
          const res = await (globalThis as any).fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          // consume response for logging; actual emission will be handled by server
          const body = await res.text();
          try { JSON.parse(body); } catch {}
        } catch (e) {
          // swallow; server will still show negotiation
          console.warn('[BrainManager] execute-trade failed', e && (e as Error).message);
        }
      }
    } catch (err: any) {
      console.warn('[BrainManager] runBrain error for', from, err && err.message);
    }
  }
}
