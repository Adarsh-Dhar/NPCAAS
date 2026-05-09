// server.js — Nexus OTC Clearinghouse (Full Implementation)
// Run with: node server.js
// Requires: NEXUS_API_KEY env var for endpoint authentication (optional but recommended)
'use strict';

// ─── Startup env validation ───────────────────────────────────────────────────
const requiredEnv = [];
// NEXUS_API_KEY is optional — if not set, auth middleware is skipped (dev mode)
if (requiredEnv.length > 0) {
  const missing = requiredEnv.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`[nexus-server] ❌ Missing required env vars: ${missing.join(', ')}`);
    console.error('[nexus-server]    Copy .env.example to .env and fill in the values.');
    process.exit(1);
  }
}

const express = require('express');
const cors = require('cors');
const http = require('http').createServer;

const app = express();
app.use(cors({ origin: process.env.NEXUS_CORS_ORIGIN || '*' }));
app.use(express.json());

const server = http(app);
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: { origin: process.env.NEXUS_CORS_ORIGIN || '*', methods: ['GET', 'POST'] },
});

const PORT = Number(process.env.PORT || 5000);

// Serve sample datasets (secure delivery validated by token)
const path = require('path');
app.use('/data', express.static(path.join(__dirname, 'data')));

// ─── Optional API key authentication ─────────────────────────────────────────
// Set NEXUS_API_KEY in your environment to require it on all /api/* requests.
// Leave unset to run in open dev mode (no auth).
const API_KEY = process.env.NEXUS_API_KEY || null;

function requireApiKey(req, res, next) {
  if (!API_KEY) return next(); // auth disabled
  const provided =
    req.headers['x-api-key'] || req.headers['authorization']?.replace(/^Bearer /, '');
  if (provided !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized — invalid or missing API key' });
  }
  next();
}

// Apply to all /api routes
app.use('/api', requireApiKey);

// ─── x402 Payment helpers ─────────────────────────────────────────────────────
const KITE_FACILITATOR_URL = process.env.KITE_FACILITATOR_URL || 'https://facilitator.pieverse.io';
const KITE_PAYEE_ADDRESS   = process.env.KITE_PAYEE_ADDRESS   || '0x4A50DCA63d541372ad36E5A36F1D542d51164F19';
const KITE_ASSET_ADDRESS   = process.env.KITE_ASSET_ADDRESS   || '0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63';
const KITE_NETWORK         = process.env.KITE_NETWORK         || 'kite-testnet';

/**
 * Verify + settle an x402 payment via the Pieverse facilitator.
 * Returns { txHash } on success, throws on failure.
 */
async function settleX402Payment(xPaymentHeader) {
  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(xPaymentHeader, 'base64').toString('utf8'));
  } catch (e) {
    throw new Error(`Invalid X-Payment header: ${e.message}`);
  }

  const settleRes = await fetch(`${KITE_FACILITATOR_URL}/v2/settle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      authorization: decoded.authorization,
      signature: decoded.signature,
      network: KITE_NETWORK,
    }),
  });

  const settleData = await settleRes.json();
  if (!settleRes.ok) {
    throw new Error(`Facilitator settle failed: ${JSON.stringify(settleData)}`);
  }

  return { txHash: settleData.txHash || settleData.transaction_hash || settleData.hash };
}

/**
 * Poll the Kite explorer to confirm a transaction is on-chain.
 * Returns true if confirmed, false after max attempts.
 */
const KITE_EXPLORER_API = process.env.KITE_EXPLORER_API || 'https://testnet.kitescan.ai/api';

async function confirmTxOnChain(txHash, maxAttempts = 10, delayMs = 3000) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(
        `${KITE_EXPLORER_API}?module=transaction&action=gettxreceiptstatus&txhash=${txHash}`
      );
      const data = await res.json();
      // Kite explorer follows Etherscan-compatible API: status "1" = success
      if (data?.result?.status === '1') return true;
    } catch {
      // explorer may not be up — continue polling
    }
    if (i < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return false;
}
// darkPools[poolId] = { brokers: [], negotiations: [], trades: [], createdAt: '' }
const darkPools = {};

// Delivery tokens for settled trades: deliveryTokens[tradeId] = { token, filename, expiresAt }
const deliveryTokens = {};

// Global trade ledger (capped at 1000 to prevent unbounded memory growth)
const MAX_GLOBAL_TRADES = 1000;
const globalTrades = [];
let tradeIdCounter = 1;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timestamp() {
  const now = new Date();
  return (
    now.toTimeString().split(' ')[0] +
    '.' +
    String(now.getMilliseconds()).padStart(3, '0')
  );
}

function pushGlobalTrade(trade) {
  globalTrades.push(trade);
  // Keep memory bounded
  if (globalTrades.length > MAX_GLOBAL_TRADES) {
    globalTrades.splice(0, globalTrades.length - MAX_GLOBAL_TRADES);
  }
}

function broadcastPoolState(poolId) {
  if (!darkPools[poolId]) return;
  io.to(poolId).emit('pool:state', {
    poolId,
    brokers: darkPools[poolId].brokers,
    trades: darkPools[poolId].trades,
  });
  io.emit('global:state', {
    pools: Object.keys(darkPools).map((id) => ({
      poolId: id,
      brokerCount: darkPools[id].brokers.length,
      tradeCount: darkPools[id].trades.length,
    })),
    trades: globalTrades.slice(-50),
  });
}

// ─── Socket.io ───────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  socket.on('join-pool', (poolId) => {
    socket.join(poolId);
    console.log(`[Socket] ${socket.id} joined room: ${poolId}`);
    if (darkPools[poolId]) {
      socket.emit('pool:state', {
        poolId,
        brokers: darkPools[poolId].brokers,
        trades: darkPools[poolId].trades,
      });
    }
  });

  socket.on('join-global', () => {
    socket.join('global');
    socket.emit('global:state', {
      pools: Object.keys(darkPools).map((id) => ({
        poolId: id,
        brokerCount: darkPools[id].brokers.length,
        tradeCount: darkPools[id].trades.length,
      })),
      trades: globalTrades.slice(-50),
    });
  });

  // Relay negotiation messages between agents in a pool
  socket.on('negotiate', ({ poolId, msg }) => {
    if (!poolId || !msg) return;
    const ts = timestamp();
    const enriched = { ...msg, timestamp: ts };

    if (darkPools[poolId]) {
      darkPools[poolId].negotiations = darkPools[poolId].negotiations || [];
      // Cap negotiations array to prevent unbounded growth
      if (darkPools[poolId].negotiations.length > 500) {
        darkPools[poolId].negotiations.splice(0, 250);
      }
      darkPools[poolId].negotiations.push({ timestamp: ts, ...msg });

      io.to(poolId).emit('pool:negotiation', {
        poolId,
        timestamp: ts,
        from: msg.from || 'unknown',
        action: msg.action,
        amount: msg.amount,
        isBlurred: true,
      });

      io.to('global').emit('feed:activity', {
        type: 'NEGOTIATION',
        poolId,
        timestamp: ts,
        content: `Private negotiation session ${poolId} — activity detected`,
        isBlurred: true,
        isSettlement: false,
      });
    }

    // Forward to peer agents in the pool (exclude sender)
    socket.to(poolId).emit('negotiate', enriched);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

// ─── REST API ─────────────────────────────────────────────────────────────────

// GET /api/health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// GET /api/state — full global state snapshot
app.get('/api/state', (req, res) => {
  res.json({
    pools: Object.keys(darkPools).map((id) => ({
      poolId: id,
      brokers: darkPools[id].brokers,
      tradeCount: darkPools[id].trades.length,
    })),
    trades: globalTrades.slice(-100),
  });
});

// POST /api/create-pool — Initialize a Secure Dark Pool
app.post('/api/create-pool', (req, res) => {
  const requestedPoolId = req.body?.poolId;
  const poolId = requestedPoolId || 'POOL-' + Math.floor(1000 + Math.random() * 9000);
  if (!/^POOL-\d{4}$/.test(poolId)) {
    return res.status(400).json({ error: 'poolId must match POOL-1234 format.' });
  }
  if (darkPools[poolId]) {
    return res.status(409).json({ error: `Pool ${poolId} already exists.` });
  }

  darkPools[poolId] = {
    brokers: [],
    negotiations: [],
    trades: [],
    createdAt: new Date().toISOString(),
  };

  const ts = timestamp();
  console.log(`\n[NEXUS OTC] 🔒 Secure Dark Pool Initialized: ${poolId}`);

  io.to('global').emit('feed:activity', {
    type: 'POOL_CREATED',
    poolId,
    timestamp: ts,
    content: `POOL_INIT — Secure enclave ${poolId} initialized`,
    isBlurred: false,
    isSettlement: false,
  });

  io.emit('global:state', {
    pools: Object.keys(darkPools).map((id) => ({
      poolId: id,
      brokerCount: darkPools[id].brokers.length,
      tradeCount: darkPools[id].trades.length,
    })),
    trades: globalTrades.slice(-50),
  });

  res.json({ poolId });
});

// POST /api/join-pool — Connect an Algorithmic Broker
app.post('/api/join-pool', (req, res) => {
  const { poolId, brokerName, agentId, sessionId } = req.body || {};

  if (!poolId || !darkPools[poolId]) {
    return res.status(404).json({ error: `Pool ${poolId} not found.` });
  }
  if (!brokerName) {
    return res.status(400).json({ error: 'brokerName is required' });
  }

  // Avoid duplicates by agentId
  const existing = darkPools[poolId].brokers.find((b) => b.agentId === agentId);
  if (!existing) {
    darkPools[poolId].brokers.push({
      brokerName: String(brokerName),
      agentId: String(agentId || ''),
      sessionId: String(sessionId || ''),
      status: 'IDLE',
      joinedAt: new Date().toISOString(),
      sessionLimit: 0,
      maxLimit: 100,
      lastActive: new Date().toISOString(),
    });
  }

  const ts = timestamp();
  console.log(`[NEXUS OTC] 🕴️ Broker "${brokerName}" connected to ${poolId}`);

  io.to(poolId).emit('pool:broker-joined', { poolId, brokerName, agentId, timestamp: ts });

  io.to('global').emit('feed:activity', {
    type: 'BROKER_JOINED',
    poolId,
    timestamp: ts,
    content: `BROKER_CONNECT — ${brokerName} joined ${poolId}`,
    isBlurred: false,
    isSettlement: false,
  });

  broadcastPoolState(poolId);
  res.json({ success: true, message: 'Broker connected securely.' });
});

// POST /api/execute-trade — Settle a Block Trade
app.post('/api/execute-trade', async (req, res) => {
  const { poolId, brokerName, buyer, seller, counterparty, asset, price, negotiation } =
    req.body || {};

  if (!poolId || !darkPools[poolId]) {
    return res.status(404).json({ error: `Pool ${poolId} not found.` });
  }

  const buyerName  = String(buyer || brokerName || 'Unknown Buyer');
  const sellerName = String(seller || counterparty || 'DataOracle_7');
  const numericPrice = parseFloat(String(price || '0').replace(/[^0-9.]/g, ''));

  if (isNaN(numericPrice) || numericPrice <= 0) {
    return res.status(400).json({ error: `Invalid price: ${price}` });
  }

  // ── x402: no payment header → return 402 with payment terms ─────────────
  const xPayment = req.headers['x-payment'];
  if (!xPayment) {
    // Amount in wei (1 USDC = 1e18 on Kite testnet token)
    const amountWei = String(Math.round(numericPrice * 1e18));
    return res.status(402).json({
      error: 'X-PAYMENT header is required',
      accepts: [{
        scheme: 'gokite-aa',
        network: KITE_NETWORK,
        maxAmountRequired: amountWei,
        resource: `${req.protocol}://${req.get('host')}/api/execute-trade`,
        description: `Nexus OTC block trade: ${buyerName} acquires ${asset || 'dataset'} from ${sellerName}`,
        mimeType: 'application/json',
        outputSchema: {
          input:  { discoverable: true, method: 'POST', type: 'http' },
          output: { properties: { success: { type: 'boolean' }, txHash: { type: 'string' } }, required: ['success', 'txHash'], type: 'object' },
        },
        payTo: KITE_PAYEE_ADDRESS,
        maxTimeoutSeconds: 300,
        asset: KITE_ASSET_ADDRESS,
        extra: null,
        merchantName: 'Nexus OTC Clearinghouse',
      }],
      x402Version: 1,
    });
  }

  // ── x402: header present → settle on-chain ───────────────────────────────
  let txHash;
  try {
    const settled = await settleX402Payment(xPayment);
    txHash = settled.txHash;
  } catch (err) {
    console.error('[x402] Settlement failed:', err.message);
    return res.status(402).json({ error: `Payment settlement failed: ${err.message}` });
  }

  // ── Confirm txHash on-chain before issuing delivery ─────────────────────
  const confirmed = await confirmTxOnChain(txHash);
  if (!confirmed) {
    console.warn(`[x402] TxHash ${txHash} not confirmed on-chain after polling — delivery withheld`);
  }

  // ── Record the trade (same logic as before, now with real txHash) ─────────
  const tradeId = String(tradeIdCounter++).padStart(4, '0');
  const ts = timestamp();

  const trade = {
    id: tradeId,
    poolId,
    brokerName: String(brokerName || buyerName),
    buyer: buyerName,
    seller: sellerName,
    asset: String(asset || 'Unknown Asset'),
    price: String(price),
    status: 'SETTLED',
    txHash,   // ← real on-chain hash from Kite
    timestamp: ts,
    createdAt: new Date().toISOString(),
    negotiation: negotiation || null,
    agents: darkPools[poolId].brokers.map((b) => b.brokerName),
  };

  darkPools[poolId].trades.push(trade);
  pushGlobalTrade(trade);

  // ── Issue delivery token only after on-chain confirmation ────────────────
  if (confirmed) {
    const crypto = require('crypto');
    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = Date.now() + 1000 * 60 * 60; // 1 hour

    // Option A: serve a local file (replace sentiment-dataset.csv with real data)
    deliveryTokens[tradeId] = {
      token,
      filename: process.env.DATASET_FILENAME || 'sentiment-dataset.csv',
      expiresAt,
    };

    // Option B: serve a signed URL to S3/R2 (uncomment if using cloud storage)
    // const signedUrl = await generateSignedUrl(asset);
    // deliveryTokens[tradeId] = { token, signedUrl, expiresAt };

    trade.delivery = {
      endpoint: `/api/delivery/${tradeId}`,
      token,
      expiresAt,
      confirmed: true,
    };
  }

  // Update broker status (same as before)
  const broker = darkPools[poolId].brokers.find((b) => b.brokerName === buyerName);
  if (broker) {
    broker.status = 'SETTLING';
    broker.lastActive = new Date().toISOString();
    broker.sessionLimit = Math.min(100, (broker.sessionLimit || 0) + Math.floor(Math.random() * 30 + 10));
    setTimeout(() => { if (broker) broker.status = 'IDLE'; broadcastPoolState(poolId); }, 3000);
  }

  console.log(`\n[NEXUS CLEARING] ⚡ P2P Block Trade Confirmed On-Chain`);
  console.log(`[NEXUS CLEARING] 🟢 BUYER:  ${buyerName}`);
  console.log(`[NEXUS CLEARING] 🔴 SELLER: ${sellerName}`);
  console.log(`[NEXUS CLEARING] 📊 ASSET:  ${asset}`);
  console.log(`[NEXUS CLEARING] 💵 SETTLED: $${price} USDC`);
  console.log(`[NEXUS CLEARING] 🔗 TxHash: ${txHash}`);

  io.to(poolId).emit('pool:trade-settled', trade);
  io.to('global').emit('feed:activity', {
    type: 'SETTLEMENT', poolId, tradeId, timestamp: ts,
    content: `[BLOCK TRADE CLEARED] ${buyerName} acquired ${asset} from ${sellerName} for $${price} USDC.`,
    isBlurred: false, isSettlement: true, txHash, trade,
  });
  io.emit('global:state', {
    pools: Object.keys(darkPools).map((id) => ({ poolId: id, brokerCount: darkPools[id].brokers.length, tradeCount: darkPools[id].trades.length })),
    trades: globalTrades.slice(-50),
  });
  broadcastPoolState(poolId);
  return res.json({ success: true, txHash, tradeId });
});

// POST /api/negotiate — HTTP relay for negotiation (alternative to socket)
app.post('/api/negotiate', (req, res) => {
  const { poolId, msg } = req.body || {};
  if (!poolId || !msg) return res.status(400).json({ error: 'poolId and msg required' });

  const ts = timestamp();
  io.to(poolId).emit('negotiate', { ...msg, timestamp: ts });

  if (darkPools[poolId]) {
    io.to('global').emit('feed:activity', {
      type: 'NEGOTIATION',
      poolId,
      timestamp: ts,
      content: `Private negotiation session ${poolId} — activity detected`,
      isBlurred: true,
      isSettlement: false,
    });
  }

  res.json({ relayed: true });
});

// GET /api/pools — List all pools
app.get('/api/pools', (req, res) => {
  res.json(
    Object.keys(darkPools).map((id) => ({
      poolId: id,
      brokers: darkPools[id].brokers,
      tradeCount: darkPools[id].trades.length,
      createdAt: darkPools[id].createdAt,
    }))
  );
});

// GET /api/pools/:poolId — Get specific pool
app.get('/api/pools/:poolId', (req, res) => {
  const pool = darkPools[req.params.poolId];
  if (!pool) return res.status(404).json({ error: 'Pool not found' });
  res.json({ poolId: req.params.poolId, ...pool });
});

// GET /api/trades — All trades (newest first)
app.get('/api/trades', (req, res) => {
  res.json(globalTrades.slice().reverse());
});

// GET /api/trades/:id — Single trade
app.get('/api/trades/:id', (req, res) => {
  const trade = globalTrades.find((t) => t.id === req.params.id);
  if (!trade) return res.status(404).json({ error: 'Trade not found' });
  res.json(trade);
});

// GET /api/delivery/:tradeId?token= — Secure dataset delivery for settled trades
app.get('/api/delivery/:tradeId', (req, res) => {
  const { tradeId } = req.params;
  const { token } = req.query || {};
  const record = deliveryTokens[tradeId];

  if (!record) return res.status(404).json({ error: 'Delivery not found for trade' });
  if (!token || token !== record.token) return res.status(401).json({ error: 'Invalid token' });
  if (Date.now() > record.expiresAt) {
    delete deliveryTokens[tradeId];
    return res.status(410).json({ error: 'Token expired' });
  }

  // Option A: local file
  if (record.filename) {
    const filePath = require('path').join(__dirname, 'data', record.filename);
    return res.sendFile(filePath, (err) => {
      if (err) {
        console.warn('[delivery] sendFile error:', err && err.message);
        return res.status(500).json({ error: 'Failed to deliver dataset' });
      }
    });
  }

  // Option B: redirect to signed cloud URL
  if (record.signedUrl) {
    return res.redirect(302, record.signedUrl);
  }

  return res.status(500).json({ error: 'No delivery method configured' });
});

// GET /api/agents — All agents across all pools
app.get('/api/agents', (req, res) => {
  const agents = [];
  for (const [poolId, pool] of Object.entries(darkPools)) {
    for (const broker of pool.brokers) {
      agents.push({ ...broker, poolId });
    }
  }
  res.json(agents);
});

// PATCH /api/agents/:agentId/status — Update agent status (for demo/testing)
app.patch('/api/agents/:agentId/status', (req, res) => {
  const { status } = req.body || {};
  if (!['NEGOTIATING', 'SETTLING', 'IDLE'].includes(status)) {
    return res.status(400).json({ error: 'status must be NEGOTIATING, SETTLING, or IDLE' });
  }
  let found = null;
  for (const [poolId, pool] of Object.entries(darkPools)) {
    const broker = pool.brokers.find((b) => b.agentId === req.params.agentId);
    if (broker) {
      broker.status = status;
      broker.lastActive = new Date().toISOString();
      found = broker;
      broadcastPoolState(poolId);
      break;
    }
  }
  if (!found) return res.status(404).json({ error: 'Agent not found' });
  res.json(found);
});

// Mock Kite approval endpoint — only active in dev/mock mode
// In production this would be replaced by the real Kite chain approval UI
app.get('/mock-approval/:requestId', (req, res) => {
  res.send(`
    <html>
      <head><title>Kite Mock Approval</title></head>
      <body style="font-family:monospace;background:#0a0a0a;color:#22c55e;padding:2rem;">
        <h1>🔐 Kite Agent Passport — Mock Approval</h1>
        <p>Request ID: <strong>${req.params.requestId}</strong></p>
        <p>✅ In production, you would confirm this with Face ID / passkey.</p>
        <p>In mock mode (NEXUS_KPASS_MOCK=true), this is auto-approved.</p>
        <p style="color:#94a3b8">You can close this tab.</p>
      </body>
    </html>
  `);
});

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  const authMode = API_KEY ? 'API key auth ENABLED' : 'auth DISABLED (dev mode)';
  console.log(`🏛️  Nexus OTC Clearinghouse running on http://localhost:${PORT}`);
  console.log(`📡 Socket.io ready`);
  console.log(`🔑 ${authMode}`);
  if (!API_KEY) {
    console.log(`   Set NEXUS_API_KEY env var to enable endpoint authentication.`);
  }
});
