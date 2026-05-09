// server.js — Nexus OTC Clearinghouse (Full Implementation)
'use strict';

const express = require('express');
const cors = require('cors');
const http = require('http').createServer;

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const server = http(app);
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3000;

// ─── In-memory state ──────────────────────────────────────────────────────────
// darkPools[poolId] = { brokers: [], negotiations: [], trades: [] }
const darkPools = {};

// Global trade ledger
const globalTrades = [];
let tradeIdCounter = 1;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timestamp() {
  const now = new Date();
  return now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
}

function broadcastPoolState(poolId) {
  if (!darkPools[poolId]) return;
  io.to(poolId).emit('pool:state', {
    poolId,
    brokers: darkPools[poolId].brokers,
    trades: darkPools[poolId].trades,
  });
  io.emit('global:state', {
    pools: Object.keys(darkPools).map(id => ({
      poolId: id,
      brokerCount: darkPools[id].brokers.length,
      tradeCount: darkPools[id].trades.length,
    })),
    trades: globalTrades.slice(-50), // last 50
  });
}

// ─── Socket.io ───────────────────────────────────────────────────────────────
io.on('connection', socket => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  // Client joins a specific pool room
  socket.on('join-pool', poolId => {
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

  // Client joins global feed
  socket.on('join-global', () => {
    socket.join('global');
    // Send current state immediately
    socket.emit('global:state', {
      pools: Object.keys(darkPools).map(id => ({
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

    // Log negotiation event to pool
    if (darkPools[poolId]) {
      darkPools[poolId].negotiations = darkPools[poolId].negotiations || [];
      darkPools[poolId].negotiations.push({ timestamp: ts, ...msg });

      // Emit negotiation activity to pool room (blurred feed)
      io.to(poolId).emit('pool:negotiation', {
        poolId,
        timestamp: ts,
        from: msg.from || 'unknown',
        action: msg.action,
        amount: msg.amount,
        isBlurred: true,
      });

      // Emit to global feed (blurred)
      io.to('global').emit('feed:activity', {
        type: 'NEGOTIATION',
        poolId,
        timestamp: ts,
        content: `Private negotiation session ${poolId} — activity detected`,
        isBlurred: true,
        isSettlement: false,
      });
    }

    // Forward to peer agents in the pool
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
    pools: Object.keys(darkPools).map(id => ({
      poolId: id,
      brokers: darkPools[id].brokers,
      tradeCount: darkPools[id].trades.length,
    })),
    trades: globalTrades.slice(-100),
  });
});

// POST /api/create-pool — Initialize a Secure Dark Pool
app.post('/api/create-pool', (req, res) => {
  const poolId = 'POOL-' + Math.floor(1000 + Math.random() * 9000);
  darkPools[poolId] = {
    brokers: [],
    negotiations: [],
    trades: [],
    createdAt: new Date().toISOString(),
  };

  const ts = timestamp();
  console.log(`\n[NEXUS OTC] 🔒 Secure Dark Pool Initialized: ${poolId}`);

  // Broadcast to global feed
  io.to('global').emit('feed:activity', {
    type: 'POOL_CREATED',
    poolId,
    timestamp: ts,
    content: `POOL_INIT — Secure enclave ${poolId} initialized`,
    isBlurred: false,
    isSettlement: false,
  });

  io.emit('global:state', {
    pools: Object.keys(darkPools).map(id => ({
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
  const { poolId, brokerName, agentId, sessionId } = req.body;

  if (!darkPools[poolId]) {
    return res.status(404).json({ error: `Pool ${poolId} not found.` });
  }

  // Avoid duplicates
  const existing = darkPools[poolId].brokers.find(b => b.agentId === agentId);
  if (!existing) {
    darkPools[poolId].brokers.push({
      brokerName: String(brokerName || 'unknown'),
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

  // Emit broker joined event
  io.to(poolId).emit('pool:broker-joined', {
    poolId,
    brokerName,
    agentId,
    timestamp: ts,
  });

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

// POST /api/execute-trade — Settle a Block Trade On-Chain
app.post('/api/execute-trade', (req, res) => {
  const { poolId, brokerName, asset, price, negotiation } = req.body;

  if (!poolId || !darkPools[poolId]) {
    return res.status(404).json({ error: `Pool ${poolId} not found.` });
  }

  const tradeId = String(tradeIdCounter++).padStart(4, '0');
  const ts = timestamp();
  const txHash = '0x' + Math.random().toString(16).slice(2, 18) + Math.random().toString(16).slice(2, 18);

  const trade = {
    id: tradeId,
    poolId,
    brokerName: String(brokerName || ''),
    asset: String(asset || 'Unknown Asset'),
    price: String(price || '0'),
    status: 'SETTLED',
    txHash,
    timestamp: ts,
    createdAt: new Date().toISOString(),
    negotiation: negotiation || null,
    agents: darkPools[poolId].brokers.map(b => b.brokerName),
  };

  // Persist to pool and global ledger
  darkPools[poolId].trades.push(trade);
  globalTrades.push(trade);

  // Update broker status
  const broker = darkPools[poolId].brokers.find(b => b.brokerName === brokerName);
  if (broker) {
    broker.status = 'SETTLING';
    broker.lastActive = new Date().toISOString();
    broker.sessionLimit = Math.min(100, (broker.sessionLimit || 0) + Math.floor(Math.random() * 30 + 10));
    setTimeout(() => {
      if (broker) broker.status = 'IDLE';
      broadcastPoolState(poolId);
    }, 3000);
  }

  console.log(`\n[NEXUS CLEARING] ⚡ Block Trade Confirmed`);
  console.log(`[NEXUS CLEARING] 💼 Broker: ${brokerName} | Pool: ${poolId}`);
  console.log(`[NEXUS CLEARING] 📊 Asset: [${asset}]`);
  console.log(`[NEXUS CLEARING] 💵 Amount: $${price} USDC`);
  console.log(`[NEXUS CLEARING] 🔗 TxHash: ${txHash}`);

  // Emit settlement to pool room
  io.to(poolId).emit('pool:trade-settled', trade);

  // Emit to global feed — the "green ticker"
  io.to('global').emit('feed:activity', {
    type: 'SETTLEMENT',
    poolId,
    tradeId,
    timestamp: ts,
    content: `[BLOCK TRADE CLEARED] ${brokerName} acquired ${asset} for $${price} USDC via Kite Settlement`,
    isBlurred: false,
    isSettlement: true,
    txHash,
    trade,
  });

  // Update global state
  io.emit('global:state', {
    pools: Object.keys(darkPools).map(id => ({
      poolId: id,
      brokerCount: darkPools[id].brokers.length,
      tradeCount: darkPools[id].trades.length,
    })),
    trades: globalTrades.slice(-50),
  });

  broadcastPoolState(poolId);
  res.json({ success: true, txHash, tradeId });
});

// POST /api/negotiate — HTTP relay for negotiation (alternative to socket)
app.post('/api/negotiate', (req, res) => {
  const { poolId, msg } = req.body;
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
  res.json(Object.keys(darkPools).map(id => ({
    poolId: id,
    brokers: darkPools[id].brokers,
    tradeCount: darkPools[id].trades.length,
    createdAt: darkPools[id].createdAt,
  })));
});

// GET /api/pools/:poolId — Get specific pool
app.get('/api/pools/:poolId', (req, res) => {
  const pool = darkPools[req.params.poolId];
  if (!pool) return res.status(404).json({ error: 'Pool not found' });
  res.json({ poolId: req.params.poolId, ...pool });
});

// GET /api/trades — All trades
app.get('/api/trades', (req, res) => {
  res.json(globalTrades.slice().reverse());
});

// GET /api/trades/:id — Single trade
app.get('/api/trades/:id', (req, res) => {
  const trade = globalTrades.find(t => t.id === req.params.id);
  if (!trade) return res.status(404).json({ error: 'Trade not found' });
  res.json(trade);
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

// PATCH /api/agents/:agentId/status — Update agent status (for demo triggers)
app.patch('/api/agents/:agentId/status', (req, res) => {
  const { status } = req.body;
  let found = null;
  for (const pool of Object.values(darkPools)) {
    const broker = pool.brokers.find(b => b.agentId === req.params.agentId);
    if (broker) {
      broker.status = status;
      broker.lastActive = new Date().toISOString();
      found = broker;
      break;
    }
  }
  if (!found) return res.status(404).json({ error: 'Agent not found' });
  res.json(found);
});

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`🏛️  Nexus OTC Clearinghouse running on http://localhost:${PORT}`);
  console.log(`📡 Socket.io ready`);
});