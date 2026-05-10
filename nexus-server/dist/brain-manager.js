"use strict";
/**
 * brain-manager.ts — Plugin-based per-agent intelligence loader
 *
 * Each agent has its own brain in .agents/plugins/<agentName>/brain.js
 * The registry at .agents/registry.json maps names to plugin dirs.
 *
 * Brain plugins must export: { decide, buildOpeningMove, getMetadata }
 * See .agents/AGENT_API.md for the full contract.
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// ─── Registry ────────────────────────────────────────────────────────────────
const REGISTRY_PATH = path_1.default.resolve(__dirname, '..', '..', '.agents', 'registry.json');
const PLUGINS_ROOT = path_1.default.resolve(__dirname, '..', '..', '.agents', 'plugins');
function loadRegistry() {
    try {
        const raw = fs_1.default.readFileSync(REGISTRY_PATH, 'utf8');
        return JSON.parse(raw).agents || {};
    }
    catch (_a) {
        return {};
    }
}
function normalizePluginModule(moduleExport) {
    var _a;
    const candidate = (_a = moduleExport === null || moduleExport === void 0 ? void 0 : moduleExport.default) !== null && _a !== void 0 ? _a : moduleExport;
    if (!candidate || typeof candidate !== 'object')
        return null;
    const plugin = candidate;
    if (typeof plugin.decide !== 'function' && typeof plugin.buildOpeningMove !== 'function') {
        return null;
    }
    return plugin;
}
function resolvePluginBrainPath(agentName) {
    const registry = loadRegistry();
    const entry = registry[agentName];
    const candidates = [];
    if (entry === null || entry === void 0 ? void 0 : entry.pluginDir) {
        const pluginDir = path_1.default.isAbsolute(entry.pluginDir)
            ? entry.pluginDir
            : path_1.default.resolve(path_1.default.dirname(REGISTRY_PATH), entry.pluginDir);
        candidates.push(path_1.default.join(pluginDir, 'brain.js'));
    }
    candidates.push(path_1.default.join(PLUGINS_ROOT, agentName, 'brain.js'));
    return candidates.find((candidate) => fs_1.default.existsSync(candidate)) || null;
}
function loadPlugin(agentName) {
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
    }
    catch (e) {
        console.warn(`[BrainManager] Error loading plugin ${brainPath}:`, e.message);
        return null;
    }
}
function loadAgentConfig(agentName) {
    const registry = loadRegistry();
    const entry = registry[agentName];
    const pluginDir = entry
        ? path_1.default.isAbsolute(entry.pluginDir)
            ? entry.pluginDir
            : path_1.default.resolve(path_1.default.dirname(REGISTRY_PATH), entry.pluginDir)
        : path_1.default.join(PLUGINS_ROOT, agentName);
    const configPath = path_1.default.join(pluginDir, 'config.json');
    if (!fs_1.default.existsSync(configPath))
        return {};
    try {
        return JSON.parse(fs_1.default.readFileSync(configPath, 'utf8'));
    }
    catch (_a) {
        return {};
    }
}
// ─── BrainManager ────────────────────────────────────────────────────────────
class BrainManager {
    constructor(io, serverUrl) {
        /** agentName → merged runtime config */
        this.runtimeConfigs = new Map();
        /** agentName → negotiation round counter */
        this.roundCounters = new Map();
        this.io = io;
        this.serverUrl = serverUrl || `http://localhost:${process.env.PORT || 5000}`;
    }
    /**
     * Called by the server when a broker joins a pool.
     * Merges broker registration data with the plugin's config.json.
     */
    registerAgent(poolId, broker) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        const name = String(broker.brokerName || '');
        if (!name)
            return;
        // Load static config from the plugin directory
        const pluginConfig = loadAgentConfig(name);
        // Merge: broker's brainConfig overrides plugin config.json
        const brainOverrides = broker.brainConfig || {};
        const config = {
            brokerName: name,
            agentId: broker.agentId,
            poolId,
            role: (_b = (_a = brainOverrides.role) !== null && _a !== void 0 ? _a : pluginConfig.role) !== null && _b !== void 0 ? _b : 'buyer',
            hiddenFloor: (_d = (_c = brainOverrides.hiddenFloor) !== null && _c !== void 0 ? _c : pluginConfig.hiddenFloor) !== null && _d !== void 0 ? _d : 0.45,
            hiddenCeiling: (_f = (_e = brainOverrides.hiddenCeiling) !== null && _e !== void 0 ? _e : pluginConfig.hiddenCeiling) !== null && _f !== void 0 ? _f : 0.75,
            asset: (_h = (_g = brainOverrides.asset) !== null && _g !== void 0 ? _g : pluginConfig.asset) !== null && _h !== void 0 ? _h : 'Real-Time Sentiment Dataset',
            maxRounds: (_k = (_j = brainOverrides.maxRounds) !== null && _j !== void 0 ? _j : pluginConfig.maxRounds) !== null && _k !== void 0 ? _k : 10,
        };
        this.runtimeConfigs.set(name, config);
        this.roundCounters.set(name, 0);
        // Announce the brain metadata if available
        const plugin = loadPlugin(name);
        if (plugin === null || plugin === void 0 ? void 0 : plugin.getMetadata) {
            const meta = plugin.getMetadata();
            console.log(`[BrainManager] Registered "${name}" with brain: ${meta.name} (${meta.strategy})`);
        }
        else {
            console.log(`[BrainManager] Registered "${name}" — no custom brain found, will skip AI decisions`);
        }
    }
    unregisterAgent(agentName) {
        this.runtimeConfigs.delete(agentName);
        this.roundCounters.delete(agentName);
    }
    /**
     * Emits the opening bid/ask for an agent when it joins a pool.
     */
    emitOpeningMove(poolId, agentName) {
        const config = this.runtimeConfigs.get(agentName);
        if (!config)
            return;
        const plugin = loadPlugin(agentName);
        if (!(plugin === null || plugin === void 0 ? void 0 : plugin.buildOpeningMove))
            return;
        try {
            const move = plugin.buildOpeningMove(config);
            this.io.to(poolId).emit('negotiate', Object.assign(Object.assign({}, move), { poolId, timestamp: new Date().toISOString() }));
            console.log(`[BrainManager] "${agentName}" opening move: ${move.action} @ $${move.amount}`);
        }
        catch (e) {
            console.warn(`[BrainManager] openingMove error for ${agentName}:`, e.message);
        }
    }
    /**
     * Called by the /api/negotiate route when a message arrives.
     * Routes to the correct agent brain.
     */
    handleIncoming(poolId, msg) {
        return __awaiter(this, void 0, void 0, function* () {
            const from = String(msg.from || '');
            const config = this.runtimeConfigs.get(from);
            if (!config)
                return; // no brain registered for this sender
            const plugin = loadPlugin(from);
            if (!(plugin === null || plugin === void 0 ? void 0 : plugin.decide))
                return;
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
                const decision = yield plugin.decide(msg, config, marketContext);
                const ts = new Date().toISOString();
                this.io.to(poolId).emit('pool:negotiation', {
                    poolId, timestamp: ts, from, action: decision.action, amount: decision.amount, isBlurred: true,
                });
                if (decision.action === 'ACCEPT' && decision.amount > 0) {
                    this.roundCounters.set(from, 0);
                    yield this._attemptTrade(poolId, config, decision.amount);
                }
                else if (decision.action === 'REJECT') {
                    this.roundCounters.set(from, 0);
                    this.io.to(poolId).emit('negotiate', {
                        from, action: 'REJECT', amount: 0, reason: decision.reason || 'rejected', poolId, timestamp: ts,
                    });
                }
                else {
                    // COUNTER — broadcast so the counterparty sees it
                    this.io.to(poolId).emit('negotiate', {
                        from, action: 'COUNTER', amount: decision.amount, asset: config.asset, poolId, timestamp: ts,
                    });
                }
            }
            catch (e) {
                console.warn(`[BrainManager] decide() error for ${from}:`, e.message);
            }
        });
    }
    _attemptTrade(poolId, config, price) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const url = `${this.serverUrl.replace(/\/+$/, '')}/api/execute-trade`;
                const res = yield globalThis.fetch(url, {
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
                const body = yield res.text();
                try {
                    JSON.parse(body);
                }
                catch (_a) { }
            }
            catch (e) {
                console.warn(`[BrainManager] _attemptTrade failed for ${config.brokerName}:`, e.message);
            }
        });
    }
    /**
     * Lists all registered agents and their brain metadata.
     * Useful for diagnostics / the UI's settings page.
     */
    listAgents() {
        return Array.from(this.runtimeConfigs.entries()).map(([name, config]) => {
            var _a, _b;
            const plugin = loadPlugin(name);
            const meta = (_b = (_a = plugin === null || plugin === void 0 ? void 0 : plugin.getMetadata) === null || _a === void 0 ? void 0 : _a.call(plugin)) !== null && _b !== void 0 ? _b : { name: 'unknown', description: '', strategy: 'none' };
            return { agentName: name, config, brain: meta };
        });
    }
}
exports.default = BrainManager;
//# sourceMappingURL=brain-manager.js.map