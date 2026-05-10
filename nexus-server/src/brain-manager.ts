/**
 * brain-manager.ts — Plugin-based per-agent intelligence loader
 *
 * Each agent has its own brain in .agents/plugins/<agentName>/brain.js
 * The registry at .agents/registry.json maps names to plugin dirs.
 *
 * Brain plugins must export: { decide, buildOpeningMove, getMetadata }
 * See .agents/AGENT_API.md for the full contract.
 */

import type { Server as SocketServer } from 'socket.io';
import path from 'path';
import fs from 'fs';

// ─── Types ───────────────────────────────────────────────────────────────────

export type AgentConfig = {
  brokerName: string;
  agentId?: string;
  poolId?: string;
  role: 'buyer' | 'seller';
  hiddenFloor: number;
  hiddenCeiling: number;
  asset: string;
  maxRounds?: number;
};

export type NegotiationDecision = {
  action: 'ACCEPT' | 'COUNTER' | 'REJECT';
  amount: number;
  reason?: string;
};

export type OpeningMove = {
  action: 'BID' | 'ASK';
  amount: number;
  asset: string;
  from: string;
};

export type BrainPlugin = {
  decide(msg: any, config: AgentConfig, ctx: any): Promise<NegotiationDecision>;
  buildOpeningMove(config: AgentConfig): OpeningMove;
  getMetadata(): { name: string; description: string; strategy: string };
};

export type BrainModule = Partial<BrainPlugin> & {
  default?: Partial<BrainPlugin>;
};

// ─── Registry ────────────────────────────────────────────────────────────────

const REGISTRY_PATH = path.resolve(__dirname, '..', '..', '.agents', 'registry.json');
const PLUGINS_ROOT  = path.resolve(__dirname, '..', '..', '.agents', 'plugins');

function loadRegistry(): Record<string, { pluginDir: string; enabled: boolean }> {
  try {
    const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
    return JSON.parse(raw).agents || {};
  } catch {
    return {};
  }
}

function normalizePluginModule(moduleExport: unknown): BrainPlugin | null {
  const candidate = (moduleExport as BrainModule | null)?.default ?? moduleExport;
  if (!candidate || typeof candidate !== 'object') return null;

  const plugin = candidate as Partial<BrainPlugin>;
  if (typeof plugin.decide !== 'function' && typeof plugin.buildOpeningMove !== 'function') {
    return null;
  }

  return plugin as BrainPlugin;
}

function resolvePluginBrainPath(agentName: string): string | null {
  const registry = loadRegistry();
  const entry = registry[agentName];

  const candidates: string[] = [];

  if (entry?.pluginDir) {
    const pluginDir = path.isAbsolute(entry.pluginDir)
      ? entry.pluginDir
      : path.resolve(path.dirname(REGISTRY_PATH), entry.pluginDir);
    candidates.push(path.join(pluginDir, 'brain.js'));
  }

  candidates.push(path.join(PLUGINS_ROOT, agentName, 'brain.js'));

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function loadPlugin(agentName: string): BrainPlugin | null {
  const registry = loadRegistry();
  const entry = registry[agentName];

  if (entry && !entry.enabled) {
    return null;
  }

  const brainPath = resolvePluginBrainPath(agentName);
  if (!brainPath) {
    console.warn(`[BrainManager] Brain file not found for ${agentName}`);
    return null;
  }

  try {
    // delete require cache so hot-reloads work during development
    delete require.cache[require.resolve(brainPath)];
    const loaded = normalizePluginModule(require(brainPath));
    if (!loaded) {
      console.warn(`[BrainManager] ${brainPath} does not export a valid plugin interface`);
      return null;
    }
    return loaded;
  } catch (e: any) {
    console.warn(`[BrainManager] Error loading plugin ${brainPath}:`, e.message);
    return null;
  }
}

function loadAgentConfig(agentName: string): Partial<AgentConfig> {
  const registry = loadRegistry();
  const entry = registry[agentName];

  const pluginDir = entry
    ? path.isAbsolute(entry.pluginDir)
      ? entry.pluginDir
      : path.resolve(path.dirname(REGISTRY_PATH), entry.pluginDir)
    : path.join(PLUGINS_ROOT, agentName);

  const configPath = path.join(pluginDir, 'config.json');
  if (!fs.existsSync(configPath)) return {};

  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return {};
  }
}

// ─── BrainManager ────────────────────────────────────────────────────────────

export default class BrainManager {
  io: SocketServer;
  serverUrl: string;
  /** agentName → merged runtime config */
  private runtimeConfigs = new Map<string, AgentConfig>();
  /** agentName → negotiation round counter */
  private roundCounters = new Map<string, number>();

  constructor(io: SocketServer, serverUrl?: string) {
    this.io = io;
    this.serverUrl = serverUrl || `http://localhost:${process.env.PORT || 5000}`;
  }

  /**
   * Called by the server when a broker joins a pool.
   * Merges broker registration data with the plugin's config.json.
   */
  registerAgent(poolId: string, broker: any) {
    const name = String(broker.brokerName || '');
    if (!name) return;

    // Load static config from the plugin directory
    const pluginConfig = loadAgentConfig(name);

    // Merge: broker's brainConfig overrides plugin config.json
    const brainOverrides = broker.brainConfig || {};

    const config: AgentConfig = {
      brokerName: name,
      agentId:    broker.agentId,
      poolId,
      role:         brainOverrides.role         ?? pluginConfig.role         ?? 'buyer',
      hiddenFloor:  brainOverrides.hiddenFloor  ?? pluginConfig.hiddenFloor  ?? 0.45,
      hiddenCeiling: brainOverrides.hiddenCeiling ?? pluginConfig.hiddenCeiling ?? 0.75,
      asset:        brainOverrides.asset        ?? pluginConfig.asset        ?? 'Real-Time Sentiment Dataset',
      maxRounds:    brainOverrides.maxRounds    ?? pluginConfig.maxRounds    ?? 10,
    };

    this.runtimeConfigs.set(name, config);
    this.roundCounters.set(name, 0);

    // Announce the brain metadata if available
    const plugin = loadPlugin(name);
    if (plugin?.getMetadata) {
      const meta = plugin.getMetadata();
      console.log(`[BrainManager] Registered "${name}" with brain: ${meta.name} (${meta.strategy})`);
    } else {
      console.log(`[BrainManager] Registered "${name}" — no custom brain found, will skip AI decisions`);
    }
  }

  unregisterAgent(agentName: string) {
    this.runtimeConfigs.delete(agentName);
    this.roundCounters.delete(agentName);
  }

  /**
   * Emits the opening bid/ask for an agent when it joins a pool.
   */
  emitOpeningMove(poolId: string, agentName: string) {
    const config = this.runtimeConfigs.get(agentName);
    if (!config) return;

    const plugin = loadPlugin(agentName);
    if (!plugin?.buildOpeningMove) return;

    try {
      const move = plugin.buildOpeningMove(config);
      this.io.to(poolId).emit('negotiate', { ...move, poolId, timestamp: new Date().toISOString() });
      console.log(`[BrainManager] "${agentName}" opening move: ${move.action} @ $${move.amount}`);
    } catch (e: any) {
      console.warn(`[BrainManager] openingMove error for ${agentName}:`, e.message);
    }
  }

  /**
   * Called by the /api/negotiate route when a message arrives.
   * Routes to the correct agent brain.
   */
  async handleIncoming(poolId: string, msg: any) {
    const from = String(msg.from || '');
    const config = this.runtimeConfigs.get(from);
    if (!config) return; // no brain registered for this sender

    const plugin = loadPlugin(from);
    if (!plugin?.decide) return;

    // Enforce max-rounds guard
    const rounds = (this.roundCounters.get(from) || 0) + 1;
    this.roundCounters.set(from, rounds);
    if (rounds > (config.maxRounds || 10)) {
      this.roundCounters.set(from, 0);
      this.io.to(poolId).emit('negotiate', {
        from,
        action: 'REJECT',
        amount: 0,
        reason: 'max_rounds_exceeded',
        poolId,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Build market context (can be extended)
    const marketContext = {};

    try {
      const decision = await plugin.decide(msg, config, marketContext);
      const ts = new Date().toISOString();

      this.io.to(poolId).emit('pool:negotiation', {
        poolId, timestamp: ts, from, action: decision.action, amount: decision.amount, isBlurred: true,
      });

      if (decision.action === 'ACCEPT' && decision.amount > 0) {
        this.roundCounters.set(from, 0);
        await this._attemptTrade(poolId, config, decision.amount);
      } else if (decision.action === 'REJECT') {
        this.roundCounters.set(from, 0);
        this.io.to(poolId).emit('negotiate', {
          from, action: 'REJECT', amount: 0, reason: decision.reason || 'rejected', poolId, timestamp: ts,
        });
      } else {
        // COUNTER — broadcast so the counterparty sees it
        this.io.to(poolId).emit('negotiate', {
          from, action: 'COUNTER', amount: decision.amount, asset: config.asset, poolId, timestamp: ts,
        });
      }
    } catch (e: any) {
      console.warn(`[BrainManager] decide() error for ${from}:`, e.message);
    }
  }

  private async _attemptTrade(poolId: string, config: AgentConfig, price: number) {
    try {
      const url = `${this.serverUrl.replace(/\/+$/, '')}/api/execute-trade`;
      const res = await (globalThis as any).fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolId,
          brokerName: config.brokerName,
          buyer: config.role === 'buyer' ? config.brokerName : undefined,
          seller: config.role === 'seller' ? config.brokerName : undefined,
          asset: config.asset,
          price,
          negotiation: { action: 'ACCEPT', amount: price, from: config.brokerName },
        }),
      });
      const body = await res.text();
      try { JSON.parse(body); } catch {}
    } catch (e: any) {
      console.warn(`[BrainManager] _attemptTrade failed for ${config.brokerName}:`, e.message);
    }
  }

  /**
   * Lists all registered agents and their brain metadata.
   * Useful for diagnostics / the UI's settings page.
   */
  listAgents() {
    return Array.from(this.runtimeConfigs.entries()).map(([name, config]) => {
      const plugin = loadPlugin(name);
      const meta = plugin?.getMetadata?.() ?? { name: 'unknown', description: '', strategy: 'none' };
      return { agentName: name, config, brain: meta };
    });
  }
}