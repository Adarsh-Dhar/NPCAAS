#!/usr/bin/env node
// nexus.js — Bridge between Codex agent, OTC clearinghouse, and Kite Agent Passport
// Requires Node.js 18+ (native fetch)

'use strict';

const { execSync } = require('child_process');
const { runBrain } = require('./economic-engine');

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const SERVER_BASE_URL = process.env.NEXUS_SERVER_URL || 'http://localhost:3000';
const DEFAULT_MAX_PER_TX = process.env.NEXUS_MAX_PER_TX || '0.50';
const DEFAULT_MAX_TOTAL = process.env.NEXUS_MAX_TOTAL || '5.00';
const DEFAULT_TTL = process.env.NEXUS_SESSION_TTL || '1h'; // kpass expects "1h", "24h", etc.
const DEFAULT_ASSETS = process.env.NEXUS_ASSETS || 'USDC';
const DEFAULT_PAYMENT = process.env.NEXUS_PAYMENT || 'x402';
const DEFAULT_KPASS_TIMEOUT_MS = Number(process.env.NEXUS_KPASS_TIMEOUT_MS || (5 * 60 * 1000));
const WAIT_KPASS_TIMEOUT_MS = Number(process.env.NEXUS_KPASS_WAIT_TIMEOUT_MS || (30 * 60 * 1000));

// ─── LOGGING ─────────────────────────────────────────────────────────────────

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const LOG_LEVEL = LOG_LEVELS[process.env.NEXUS_LOG_LEVEL] ?? LOG_LEVELS.info;

const log = {
  debug: (...a) => LOG_LEVEL <= 0 && console.debug('[nexus:debug]', ...a),
  info: (...a) => LOG_LEVEL <= 1 && console.log('[nexus]', ...a),
  warn: (...a) => LOG_LEVEL <= 2 && console.warn('[nexus:warn]', ...a),
  error: (...a) => LOG_LEVEL <= 3 && console.error('[nexus:error]', ...a),
  emit: (tag, payload) => console.log(`${tag}: ${typeof payload === 'object' ? JSON.stringify(payload) : payload}`),
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
  try { body = await res.json(); }
  catch { body = await res.text().catch(() => '(empty body)'); }

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
    }).toString().trim();
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
  const value = String(ttl ?? DEFAULT_TTL).trim().toLowerCase();
  const match = value.match(/^(\d+(?:\.\d+)?)([smhd])?$/);

  if (!match) {
    throw new Error(`Invalid TTL value: ${ttl}`);
  }

  const amount = Number(match[1]);
  const unit = match[2] || 's';
  const multipliers = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 24 * 60 * 60,
  };

  return Math.round(amount * multipliers[unit]);
}

function openUrl(url) {
  if (!url) return false;

  const encoded = JSON.stringify(String(url));
  const candidates = process.platform === 'darwin'
    ? [`open ${encoded}`]
    : process.platform === 'win32'
      ? [`start "" ${encoded}`]
      : [`xdg-open ${encoded}`];

  for (const cmd of candidates) {
    try {
      execSync(cmd, {
        stdio: 'ignore',
        timeout: 5000,
        shell: '/bin/bash',
      });
      return true;
    } catch {
      // Continue to fallback open command.
    }
  }

  return false;
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
  throw new Error(`Missing field (tried: ${keys.join(', ')}) in ${label}: ${JSON.stringify(obj)}`);
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

async function executeTrade(poolId, incomingMsg, context) {
  const { brokerName } = context;
  const asset = incomingMsg?.asset || incomingMsg?.instrument || 'Real-Time Sentiment Dataset';
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

  log.emit('TRADE_EXECUTED', { poolId, brokerName, asset, price, success: Boolean(result?.success) });
  log.info(`Trade settled for ${brokerName}: ${asset} @ $${price}`);
  return result;
}

function printUsage() {
  console.log(`
nexus.js — Kite Agent Passport × OTC Clearinghouse bridge

COMMANDS
  create-pool
    Initialize a secure dark pool.

  deploy-broker --pool-id <id> --broker-name <name> [options]
    Register a broker on Kite, get passkey approval for a budget
    session, then connect the broker to the pool.

  list-sessions --agent-id <id>
      List all active Kite sessions for a given agent.

  revoke-session --session-id <id>
      Revoke an active Kite session immediately.

OPTIONS (deploy-broker)
  --pool-id      <id>      Pool ID to join               (required)
  --broker-name  <name>    Display name for the broker   (required)
  --max-per-tx   <amount>  Max USDC spend per tx         (default: ${DEFAULT_MAX_PER_TX})
  --max-total    <amount>  Max USDC spend for session    (default: ${DEFAULT_MAX_TOTAL})
  --ttl          <time>    Session lifetime e.g. 1h, 24h (default: ${DEFAULT_TTL})
  --assets       <asset>   Asset type                    (default: ${DEFAULT_ASSETS})
  --payment      <method>  Payment approach              (default: ${DEFAULT_PAYMENT})
  --hidden-floor <amount>  Negotiation hidden floor      (default: 40)
  --hidden-ceiling <amount> Negotiation hidden ceiling   (default: 50)
  --role         <role>    buyer|seller                  (default: buyer)
  --dry-run                Print commands without executing them

ENVIRONMENT VARIABLES
  NEXUS_SERVER_URL    Web server base URL   (default: http://localhost:3000)
  NEXUS_MAX_PER_TX    Max per-tx spend      (default: ${DEFAULT_MAX_PER_TX})
  NEXUS_MAX_TOTAL     Max total spend       (default: ${DEFAULT_MAX_TOTAL})
  NEXUS_SESSION_TTL   Session TTL string    (default: ${DEFAULT_TTL})
  NEXUS_ASSETS        Asset type            (default: ${DEFAULT_ASSETS})
  NEXUS_PAYMENT       Payment approach      (default: ${DEFAULT_PAYMENT})
  NEXUS_LOG_LEVEL     debug|info|warn|error (default: info)

MACHINE-PARSEABLE OUTPUT (for Codex)
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
  } = flags;

  if (!poolId) throw new Error('--pool-id is required');
  if (!brokerName) throw new Error('--broker-name is required');

  log.info(`Registering broker "${brokerName}" on Kite…`);

  const registerCmd = [
    'kpass agent:register',
    '--type "nexus-broker"',
    '--output json',
    '--no-interactive',
  ].join(' ');

  let agentId;
  if (dryRun) {
    log.warn(`--dry-run: would run:\n  $ ${registerCmd}`);
    agentId = 'DRY-RUN-AGENT-ID';
  } else {
    const registerData = parseKpassJSON(shell(registerCmd), 'kpass agent:register');
    agentId = requireField(registerData, ['agent_id', 'agentId', 'id'], 'register response');
  }
  log.info(`Broker registered → Agent ID: ${agentId}`);

  log.info('Requesting budget session…');
  log.info(`  Max per tx : $${maxPerTx} ${assets}`);
  log.info(`  Max total  : $${maxTotal} ${assets}`);
  log.info(`  TTL        : ${ttl}`);
  const ttlSeconds = parseTtlSeconds(ttl);
  const delegation = JSON.stringify({
    task: { summary: `Nexus OTC block trade for ${brokerName}` },
    payment_policy: {
      allowed_payment_approaches: ['x402'],
      assets: ['USDC'],
      max_amount_per_tx: maxPerTx,
      max_total_amount: maxTotal,
      ttl_seconds: ttlSeconds,
    },
  });

  const sessionCmd = [
    'kpass agent:session create',
    `--delegation ${shellQuote(delegation)}`,
    '--output json',
    '--no-interactive',
  ].join(' ');

  let requestId;
  let approvalUrl = '';
  if (dryRun) {
    log.warn(`--dry-run: would run:\n  $ ${sessionCmd}`);
    requestId = 'DRY-RUN-REQUEST-ID';
  } else {
    const sessionReqData = parseKpassJSON(shell(sessionCmd), 'kpass agent:session create');
    requestId = requireField(sessionReqData, ['request_id', 'requestId', 'id'], 'session create response');

    approvalUrl = sessionReqData.approval_url || sessionReqData.approvalUrl || '';
    const createStatus = sessionReqData.status || '';
    if (approvalUrl) {
      log.emit('APPROVAL_URL', approvalUrl);
      log.warn(`Approval URL: ${approvalUrl}`);
      const opened = openUrl(approvalUrl);
      if (opened) {
        log.info('Opened approval URL in your default browser. Complete passkey approval there.');
      } else if (createStatus === 'human_action_required') {
        log.warn('Could not auto-open browser. Open the approval URL manually to continue.');
      }
    }
  }
  log.info(`Session request submitted → Request ID: ${requestId}`);

  log.warn('⚠  Passkey approval required — check your browser / authenticator app.');

  const waitCmd = [
    'kpass agent:session status',
    `--request-id ${requestId}`,
    '--wait',
    '--output json',
    '--no-interactive',
  ].join(' ');

  let sessionId;
  if (dryRun) {
    log.warn(`--dry-run: would run:\n  $ ${waitCmd}`);
    sessionId = 'DRY-RUN-SESSION-ID';
  } else {
    const approvedData = parseKpassJSON(
      shell(waitCmd, { timeoutMs: WAIT_KPASS_TIMEOUT_MS }),
      'kpass agent:session status'
    );
    sessionId = requireField(approvedData, ['session_id', 'sessionId', 'id'], 'session status response');
  }
  log.info(`✅ Budget session approved → Session ID: ${sessionId}`);

  log.info(`Sending "${brokerName}" to pool ${poolId}…`);

  const payload = { poolId, brokerName, agentId, sessionId };
  if (dryRun) {
    log.warn(`--dry-run: would POST /api/join-pool with ${JSON.stringify(payload)}`);
  } else {
    await apiFetch('/api/join-pool', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  log.emit('BROKER_JOINED', { poolId, brokerName, agentId, sessionId });
  log.info(`🕴️ "${brokerName}" is live in ${poolId}`);

  // Step 2.2: after joining a pool, open a socket connection and wire the brain.
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
      brokerName,
      agentId,
      sessionId,
      poolId,
    };

    socket.on('connect', () => {
      log.info(`Socket connected (${socket.id}); joining pool ${poolId}`);
      socket.emit('join-pool', poolId);
    });

    socket.on('connect_error', (err) => {
      log.warn(`Socket connect error: ${err.message}`);
    });

    socket.on('negotiate', async (msg) => {
      try {
        const decision = await runBrain(msg, agentConfig);
        if (decision.action === 'ACCEPT') {
          await executeTrade(poolId, msg, { brokerName, agentConfig });
        } else {
          socket.emit('negotiate', { poolId, msg: { ...decision, from: brokerName } });
        }
      } catch (err) {
        log.error(`Negotiation loop failed: ${err.message}`);
      }
    });
  }

  return { agentId, requestId, sessionId, poolId };
}

function listSessions(flags) {
  const { agentId } = flags;
  if (!agentId) throw new Error('--agent-id is required');

  log.info(`Listing sessions for agent ${agentId}…`);
  const raw = shell(`kpass agent:session list --agent-id ${agentId} --output json --no-interactive`);
  const data = parseKpassJSON(raw, 'kpass agent:session list');
  console.log(JSON.stringify(data, null, 2));
}

function revokeSession(flags) {
  const { sessionId } = flags;
  if (!sessionId) throw new Error('--session-id is required');

  log.info(`Revoking session ${sessionId}…`);
  shell(`kpass agent:session revoke --session-id ${sessionId} --no-interactive`);
  log.emit('SESSION_REVOKED', sessionId);
  log.info(`Session ${sessionId} revoked.`);
}

(async () => {
  const [major] = process.versions.node.split('.').map(Number);
  if (major < 18) {
    console.error('[nexus] ❌ Requires Node.js 18 or later (native fetch).');
    process.exit(1);
  }

  const [,, command, ...rest] = process.argv;
  const flags = parseArgs(rest);

  if (!command || command === '--help' || command === '-h') {
    printUsage();
    process.exit(0);
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
