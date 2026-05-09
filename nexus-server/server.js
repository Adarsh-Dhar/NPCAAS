// server.js — Nexus OTC Clearinghouse
const express = require('express');
const cors = require('cors');
const { execSync } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Socket.io FIRST, before any routes
const http = require('http').createServer(app);
const { Server } = require('socket.io');
const io = new Server(http, { cors: { origin: '*' } });

io.on('connection', socket => {
  socket.on('join-pool', poolId => socket.join(poolId));
  socket.on('negotiate', ({ poolId, msg }) => {
    socket.to(poolId).emit('negotiate', msg); // relay to peer agents only
  });
});

const PORT = process.env.PORT || 3000;
const SETTLEMENT_URL = process.env.NEXUS_SETTLEMENT_URL;

// In-memory database of active secure trading environments
const darkPools = {};

// 1. Initialize a Secure Dark Pool
app.post('/api/create-pool', (req, res) => {
    const poolId = 'POOL-' + Math.floor(1000 + Math.random() * 9000);
    darkPools[poolId] = [];

    console.log(`\n[NEXUS OTC] 🔒 Secure Dark Pool Initialized: ${poolId}`);
    res.json({ poolId });
});

// 2. Connect an Algorithmic Broker to the Pool
app.post('/api/join-pool', (req, res) => {
    const { poolId, brokerName, agentId, sessionId } = req.body;

    if (!darkPools[poolId]) {
        return res.status(404).json({ error: `Pool ${poolId} not found.` });
    }

    darkPools[poolId].push({ brokerName, agentId, sessionId });

    console.log(`[NEXUS OTC] 🕴️ Broker "${brokerName}" connected to ${poolId}`);
    console.log(`            Agent: ${agentId} | Session: ${sessionId}`);

    res.json({ success: true, message: 'Broker connected securely.' });
});

// 3. Execute and Clear a Block Trade
app.post('/api/execute-trade', (req, res) => {
  const { brokerName, asset, price, sessionId } = req.body;

  try {
    if (!SETTLEMENT_URL) {
      throw new Error('NEXUS_SETTLEMENT_URL is required');
    }

    const result = JSON.parse(
      execSync(`kpass agent:session execute \
    --session-id ${sessionId} \
    --url ${JSON.stringify(SETTLEMENT_URL)} \
    --body ${JSON.stringify(JSON.stringify({ asset, price }))} \
    --output json`, { encoding: 'utf8' })
    );

    console.log(`\n[NEXUS CLEARING] ⚡ P2P Block Trade Confirmed On-Chain`);
    console.log(`[NEXUS CLEARING] 💼 Broker: ${brokerName}`);
    console.log(`[NEXUS CLEARING] 📊 Asset Acquired: [${asset}]`);
    console.log(`[NEXUS CLEARING] 💵 Settled Amount: $${price} USDC`);

    io.emit('BLOCK_TRADE_CLEARED', { brokerName, asset, price, txHash: result.x402?.tx_hash });
    res.json({ success: true, txHash: result.x402?.tx_hash });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/negotiate', (req, res) => {
  const { poolId, msg } = req.body; // msg = {action, amount, from}
  io.to(poolId).emit('negotiate', msg);
  res.json({ relayed: true });
});

http.listen(PORT, () => console.log(`Nexus OTC running on ${PORT}`));
