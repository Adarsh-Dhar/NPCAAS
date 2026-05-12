#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');

function loadEnvFile(filePath, override = false) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex === -1) continue;
    const key = trimmed.slice(0, equalIndex).trim();
    let value = trimmed.slice(equalIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (override || process.env[key] == null) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.resolve(__dirname, '..', '.env'));
loadEnvFile(path.resolve(__dirname, '.env'), true);

if (process.env.NEXUS_ALLOW_KPASS_BASE_URL_OVERRIDE !== '1') {
  delete process.env.KITE_PASSPORT_BASE_URL;
}

const SERVER_BASE_URL = (process.env.NEXUS_PUBLIC_URL || process.env.NEXUS_SERVER_URL || 'http://localhost:5000').replace(/\/+$/, '');
const DEFAULT_MAX_PER_TX = process.env.NEXUS_MAX_PER_TX || '50.00';
const DEFAULT_MAX_TOTAL = process.env.NEXUS_MAX_TOTAL || '500.00';
const DEFAULT_TTL = process.env.NEXUS_SESSION_TTL || '1h';
const DEFAULT_ASSETS = process.env.NEXUS_ASSETS || 'USDC';
const DEFAULT_PAYMENT = process.env.NEXUS_PAYMENT || 'x402';
const DEFAULT_KPASS_TIMEOUT_MS = Number(process.env.NEXUS_KPASS_TIMEOUT_MS || 5 * 60 * 1000);
const WAIT_KPASS_TIMEOUT_MS = Number(process.env.NEXUS_KPASS_WAIT_TIMEOUT_MS || 30 * 60 * 1000);

const REGISTRY_PATH = path.resolve(__dirname, '..', '.agents', 'registry.json');
const PLUGINS_ROOT = path.resolve(__dirname, '..', '.agents', 'plugins');

// Production mode: kpass integration is REQUIRED, no mock fallback
try {
  execSync('command -v kpass', { stdio: 'ignore', shell: '/bin/bash' });
} catch {
  console.error('[nexus] FATAL: kpass binary not found. Install kpass or set KPASS_BIN. Production mode requires real authentication.');
  process.exit(1);
}

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const LOG_LEVEL = LOG_LEVELS[process.env.NEXUS_LOG_LEVEL] ?? LOG_LEVELS.info;

const log = {
  debug: (...a) => LOG_LEVEL <= 0 && console.debug('[nexus:debug]', ...a),
  info: (...a) => LOG_LEVEL <= 1 && console.log('[nexus]', ...a),
  warn: (...a) => LOG_LEVEL <= 2 && console.warn('[nexus:warn]', ...a),
  error: (...a) => LOG_LEVEL <= 3 && console.error('[nexus:error]', ...a),
  emit: (tag, payload) => console.log(`${tag}: ${typeof payload === 'object' ? JSON.stringify(payload) : payload}`),
};

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\"'\"'")}'`;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const [key, inlineVal] = arg.slice(2).split('=');
    const camel = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (inlineVal !== undefined) args[camel] = inlineVal;
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) args[camel] = argv[++i];
    else args[camel] = true;
  }
  return args;
}

function applyExplicitAgentOverrides(agentConfig, flags = {}) {
  if (flags.role) agentConfig.role = String(flags.role);
  if (flags.hiddenFloor) agentConfig.hiddenFloor = parseFloat(flags.hiddenFloor);
  if (flags.hiddenCeiling) agentConfig.hiddenCeiling = parseFloat(flags.hiddenCeiling);
  if (flags.asset) agentConfig.asset = String(flags.asset);
  if (flags.maxRounds) agentConfig.maxRounds = Number(flags.maxRounds);

  if (process.env.NEXUS_ALLOW_ENV_AGENT_OVERRIDES !== '1') return;

  if (process.env.NEXUS_ROLE) agentConfig.role = process.env.NEXUS_ROLE;
  if (process.env.NEXUS_HIDDEN_FLOOR) agentConfig.hiddenFloor = parseFloat(process.env.NEXUS_HIDDEN_FLOOR);
  if (process.env.NEXUS_HIDDEN_CEILING) agentConfig.hiddenCeiling = parseFloat(process.env.NEXUS_HIDDEN_CEILING);
  if (process.env.NEXUS_ASSET) agentConfig.asset = process.env.NEXUS_ASSET;
  if (process.env.NEXUS_MAX_ROUNDS) agentConfig.maxRounds = Number(process.env.NEXUS_MAX_ROUNDS);
}

function parseTtlSeconds(ttl) {
  const value = String(ttl ?? DEFAULT_TTL).trim().toLowerCase();
  const match = value.match(/^(\d+(?:\.\d+)?)([smhd])?$/);
  if (!match) throw new Error(`Invalid TTL value: ${ttl}`);
  const amount = Number(match[1]);
  const unit = match[2] || 's';
  return Math.round(amount * { s: 1, m: 60, h: 3600, d: 86400 }[unit]);
}

function loadRegistry() {
  try {
    const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
    return JSON.parse(raw).agents || {};
  } catch (err) {
    throw new Error(`Cannot read registry at ${REGISTRY_PATH}: ${err.message}`);
  }
}

function resolvePluginDir(entry, brokerName) {
  if (entry?.pluginDir) {
    return path.isAbsolute(entry.pluginDir)
      ? entry.pluginDir
      : path.resolve(path.dirname(REGISTRY_PATH), entry.pluginDir);
  }
  return path.join(PLUGINS_ROOT, brokerName);
}

function normalizeBrainModule(moduleExport) {
  const candidate = moduleExport?.default ?? moduleExport;
  if (!candidate || typeof candidate !== 'object') return null;
  if (typeof candidate.decide !== 'function' || typeof candidate.buildOpeningMove !== 'function') return null;
  return candidate;
}

function loadAgentPlugin(brokerName, flags = {}) {
  const registry = loadRegistry();
  const entry = registry[brokerName];
  if (!entry) throw new Error(`Agent "${brokerName}" not found in ${REGISTRY_PATH}.`);
  if (!entry.enabled) throw new Error(`Agent "${brokerName}" is disabled in registry.json.`);

  const pluginDir = resolvePluginDir(entry, brokerName);
  const brainPath = path.join(pluginDir, 'brain.js');
  const configPath = path.join(pluginDir, 'config.json');
  if (!fs.existsSync(brainPath)) throw new Error(`Brain file not found: ${brainPath}`);
  if (!fs.existsSync(configPath)) throw new Error(`Config file not found: ${configPath}`);

  delete require.cache[require.resolve(brainPath)];
  const brain = normalizeBrainModule(require(brainPath));
  if (!brain) throw new Error(`Invalid brain module at ${brainPath}.`);

  const rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const agentConfig = {
    brokerName,
    role: String(rawConfig.role || 'buyer'),
    hiddenFloor: Number(rawConfig.hiddenFloor ?? 0.45),
    hiddenCeiling: Number(rawConfig.hiddenCeiling ?? 0.75),
    asset: String(rawConfig.asset || 'Real-Time Sentiment Dataset'),
    maxRounds: Number(rawConfig.maxRounds ?? 10),
    sessionTtl: rawConfig.sessionTtl,
  };

  applyExplicitAgentOverrides(agentConfig, flags);

  const metadata = typeof brain.getMetadata === 'function'
    ? brain.getMetadata()
    : { name: brokerName, description: '', strategy: 'unknown' };

  log.info(`Plugin loaded: "${brokerName}" → ${metadata.name} (${metadata.strategy})`);
  return { brain, agentConfig, metadata };
}

async function apiFetch(urlPath, options = {}) {
  const url = `${SERVER_BASE_URL}${urlPath}`;
  let res;
  try {
    res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
  } catch (err) {
    throw new Error(`Network error reaching ${url}: ${err.message}`);
  }

  let body;
  try {
    body = await res.json();
  } catch {
    body = await res.text().catch(() => '(empty body)');
  }

  if (res.status === 402) {
    const error = new Error(`Server 402 on ${urlPath}`);
    error.body = body;
    throw error;
  }

  if (!res.ok) throw new Error(`Server ${res.status} on ${urlPath}: ${JSON.stringify(body)}`);
  return body;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireField(obj, keys, label) {
  for (const key of keys) {
    if (obj[key] != null) return obj[key];
  }
  throw new Error(`Missing field in ${label}: ${JSON.stringify(obj)}`);
}

function parseKpassJSON(raw, hint) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${hint} returned non-JSON output:\n${raw}`);
  }
}

function shell(cmd, { timeoutMs = DEFAULT_KPASS_TIMEOUT_MS } = {}) {
  try {
    return execSync(cmd, { stdio: ['inherit', 'pipe', 'pipe'], timeout: timeoutMs, shell: '/bin/bash' })
      .toString()
      .trim();
  } catch (err) {
    const stderr = err.stderr?.toString().trim() || '';
    const stdout = err.stdout?.toString().trim() || '';
    throw new Error(`kpass command failed:\n  $ ${cmd}\n  ${stderr || stdout || err.message}`);
  }
}


function kpass_register() {
  return shell('kpass agent:register --type "nexus-broker" --output json');
}

function kpass_sessionCreate(delegation) {
  return shell(`kpass agent:session create --delegation ${shellQuote(delegation)} --output json`);
}

function kpass_sessionStatus(requestId) {
  return shell(`kpass agent:session status --request-id ${requestId} --wait --output json`, { timeoutMs: WAIT_KPASS_TIMEOUT_MS });
}

function kpass_sessionList(agentId) {
  return shell(`kpass agent:session list --agent-id ${agentId} --output json --no-interactive`);
}

function kpass_sessionRevoke(sessionId) {
  shell(`kpass agent:session revoke --session-id ${sessionId} --no-interactive`);
  return '';
}

function kpass_sessionExecute({ url, method = 'POST', headers = {}, body, sessionId }) {
  const parts = [
    'kpass agent:session execute',
    `--url ${shellQuote(url)}`,
    `--method ${shellQuote(method)}`,
    `--headers ${shellQuote(JSON.stringify(headers))}`,
    `--body ${shellQuote(JSON.stringify(body))}`,
  ];
  if (sessionId) parts.push(`--session-id ${shellQuote(sessionId)}`);
  parts.push('--output json');
  return shell(parts.join(' '), { timeoutMs: WAIT_KPASS_TIMEOUT_MS });
}

async function executeTrade(poolId, incomingMsg, context) {
  const tradePoolId = poolId || context.poolId || incomingMsg?.poolId;
  if (!tradePoolId) throw new Error('Cannot execute trade without poolId');

  const { brokerName, agentConfig, sessionId } = context;
  const asset = incomingMsg?.asset || incomingMsg?.instrument || agentConfig.asset || 'Real-Time Sentiment Dataset';
  const rawPrice = incomingMsg?.amount ?? incomingMsg?.price ?? agentConfig.hiddenCeiling;
  const price = String(rawPrice);
  const role = String(agentConfig.role || 'buyer').toLowerCase();
  const counterparty = incomingMsg?.from || incomingMsg?.counterparty || 'DataOracle_7';
  const buyer = role === 'seller' ? counterparty : brokerName;
  const seller = role === 'seller' ? brokerName : counterparty;

  const payload = { poolId: tradePoolId, brokerName, buyer, seller, asset, price, negotiation: incomingMsg };

  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 500;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      let result;

      if (process.env.NEXUS_DIRECT_BYPASS_PAYMENT === '1') {
        result = await apiFetch('/api/execute-trade', {
          method: 'POST',
          headers: { 'X-Payment': `bypass-${sessionId || brokerName}` },
          body: JSON.stringify(payload),
        });
      } else {
        const executeRaw = kpass_sessionExecute({
          url: `${SERVER_BASE_URL}/api/execute-trade`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          sessionId,
        });
        const executeResult = parseKpassJSON(executeRaw, 'agent:session execute');
        result = executeResult.x402?.parsed_response_body || executeResult;
      }

      log.emit('TRADE_EXECUTED', { poolId: tradePoolId, brokerName, buyer, seller, asset, price, success: Boolean(result?.success) });
      return result;
    } catch (err) {
      const message = String(err?.message || err);

      if (message.includes('Server 404 on /api/execute-trade')) {
        throw new Error(`Pool ${tradePoolId} was not found on the server. Create a fresh pool and redeploy the brokers.`);
      }

      if (message.includes('Network error reaching') && attempt < MAX_RETRIES) {
        log.warn(`executeTrade retry ${attempt}/${MAX_RETRIES} after network error: ${message}`);
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }

      throw err;
    }
  }
}

function printUsage() {
  console.log(`
nexus.js — Plugin-loader Edition

COMMANDS
  create-pool
  deploy-broker --pool-id <id> --broker-name <name> [options]
  list-sessions --agent-id <id>
  revoke-session --session-id <id>

The broker name must exist in .agents/registry.json.
Private brain config is loaded locally from .agents/plugins/<agent>/config.json and never sent to the clearinghouse server.
`);
}

function validateEnv(brokerName) {
  const registry = loadRegistry();
  const entry = registry[brokerName];
  if (entry && !entry.enabled) {
    console.error(`[nexus] Agent "${brokerName}" is disabled in registry.json`);
    process.exit(1);
  }
}

async function createPool(flags) {
  if (flags.dryRun) {
    log.emit('POOL_CREATED', 'DRY-RUN-POOL');
    return;
  }
  const data = await apiFetch('/api/create-pool', { method: 'POST' });
  const poolId = requireField(data, ['poolId', 'pool_id', 'id'], 'create-pool response');
  log.emit('POOL_CREATED', poolId);
  return poolId;
}

async function deployBroker(flags) {
  const { poolId, brokerName, dryRun = false } = flags;
  if (!poolId) throw new Error('--pool-id is required');
  if (!brokerName) throw new Error('--broker-name is required');

  const { brain, agentConfig, metadata } = loadAgentPlugin(brokerName, flags);
  if (dryRun) {
    log.warn(`--dry-run: would join pool ${poolId} as ${brokerName}`);
    log.warn(`  plugin: ${metadata.name} | role: ${agentConfig.role} | strategy: ${metadata.strategy}`);
    return { poolId, brokerName };
  }

  const regData = parseKpassJSON(kpass_register(), 'agent:register');
  const registeredAgentId = regData.agent_id || 'agent';
  const agentId = `${registeredAgentId}-${brokerName.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

  const maxPerTx = flags.maxPerTx || process.env.NEXUS_MAX_PER_TX || agentConfig.hiddenCeiling || DEFAULT_MAX_PER_TX;
  const maxTotal = flags.maxTotal || process.env.NEXUS_MAX_TOTAL || DEFAULT_MAX_TOTAL;
  const ttlSeconds = parseTtlSeconds(agentConfig.sessionTtl || flags.ttl || DEFAULT_TTL);
  const delegation = JSON.stringify({
    task: { summary: `Autonomous OTC trading: ${brokerName} in pool ${poolId}` },
    payment_policy: {
      allowed_payment_approaches: [flags.payment || DEFAULT_PAYMENT],
      assets: [flags.assets || DEFAULT_ASSETS],
      max_amount_per_tx: String(maxPerTx),
      max_total_amount: String(maxTotal),
      ttl_seconds: ttlSeconds,
    },
  });

  let sessionId = flags.sessionId;
  if (!sessionId) {
    const sessData = parseKpassJSON(kpass_sessionCreate(delegation), 'agent:session create');
    if (sessData.approval_url) {
      log.emit('SESSION_APPROVAL_REQUIRED', {
        brokerName,
        approvalUrl: sessData.approval_url,
        requestId: sessData.request_id || sessData.requestId,
        expiresAt: sessData.expires_at,
      });
    }
    const requestId = sessData.request_id || sessData.requestId;
    sessionId = sessData.session_id || sessData.sessionId;
    if (!sessionId && requestId) {
      const status = parseKpassJSON(kpass_sessionStatus(requestId), 'agent:session status');
      sessionId = status.session_id || status.sessionId;
    }
  }
  if (!sessionId) sessionId = `session-${Date.now()}`;

  await apiFetch('/api/join-pool', { method: 'POST', body: JSON.stringify({ poolId, brokerName, agentId, sessionId }) });
  log.emit('BROKER_JOINED', { poolId, brokerName, agentId, sessionId });

  let socket;
  try {
    socket = require('socket.io-client')(SERVER_BASE_URL);
  } catch {
    log.warn('socket.io-client not installed; skipping live negotiation.');
    return { agentId, sessionId, poolId };
  }

  let negotiationRound = 0;
  const maxRounds = agentConfig.maxRounds || 10;

  socket.on('connect', () => {
    socket.emit('join-pool', poolId);
    const opening = brain.buildOpeningMove({ ...agentConfig, brokerName });
    socket.emit('negotiate', { poolId, msg: { ...opening, from: brokerName, role: agentConfig.role } });
  });

  socket.on('connect_error', (err) => log.warn(`Socket error: ${err.message}`));

  socket.on('negotiate', async (msg) => {
    if (msg.from === brokerName) return;
    if (!['BID', 'ASK', 'COUNTER'].includes(String(msg.action || ''))) return;
    if (msg.role && String(msg.role).toLowerCase() === String(agentConfig.role).toLowerCase()) return;

    negotiationRound += 1;
    if (negotiationRound >= maxRounds) {
      socket.emit('negotiate', {
        poolId,
        msg: { action: 'REJECT', amount: 0, from: brokerName, role: agentConfig.role, reason: 'max_rounds_exceeded' },
      });
      negotiationRound = 0;
      return;
    }

    try {
      const decision = await brain.decide(msg, agentConfig, { poolId, brokerName, round: negotiationRound });
      const decisionAmount = Number(decision?.amount ?? 0);

      if (decision?.action === 'ACCEPT') {
        negotiationRound = 0;
        await executeTrade(poolId, { ...msg, amount: decisionAmount || msg.amount }, { poolId, brokerName, agentConfig, sessionId });
      } else if (decision?.action === 'REJECT') {
        negotiationRound = 0;
        socket.emit('negotiate', {
          poolId,
          msg: { action: 'REJECT', amount: 0, from: brokerName, role: agentConfig.role, reason: decision.reason || 'rejected' },
        });
      } else {
        socket.emit('negotiate', {
          poolId,
          msg: {
            action: 'COUNTER',
            amount: decisionAmount,
            asset: msg.asset || agentConfig.asset,
            from: brokerName,
            role: agentConfig.role,
            reason: decision?.reason,
          },
        });
      }
    } catch (err) {
      log.error(`Negotiation loop error: ${err.message}`);
      socket.emit('negotiate', {
        poolId,
        msg: { action: 'REJECT', amount: 0, from: brokerName, role: agentConfig.role, reason: 'internal_error' },
      });
      negotiationRound = 0;
    }
  });

  return { agentId, sessionId, poolId };
}

function listSessions(flags) {
  if (!flags.agentId) throw new Error('--agent-id is required');
  const data = parseKpassJSON(kpass_sessionList(flags.agentId), 'agent:session list');
  console.log(JSON.stringify(data, null, 2));
}

function revokeSession(flags) {
  if (!flags.sessionId) throw new Error('--session-id is required');
  kpass_sessionRevoke(flags.sessionId);
  log.emit('SESSION_REVOKED', flags.sessionId);
}

(async () => {
  const [major] = process.versions.node.split('.').map(Number);
  if (major < 18) {
    console.error('[nexus] Requires Node.js 18 or later.');
    process.exit(1);
  }

  const [, , command, ...rest] = process.argv;
  const flags = parseArgs(rest);

  if (!command || command === '--help' || command === '-h') {
    printUsage();
    process.exit(0);
  }

  if (flags.brokerName) validateEnv(flags.brokerName);

  try {
    switch (command) {
      case 'create-pool':
        await createPool(flags);
        break;
      case 'deploy-broker':
      case 'join-pool':
        await deployBroker(flags);
        break;
      case 'list-sessions':
        listSessions(flags);
        break;
      case 'revoke-session':
        revokeSession(flags);
        break;
      default:
        log.error(`Unknown command: "${command}"`);
        printUsage();
        process.exit(1);
    }
  } catch (err) {
    log.error(`❌ ${err.message}`);
    if (process.env.NEXUS_LOG_LEVEL === 'debug') console.error(err.stack);
    process.exit(1);
  }
})();
