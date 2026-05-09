#!/usr/bin/env node
// nexus.js — Bridge between AI agent, OTC clearinghouse, and Kite Agent Passport
// Requires Node.js 18+ (native fetch)
//
// KITE PASSPORT NOTE:
// The `kpass` CLI is a planned integration with the Kite Agent Passport system.
// Until the real binary ships, set NEXUS_KPASS_MOCK=true and the CLI will simulate
// the full passkey approval flow locally (useful for development and demos).
//
// Real kpass integration: https://kite.dev/docs/agent-passport (placeholder)

'use strict';

const { execSync } = require('child_process');
const { runBrain, buildInitialBid, buildInitialAsk, shouldStopNegotiation } = require('./economic-engine');

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const SERVER_BASE_URL = process.env.NEXUS_SERVER_URL || 'http://localhost:3000';
const DEFAULT_MAX_PER_TX = process.env.NEXUS_MAX_PER_TX || '50.00';
const DEFAULT_MAX_TOTAL = process.env.NEXUS_MAX_TOTAL || '500.00';
const DEFAULT_TTL = process.env.NEXUS_SESSION_TTL || '1h';
const DEFAULT_ASSETS = process.env.NEXUS_ASSETS || 'USDC';
const DEFAULT_PAYMENT = process.env.NEXUS_PAYMENT || 'x402';
const DEFAULT_KPASS_TIMEOUT_MS = Number(process.env.NEXUS_KPASS_TIMEOUT_MS || 5 * 60 * 1000);
const WAIT_KPASS_TIMEOUT_MS = Number(process.env.NEXUS_KPASS_WAIT_TIMEOUT_MS || 30 * 60 * 1000);

// When true, kpass commands are simulated locally — no real binary required
const KPASS_MOCK = process.env.NEXUS_KPASS_MOCK === 'true' || process.env.NEXUS_KPASS_MOCK === '1';

// If KPASS_MOCK is not explicitly enabled but `kpass` binary is missing, fall back to mock
if (!KPASS_MOCK) {
  try {
    execSync('command -v kpass', { stdio: 'ignore', shell: '/bin/bash' });
  } catch (err) {
    console.warn('[nexus] kpass binary not found in PATH — falling back to NEXUS_KPASS_MOCK=true for local dev.');
    process.env.NEXUS_KPASS_MOCK = 'true';
  }
}

// ─── STARTUP VALIDATION ───────────────────────────────────────────────────────
function validateEnv() {
  const missing = [];
  if (!process.env.ANTHROPIC_API_KEY) missing.push('ANTHROPIC_API_KEY');
  if (missing.length > 0) {
    console.error(`[nexus] ❌ Missing required environment variables: ${missing.join(', ')}`);
    console.error('[nexus]    Copy .env.example to .env and fill in the values.');
    process.exit(1);
  }
}

// ─── LOGGING ─────────────────────────────────────────────────────────────────
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const LOG_LEVEL = LOG_LEVELS[process.env.NEXUS_LOG_LEVEL] ?? LOG_LEVELS.info;

const log = {
  debug: (...a) => LOG_LEVEL <= 0 && console.debug('[nexus:debug]', ...a),
  info: (...a) => LOG_LEVEL <= 1 && console.log('[nexus]', ...a),
  warn: (...a) => LOG_LEVEL <= 2 && console.warn('[nexus:warn]', ...a),
  error: (...a) => LOG_LEVEL <= 3 && console.error('[nexus:error]', ...a),
  emit: (tag, payload) =>
    console.log(`${tag}: ${typeof payload === 'object' ? JSON.stringify(payload) : payload}`),
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const url = `${SERVER_BASE_URL}${path}`;
  log.debug(`→ ${options.method || 'GET'} ${url}`);

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

  if (!res.ok) {
    throw new Error(`Server ${res.status} on ${path}: ${JSON.stringify(body)}`);
  }

  log.debug(`← ${res.status}`, body);
  return body;
}

function shell(cmd, { timeoutMs = DEFAULT_KPASS_TIMEOUT_MS } = {}) {
  log.debug(`$ ${cmd}`);
  try {
    return execSync(cmd, {
      stdio: ['inherit', 'pipe', 'pipe'],
      timeout: timeoutMs,
      shell: '/bin/bash',
    })
      .toString()
      .trim();
  } catch (err) {
    const stderr = err.stderr?.toString().trim() || '';
    const stdout = err.stdout?.toString().trim() || '';
    const detail = stderr || stdout || err.message;
    throw new Error(`kpass command failed:\n  $ ${cmd}\n  ${detail}`);
  }
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function parseTtlSeconds(ttl) {
  const value = String(ttl ?? DEFAULT_TTL)
    .trim()
    .toLowerCase();
  const match = value.match(/^(\d+(?:\.\d+)?)([smhd])?$/);
  if (!match) throw new Error(`Invalid TTL value: ${ttl}`);
  const amount = Number(match[1]);
  const unit = match[2] || 's';
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return Math.round(amount * multipliers[unit]);
}

function openUrl(url) {
  if (!url) return false;
  const encoded = JSON.stringify(String(url));
  const cmd =
    process.platform === 'darwin'
      ? `open ${encoded}`
      : process.platform === 'win32'
      ? `start "" ${encoded}`
      : `xdg-open ${encoded}`;
  try {
    execSync(cmd, { stdio: 'ignore', timeout: 5000, shell: '/bin/bash' });
    return true;
  } catch {
    return false;
  }
}

function parseKpassJSON(raw, cmdHint) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${cmdHint} returned non-JSON output:\n${raw}`);
  }
}

function requireField(obj, keys, label) {
  for (const k of keys) {
    if (obj[k] != null) return obj[k];
  }
  throw new Error(
    `Missing field (tried: ${keys.join(', ')}) in ${label}: ${JSON.stringify(obj)}`
  );
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const [key, inlineVal] = arg.slice(2).split('=');
    const camel = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (inlineVal !== undefined) {
      args[camel] = inlineVal;
    } else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
      args[camel] = argv[++i];
    } else {
      args[camel] = true;
    }
  }
  return args;
}

// ─── KPASS MOCK ───────────────────────────────────────────────────────────────
// Simulates the full Kite Agent Passport flow locally.
// Replace each mock function body with real kpass shell calls when the binary ships.

let _mockAgentCounter = 1000;
let _mockSessionCounter = 2000;
let _mockRequestCounter = 3000;

function kpassMock_register() {
  const agentId = `mock-agent-${_mockAgentCounter++}`;
  log.warn(`[MOCK kpass] Simulating agent:register → ${agentId}`);
  return JSON.stringify({ agent_id: agentId });
}

function kpassMock_sessionCreate(delegation) {
  const requestId = `mock-req-${_mockRequestCounter++}`;
  const approvalUrl = `http://localhost:3000/mock-approval/${requestId}`;
  log.warn(`[MOCK kpass] Simulating agent:session create → requestId: ${requestId}`);
  log.warn(`[MOCK kpass] Approval URL (mock — no actual passkey required): ${approvalUrl}`);
  return JSON.stringify({
    request_id: requestId,
    status: 'pending',
    approval_url: approvalUrl,
  });
}

function kpassMock_sessionStatus(requestId) {
  const sessionId = `mock-session-${_mockSessionCounter++}`;
  log.warn(`[MOCK kpass] Simulating agent:session status → APPROVED → sessionId: ${sessionId}`);
  return JSON.stringify({ session_id: sessionId, status: 'approved' });
}

function kpassMock_sessionList(agentId) {
  log.warn(`[MOCK kpass] Simulating agent:session list for ${agentId}`);
  return JSON.stringify([]);
}

function kpassMock_sessionRevoke(sessionId) {
  log.warn(`[MOCK kpass] Simulating agent:session revoke for ${sessionId}`);
  return '';
}

// ─── REAL KPASS SHELL WRAPPERS ─────────────────────────────────────────────
// When NEXUS_KPASS_MOCK=false, these call the real kpass binary via execSync.

function kpass_register() {
  if (KPASS_MOCK) return kpassMock_register();
  const cmd = 'kpass agent:register --type "nexus-broker" --output json --no-interactive';
  return shell(cmd);
}

function kpass_sessionCreate(delegation) {
  if (KPASS_MOCK) return kpassMock_sessionCreate(delegation);
  const cmd = [
    'kpass agent:session create',
    `--delegation ${shellQuote(delegation)}`,
    '--output json',
    '--no-interactive',
  ].join(' ');
  return shell(cmd);
}

function kpass_sessionStatus(requestId) {
  if (KPASS_MOCK) return kpassMock_sessionStatus(requestId);
  const cmd = [
    'kpass agent:session status',
    `--request-id ${requestId}`,
    '--wait',
    '--output json',
    '--no-interactive',
  ].join(' ');
  return shell(cmd, { timeoutMs: WAIT_KPASS_TIMEOUT_MS });
}

function kpass_sessionList(agentId) {
  if (KPASS_MOCK) return kpassMock_sessionList(agentId);
  return shell(
    `kpass agent:session list --agent-id ${agentId} --output json --no-interactive`
  );
}

function kpass_sessionRevoke(sessionId) {
  if (KPASS_MOCK) return kpassMock_sessionRevoke(sessionId);
  shell(`kpass agent:session revoke --session-id ${sessionId} --no-interactive`);
  return '';
}

// ─── TRADE EXECUTION ─────────────────────────────────────────────────────────
async function executeTrade(poolId, incomingMsg, context) {
  const { brokerName } = context;
  const asset =
    incomingMsg?.asset || incomingMsg?.instrument || 'Real-Time Sentiment Dataset';
  const rawPrice = incomingMsg?.amount ?? incomingMsg?.price ?? DEFAULT_MAX_PER_TX;
  const price = String(rawPrice);

  const payload = {
    poolId,
    brokerName,
    asset,
    price,
    negotiation: incomingMsg,
  };

  const result = await apiFetch('/api/execute-trade', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  log.emit('TRADE_EXECUTED', {
    poolId,
    brokerName,
    asset,
    price,
    success: Boolean(result?.success),
  });
  log.info(`Trade settled for ${brokerName}: ${asset} @ $${price}`);
  return result;
}

// ─── COMMANDS ────────────────────────────────────────────────────────────────
function printUsage() {
  console.log(`
nexus.js — Kite Agent Passport × OTC Clearinghouse bridge

COMMANDS
  create-pool
    Initialize a secure dark pool.

  deploy-broker --pool-id <id> --broker-name <name> [options]
    Register a broker, get passkey approval for a budget session,
    then connect to the pool and start negotiating.

  list-sessions --agent-id <id>
    List all active Kite sessions for a given agent.

  revoke-session --session-id <id>
    Revoke an active Kite session immediately.

OPTIONS (deploy-broker)
  --pool-id         <id>      Pool ID to join               (required)
  --broker-name     <name>    Display name for the broker   (required)
  --max-per-tx      <amount>  Max USDC spend per tx         (default: ${DEFAULT_MAX_PER_TX})
  --max-total       <amount>  Max USDC spend for session    (default: ${DEFAULT_MAX_TOTAL})
  --ttl             <time>    Session lifetime e.g. 1h, 24h (default: ${DEFAULT_TTL})
  --assets          <asset>   Asset type                    (default: ${DEFAULT_ASSETS})
  --payment         <method>  Payment approach              (default: ${DEFAULT_PAYMENT})
  --hidden-floor    <amount>  Negotiation hidden floor      (default: 40)
  --hidden-ceiling  <amount>  Negotiation hidden ceiling    (default: 50)
  --role            <role>    buyer|seller                  (default: buyer)
  --asset           <name>    Asset being traded            (default: Real-Time Sentiment Dataset)
  --dry-run                   Print commands without executing them

ENVIRONMENT VARIABLES
  ANTHROPIC_API_KEY      Required. Your Anthropic API key.
  NEXUS_SERVER_URL       Web server base URL       (default: http://localhost:3000)
  NEXUS_MAX_PER_TX       Max per-tx spend          (default: ${DEFAULT_MAX_PER_TX})
  NEXUS_MAX_TOTAL        Max total spend           (default: ${DEFAULT_MAX_TOTAL})
  NEXUS_SESSION_TTL      Session TTL string        (default: ${DEFAULT_TTL})
  NEXUS_ASSETS           Asset type                (default: ${DEFAULT_ASSETS})
  NEXUS_PAYMENT          Payment approach          (default: ${DEFAULT_PAYMENT})
  NEXUS_LOG_LEVEL        debug|info|warn|error     (default: info)
  NEXUS_KPASS_MOCK       true|false  Simulate kpass locally (default: false)
  NEXUS_HIDDEN_FLOOR     Negotiation hidden floor
  NEXUS_HIDDEN_CEILING   Negotiation hidden ceiling
  NEXUS_ROLE             buyer|seller

MACHINE-PARSEABLE OUTPUT (for Codex / CI)
  POOL_CREATED: <poolId>
  BROKER_JOINED: {"poolId":…,"brokerName":…,"agentId":…,"sessionId":…}
  TRADE_EXECUTED: {"poolId":…,"brokerName":…,"asset":…,"price":…,"success":…}
  SESSION_REVOKED: <sessionId>
`);
}

async function createPool(flags) {
  log.info('Initializing secure dark pool…');

  if (flags.dryRun) {
    log.warn('--dry-run: would POST /api/create-pool');
    log.emit('POOL_CREATED', 'DRY-RUN-POOL');
    return;
  }

  const data = await apiFetch('/api/create-pool', { method: 'POST' });
  const poolId = requireField(data, ['poolId', 'pool_id', 'id'], 'create-pool response');

  log.emit('POOL_CREATED', poolId);
  log.info(`Pool is live → ${poolId}`);
  return poolId;
}

async function deployBroker(flags) {
  const {
    poolId,
    brokerName,
    maxPerTx = DEFAULT_MAX_PER_TX,
    maxTotal = DEFAULT_MAX_TOTAL,
    ttl = DEFAULT_TTL,
    assets = DEFAULT_ASSETS,
    payment = DEFAULT_PAYMENT,
    dryRun = false,
    asset: tradingAsset = process.env.NEXUS_ASSET || 'Real-Time Sentiment Dataset',
  } = flags;

  if (!poolId) throw new Error('--pool-id is required');
  if (!brokerName) throw new Error('--broker-name is required');

  if (KPASS_MOCK) {
    log.warn('⚠  NEXUS_KPASS_MOCK=true — running in simulation mode (no real Kite chain)');
  }

  // Step 1: Register agent on Kite
  log.info(`Registering broker "${brokerName}" on Kite${KPASS_MOCK ? ' (mock)' : ''}…`);
  let agentId;
  if (dryRun) {
    log.warn('--dry-run: would run: kpass agent:register …');
    agentId = 'DRY-RUN-AGENT-ID';
  } else {
    const registerData = parseKpassJSON(kpass_register(), 'kpass agent:register');
    agentId = requireField(registerData, ['agent_id', 'agentId', 'id'], 'register response');
  }
  log.info(`Broker registered → Agent ID: ${agentId}`);

  // Step 2: Create budget session
  log.info('Requesting budget session…');
  log.info(`  Max per tx : $${maxPerTx} ${assets}`);
  log.info(`  Max total  : $${maxTotal} ${assets}`);
  log.info(`  TTL        : ${ttl}`);
  const ttlSeconds = parseTtlSeconds(ttl);

  const delegation = JSON.stringify({
    task: { summary: `Nexus OTC block trade for ${brokerName}` },
    payment_policy: {
      allowed_payment_approaches: [payment],
      assets: [assets],
      max_amount_per_tx: maxPerTx,
      max_total_amount: maxTotal,
      ttl_seconds: ttlSeconds,
    },
  });

  let requestId;
  if (dryRun) {
    log.warn('--dry-run: would run: kpass agent:session create …');
    requestId = 'DRY-RUN-REQUEST-ID';
  } else {
    const sessionReqData = parseKpassJSON(kpass_sessionCreate(delegation), 'kpass agent:session create');
    requestId = requireField(
      sessionReqData,
      ['request_id', 'requestId', 'id'],
      'session create response'
    );
    const approvalUrl = sessionReqData.approval_url || sessionReqData.approvalUrl || '';
    if (approvalUrl && !KPASS_MOCK) {
      log.emit('APPROVAL_URL', approvalUrl);
      log.warn(`Approval URL: ${approvalUrl}`);
      const opened = openUrl(approvalUrl);
      if (!opened) {
        log.warn('Could not auto-open browser. Open the approval URL manually to continue.');
      }
    }
  }
  log.info(`Session request submitted → Request ID: ${requestId}`);

  if (!KPASS_MOCK) {
    log.warn('⚠  Passkey approval required — check your browser / authenticator app.');
  }

  // Step 3: Wait for approval
  let sessionId;
  if (dryRun) {
    log.warn('--dry-run: would run: kpass agent:session status --wait …');
    sessionId = 'DRY-RUN-SESSION-ID';
  } else {
    const approvedData = parseKpassJSON(
      kpass_sessionStatus(requestId),
      'kpass agent:session status'
    );
    sessionId = requireField(
      approvedData,
      ['session_id', 'sessionId', 'id'],
      'session status response'
    );
  }
  log.info(`✅ Budget session approved → Session ID: ${sessionId}`);

  // Step 4: Join pool via nexus server
  log.info(`Sending "${brokerName}" to pool ${poolId}…`);
  const payload = { poolId, brokerName, agentId, sessionId };
  if (dryRun) {
    log.warn(`--dry-run: would POST /api/join-pool with ${JSON.stringify(payload)}`);
  } else {
    await apiFetch('/api/join-pool', { method: 'POST', body: JSON.stringify(payload) });
  }

  log.emit('BROKER_JOINED', { poolId, brokerName, agentId, sessionId });
  log.info(`🕴️ "${brokerName}" is live in ${poolId}`);

  // Step 5: Wire live negotiation via socket.io
  if (!dryRun) {
    let socket;
    try {
      socket = require('socket.io-client')(SERVER_BASE_URL);
    } catch {
      log.warn('socket.io-client is not installed; skipping live negotiation wiring.');
      return { agentId, requestId, sessionId, poolId };
    }

    const agentConfig = {
      hiddenFloor: Number(flags.hiddenFloor ?? process.env.NEXUS_HIDDEN_FLOOR ?? 40),
      hiddenCeiling: Number(flags.hiddenCeiling ?? process.env.NEXUS_HIDDEN_CEILING ?? 50),
      role: String(flags.role ?? process.env.NEXUS_ROLE ?? 'buyer'),
      asset: tradingAsset,
      brokerName,
      agentId,
      sessionId,
      poolId,
    };

    // Per-broker round counter — prevents infinite negotiation loops
    let negotiationRound = 0;

    socket.on('connect', () => {
      log.info(`Socket connected (${socket.id}); joining pool ${poolId}`);
      socket.emit('join-pool', poolId);

      // Sellers and buyers both auto-emit an opening message so
      // the loop can start without any human interaction.
      if (agentConfig.role === 'seller') {
        const ask = buildInitialAsk(agentConfig);
        log.info(`Seller emitting opening ASK: $${ask.amount} for "${ask.asset}"`);
        socket.emit('negotiate', { poolId, msg: ask });
      } else {
        const bid = buildInitialBid(agentConfig);
        log.info(`Buyer emitting opening BID: $${bid.amount} for "${bid.asset}"`);
        socket.emit('negotiate', { poolId, msg: bid });
      }
    });

    socket.on('connect_error', (err) => {
      log.warn(`Socket connect error: ${err.message}`);
    });

    socket.on('negotiate', async (msg) => {
      // Ignore our own messages echoed back
      if (msg.from === brokerName) return;

      negotiationRound++;
      log.info(`[Round ${negotiationRound}/${require('./economic-engine').MAX_ROUNDS}] Received: ${JSON.stringify(msg)}`);

      // Hard cap — if we've hit max rounds, reject and walk away
      if (shouldStopNegotiation(negotiationRound)) {
        log.warn(`Max rounds (${require('./economic-engine').MAX_ROUNDS}) reached — sending REJECT`);
        socket.emit('negotiate', {
          poolId,
          msg: { action: 'REJECT', amount: 0, from: brokerName, reason: 'max_rounds_exceeded' },
        });
        negotiationRound = 0; // reset for potential future negotiations
        return;
      }

      try {
        const decision = await runBrain(msg, agentConfig);
        log.info(`Brain decision: ${JSON.stringify(decision)}`);

        if (decision.action === 'ACCEPT') {
          log.info('✅ ACCEPT — executing trade settlement');
          negotiationRound = 0;
          await executeTrade(poolId, { ...msg, amount: msg.amount }, { brokerName, agentConfig });
        } else if (decision.action === 'REJECT') {
          log.info('❌ REJECT — ending negotiation');
          negotiationRound = 0;
          socket.emit('negotiate', {
            poolId,
            msg: { action: 'REJECT', amount: 0, from: brokerName },
          });
        } else {
          // COUNTER
          socket.emit('negotiate', {
            poolId,
            msg: { ...decision, from: brokerName, asset: msg.asset || agentConfig.asset },
          });
        }
      } catch (err) {
        log.error(`Negotiation loop failed: ${err.message}`);
        // Gracefully bail out rather than crashing
        socket.emit('negotiate', {
          poolId,
          msg: { action: 'REJECT', amount: 0, from: brokerName, reason: 'internal_error' },
        });
        negotiationRound = 0;
      }
    });
  }

  return { agentId, requestId, sessionId, poolId };
}

function listSessions(flags) {
  const { agentId } = flags;
  if (!agentId) throw new Error('--agent-id is required');

  log.info(`Listing sessions for agent ${agentId}…`);
  const raw = kpass_sessionList(agentId);
  const data = parseKpassJSON(raw, 'kpass agent:session list');
  console.log(JSON.stringify(data, null, 2));
}

function revokeSession(flags) {
  const { sessionId } = flags;
  if (!sessionId) throw new Error('--session-id is required');

  log.info(`Revoking session ${sessionId}…`);
  kpass_sessionRevoke(sessionId);
  log.emit('SESSION_REVOKED', sessionId);
  log.info(`Session ${sessionId} revoked.`);
}

// ─── ENTRY POINT ──────────────────────────────────────────────────────────────
(async () => {
  const [major] = process.versions.node.split('.').map(Number);
  if (major < 18) {
    console.error('[nexus] ❌ Requires Node.js 18 or later (native fetch).');
    process.exit(1);
  }

  const [, , command, ...rest] = process.argv;
  const flags = parseArgs(rest);

  if (!command || command === '--help' || command === '-h') {
    printUsage();
    process.exit(0);
  }

  // Validate env for commands that actually need the API
  if (!['--help', '-h'].includes(command)) {
    validateEnv();
  }

  try {
    switch (command) {
      case 'create-pool':
        await createPool(flags);
        break;
      case 'deploy-broker':
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