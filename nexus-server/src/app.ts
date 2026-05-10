import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import crypto from 'crypto';
import { createServer } from 'http';
import { Server } from 'socket.io';

type Status = 'NEGOTIATING' | 'SETTLING' | 'IDLE';

type Broker = {
  brokerName: string;
  agentId: string;
  sessionId: string;
  status: Status;
  joinedAt: string;
  sessionLimit: number;
  maxLimit: number;
  lastActive: string;
  poolId?: string;
};

type NegotiationMessage = {
  action: string;
  amount: string;
  from: string;
  [key: string]: unknown;
};

type DeliveryRecord = {
  token: string;
  filename?: string;
  signedUrl?: string;
  expiresAt: number;
};

type DeliveryInfo = {
  endpoint: string;
  token: string;
  expiresAt: number;
  confirmed: boolean;
};

type TradeRecord = {
  id: string;
  poolId: string;
  brokerName: string;
  buyer: string;
  seller: string;
  asset: string;
  price: string;
  status: 'PENDING' | 'ACTIVE' | 'SETTLED';
  txHash: string;
  timestamp: string;
  createdAt: string;
  agents: string[];
  negotiation?: Record<string, unknown> | null;
  delivery?: DeliveryInfo;
};

type PoolState = {
  brokers: Broker[];
  negotiations: Array<Record<string, unknown>>;
  trades: TradeRecord[];
  createdAt: string;
};

type FeedActivity = {
  type: 'POOL_CREATED' | 'BROKER_JOINED' | 'NEGOTIATION' | 'SETTLEMENT';
  poolId: string;
  tradeId?: string;
  timestamp: string;
  content: string;
  isBlurred: boolean;
  isSettlement: boolean;
  txHash?: string;
  trade?: TradeRecord;
};

type GlobalState = {
  pools: { poolId: string; brokerCount: number; tradeCount: number }[];
  trades: TradeRecord[];
};

type JoinPoolBody = {
  poolId?: string;
  brokerName?: string;
  agentId?: string;
  sessionId?: string;
};

type ExecuteTradeBody = {
  poolId?: string;
  brokerName?: string;
  buyer?: string;
  seller?: string;
  counterparty?: string;
  asset?: string;
  price?: string | number;
  negotiation?: Record<string, unknown> | null;
};

type ApiAgent = Broker & { poolId: string };

type PendingConfirmation = {
  tradeId: string;
  poolId: string;
  txHash: string;
};

const fetchAny = (...args: any[]) => (globalThis as any).fetch(...args);

const app = express();
app.use(cors({ origin: process.env.NEXUS_CORS_ORIGIN || '*' }));
app.use(express.json());
app.use('/data', express.static(path.join(__dirname, '..', 'data')));

const server = createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.NEXUS_CORS_ORIGIN || '*', methods: ['GET', 'POST', 'PATCH'] },
});

import BrainManager from './brain-manager';

const PORT = Number(process.env.PORT || 5000);
const API_KEY = process.env.NEXUS_API_KEY || null;

const KITE_FACILITATOR_URL = process.env.KITE_FACILITATOR_URL || 'https://facilitator.pieverse.io';
const KITE_PAYEE_ADDRESS = process.env.KITE_PAYEE_ADDRESS || '0x4A50DCA63d541372ad36E5A36F1D542d51164F19';
const KITE_ASSET_ADDRESS = process.env.KITE_ASSET_ADDRESS || '0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63';
const KITE_NETWORK = process.env.KITE_NETWORK || 'kite-testnet';
const KITE_EXPLORER_API = process.env.KITE_EXPLORER_API || 'https://testnet.kitescan.ai/api';
const MOCK_SETTLEMENT =
  process.env.NEXUS_MOCK_SETTLEMENT === 'true' ||
  process.env.NEXUS_MOCK_SETTLEMENT === '1' ||
  process.env.NEXUS_KPASS_MOCK === 'true' ||
  process.env.NEXUS_KPASS_MOCK === '1';

const DELIVERY_TOKEN_TTL_MS = Number(process.env.DELIVERY_TOKEN_TTL_MS || 60 * 60 * 1000);
const DELIVERY_TOKEN_CLEANUP_MS = Number(process.env.DELIVERY_TOKEN_CLEANUP_MS || 60 * 1000);
const CONFIRM_MAX_ATTEMPTS = Number(process.env.NEXUS_CONFIRM_MAX_ATTEMPTS || 10);
const CONFIRM_DELAY_MS = Number(process.env.NEXUS_CONFIRM_DELAY_MS || 3000);
const RETRY_POLL_MS = Number(process.env.NEXUS_RETRY_POLL_MS || 10000);

function requireApiKey(req: Request, res: Response, next: NextFunction) {
  if (!API_KEY) return next();
  const provided = req.headers['x-api-key'] || req.headers.authorization?.replace(/^Bearer /, '');
  if (provided !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized — invalid or missing API key' });
  }
  return next();
}

app.use('/api', requireApiKey);

const darkPools: Record<string, PoolState> = {};
const globalTrades: TradeRecord[] = [];
const deliveryTokens: Record<string, DeliveryRecord> = {};
const pendingConfirmations = new Map<string, PendingConfirmation>();

const MAX_GLOBAL_TRADES = 1000;
let tradeIdCounter = 1;

function timestamp(): string {
  const now = new Date();
  return `${now.toTimeString().split(' ')[0]}.${String(now.getMilliseconds()).padStart(3, '0')}`;
}

function pushGlobalTrade(trade: TradeRecord) {
  globalTrades.push(trade);
  if (globalTrades.length > MAX_GLOBAL_TRADES) {
    globalTrades.splice(0, globalTrades.length - MAX_GLOBAL_TRADES);
  }
}

function getGlobalState(): GlobalState {
  return {
    pools: Object.keys(darkPools).map((poolId) => ({
      poolId,
      brokerCount: darkPools[poolId].brokers.length,
      tradeCount: darkPools[poolId].trades.length,
    })),
    trades: globalTrades.slice(-50),
  };
}

function broadcastPoolState(poolId: string) {
  const pool = darkPools[poolId];
  if (!pool) return;

  io.to(poolId).emit('pool:state', {
    poolId,
    brokers: pool.brokers,
    trades: pool.trades,
  });

  io.emit('global:state', getGlobalState());
}

async function settleX402Payment(xPaymentHeader: string): Promise<{ txHash: string }> {
  let decoded: { authorization?: unknown; signature?: unknown };
  try {
    decoded = JSON.parse(Buffer.from(xPaymentHeader, 'base64').toString('utf8'));
  } catch (e: any) {
    throw new Error(`Invalid X-Payment header: ${e.message}`);
  }

  if (MOCK_SETTLEMENT) {
    return { txHash: `0xmock${crypto.randomBytes(16).toString('hex')}` };
  }

  const settleRes = await fetchAny(`${KITE_FACILITATOR_URL}/v2/settle`, {
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

  const txHash = settleData.txHash || settleData.transaction_hash || settleData.hash;
  if (!txHash) throw new Error('Facilitator response missing txHash');
  return { txHash };
}

async function confirmTxOnChain(txHash: string, maxAttempts = CONFIRM_MAX_ATTEMPTS, delayMs = CONFIRM_DELAY_MS): Promise<boolean> {
  if (MOCK_SETTLEMENT && txHash.startsWith('0xmock')) return true;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetchAny(
        `${KITE_EXPLORER_API}?module=transaction&action=gettxreceiptstatus&txhash=${txHash}`
      );
      const data = await res.json();
      if (data?.result?.status === '1') return true;
    } catch {
      // Keep polling until attempts are exhausted.
    }

    if (i < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return false;
}

function issueDeliveryToken(trade: TradeRecord): DeliveryInfo {
  const token = crypto.randomBytes(16).toString('hex');
  const expiresAt = Date.now() + DELIVERY_TOKEN_TTL_MS;

  deliveryTokens[trade.id] = {
    token,
    filename: process.env.DATASET_FILENAME || 'sentiment-dataset.csv',
    expiresAt,
  };

  const delivery: DeliveryInfo = {
    endpoint: `/api/delivery/${trade.id}`,
    token,
    expiresAt,
    confirmed: true,
  };

  trade.delivery = delivery;
  return delivery;
}

function emitSettlementActivity(poolId: string, trade: TradeRecord) {
  const ts = timestamp();
  io.to(poolId).emit('pool:trade-settled', trade);
  io.to('global').emit('feed:activity', {
    type: 'SETTLEMENT',
    poolId,
    tradeId: trade.id,
    timestamp: ts,
    content: `[BLOCK TRADE CLEARED] ${trade.buyer} acquired ${trade.asset} from ${trade.seller} for $${trade.price} USDC.`,
    isBlurred: false,
    isSettlement: true,
    txHash: trade.txHash,
    trade,
  } satisfies FeedActivity);

  io.emit('global:state', getGlobalState());
  broadcastPoolState(poolId);
}

function finalizeConfirmedTrade(poolId: string, trade: TradeRecord) {
  trade.status = 'SETTLED';
  issueDeliveryToken(trade);
  emitSettlementActivity(poolId, trade);
}

function queuePendingConfirmation(trade: TradeRecord) {
  pendingConfirmations.set(trade.id, { tradeId: trade.id, poolId: trade.poolId, txHash: trade.txHash });
}

async function processPendingConfirmations() {
  for (const [tradeId, pending] of pendingConfirmations.entries()) {
    const confirmed = await confirmTxOnChain(pending.txHash, 1, 0);
    if (!confirmed) continue;

    pendingConfirmations.delete(tradeId);
    const trade = globalTrades.find((item) => item.id === tradeId);
    if (!trade) continue;

    finalizeConfirmedTrade(pending.poolId, trade);
  }
}

setInterval(processPendingConfirmations, RETRY_POLL_MS).unref();

// Instantiate BrainManager to handle per-agent intelligence
const brainManager = new BrainManager(io);

function cleanupExpiredDeliveryTokens() {
  const now = Date.now();
  for (const [tradeId, record] of Object.entries(deliveryTokens)) {
    if (record.expiresAt <= now) {
      delete deliveryTokens[tradeId];
    }
  }
}

setInterval(cleanupExpiredDeliveryTokens, DELIVERY_TOKEN_CLEANUP_MS).unref();

io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  socket.on('join-pool', (poolId: string) => {
    socket.join(poolId);
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
    socket.emit('global:state', getGlobalState());
  });

  socket.on('negotiate', ({ poolId, msg }: { poolId?: string; msg?: NegotiationMessage }) => {
    if (!poolId || !msg) return;

    const ts = timestamp();
    const enriched = { ...msg, timestamp: ts };

    if (darkPools[poolId]) {
      darkPools[poolId].negotiations.push({ timestamp: ts, ...msg });
      if (darkPools[poolId].negotiations.length > 500) {
        darkPools[poolId].negotiations.splice(0, 250);
      }

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
      } satisfies FeedActivity);
    }

    socket.to(poolId).emit('negotiate', enriched);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.get('/api/state', (_req: Request, res: Response) => {
  res.json({
    pools: Object.keys(darkPools).map((id) => ({
      poolId: id,
      brokers: darkPools[id].brokers,
      tradeCount: darkPools[id].trades.length,
    })),
    trades: globalTrades.slice(-100),
  });
});

app.post('/api/create-pool', (req: Request, res: Response) => {
  const requestedPoolId = (req.body || {}).poolId as string | undefined;
  const poolId = requestedPoolId || `POOL-${Math.floor(1000 + Math.random() * 9000)}`;

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
  io.to('global').emit('feed:activity', {
    type: 'POOL_CREATED',
    poolId,
    timestamp: ts,
    content: `POOL_INIT — Secure enclave ${poolId} initialized`,
    isBlurred: false,
    isSettlement: false,
  } satisfies FeedActivity);

  io.emit('global:state', getGlobalState());
  return res.json({ poolId });
});

app.post('/api/join-pool', (req: Request, res: Response) => {
  const { poolId, brokerName, agentId, sessionId } = (req.body || {}) as JoinPoolBody;

  if (!poolId || !darkPools[poolId]) {
    return res.status(404).json({ error: `Pool ${poolId} not found.` });
  }
  if (!brokerName) {
    return res.status(400).json({ error: 'brokerName is required' });
  }

  // allow optional brainConfig to be sent at join time
  const brainConfig = (req.body || {}).brainConfig || null;

  const existing = darkPools[poolId].brokers.find((broker) => broker.agentId === agentId);
  if (!existing) {
    const brokerObj: Broker & { brainConfig: unknown } = {
      brokerName: String(brokerName),
      agentId: String(agentId || ''),
      sessionId: String(sessionId || ''),
      status: 'IDLE' as Status,
      joinedAt: new Date().toISOString(),
      sessionLimit: 0,
      maxLimit: 100,
      lastActive: new Date().toISOString(),
      poolId,
      brainConfig,
    };
    darkPools[poolId].brokers.push(brokerObj);

    // register agent with BrainManager so it can handle negotiations
    try {
      // brainManager is instantiated near module init
      (brainManager as any).registerAgent(poolId, brokerObj);
    } catch (e) {
      // non-fatal
      console.warn('[join-pool] brainManager registration failed', e && (e as Error).message);
    }
  }

  const ts = timestamp();
  io.to(poolId).emit('pool:broker-joined', { poolId, brokerName, agentId, timestamp: ts });
  io.to('global').emit('feed:activity', {
    type: 'BROKER_JOINED',
    poolId,
    timestamp: ts,
    content: `BROKER_CONNECT — ${brokerName} joined ${poolId}`,
    isBlurred: false,
    isSettlement: false,
  } satisfies FeedActivity);

  broadcastPoolState(poolId);
  return res.json({ success: true, message: 'Broker connected securely.' });
});

app.post('/api/execute-trade', async (req: Request, res: Response) => {
  const { poolId, brokerName, buyer, seller, counterparty, asset, price, negotiation } =
    (req.body || {}) as ExecuteTradeBody;

  if (!poolId || !darkPools[poolId]) {
    return res.status(404).json({ error: `Pool ${poolId} not found.` });
  }

  const buyerName = String(buyer || brokerName || 'Unknown Buyer');
  const sellerName = String(seller || counterparty || 'DataOracle_7');
  const numericPrice = parseFloat(String(price || '0').replace(/[^0-9.]/g, ''));

  if (Number.isNaN(numericPrice) || numericPrice <= 0) {
    return res.status(400).json({ error: `Invalid price: ${price}` });
  }

  const xPayment = req.headers['x-payment'];
  if (!xPayment || typeof xPayment !== 'string') {
    const amountWei = String(Math.round(numericPrice * 1e18));
    return res.status(402).json({
      error: 'X-PAYMENT header is required',
      accepts: [
        {
          scheme: 'gokite-aa',
          network: KITE_NETWORK,
          maxAmountRequired: amountWei,
          resource: `${req.protocol}://${req.get('host')}/api/execute-trade`,
          description: `Nexus OTC block trade: ${buyerName} acquires ${asset || 'dataset'} from ${sellerName}`,
          mimeType: 'application/json',
          outputSchema: {
            input: { discoverable: true, method: 'POST', type: 'http' },
            output: {
              properties: { success: { type: 'boolean' }, txHash: { type: 'string' } },
              required: ['success', 'txHash'],
              type: 'object',
            },
          },
          payTo: KITE_PAYEE_ADDRESS,
          maxTimeoutSeconds: 300,
          asset: KITE_ASSET_ADDRESS,
          extra: null,
          merchantName: 'Nexus OTC Clearinghouse',
        },
      ],
      x402Version: 1,
    });
  }

  let txHash: string;
  try {
    const settled = await settleX402Payment(xPayment);
    txHash = settled.txHash;
  } catch (err: any) {
    console.error('[x402] Settlement failed:', err.message);
    return res.status(402).json({ error: `Payment settlement failed: ${err.message}` });
  }

  const tradeId = String(tradeIdCounter++).padStart(4, '0');
  const ts = timestamp();
  const trade: TradeRecord = {
    id: tradeId,
    poolId,
    brokerName: String(brokerName || buyerName),
    buyer: buyerName,
    seller: sellerName,
    asset: String(asset || 'Unknown Asset'),
    price: String(price),
    status: 'PENDING',
    txHash,
    timestamp: ts,
    createdAt: new Date().toISOString(),
    negotiation: negotiation || null,
    agents: darkPools[poolId].brokers.map((b) => b.brokerName),
  };

  darkPools[poolId].trades.push(trade);
  pushGlobalTrade(trade);

  const broker = darkPools[poolId].brokers.find((b) => b.brokerName === buyerName);
  if (broker) {
    broker.status = 'SETTLING';
    broker.lastActive = new Date().toISOString();
    broker.sessionLimit = Math.min(100, (broker.sessionLimit || 0) + Math.floor(Math.random() * 30 + 10));
    setTimeout(() => {
      broker.status = 'IDLE';
      broadcastPoolState(poolId);
    }, 3000).unref();
  }

  const confirmed = await confirmTxOnChain(txHash);
  if (!confirmed) {
    queuePendingConfirmation(trade);
    io.emit('global:state', getGlobalState());
    broadcastPoolState(poolId);
    return res.status(202).json({
      success: true,
      pending: true,
      tradeId,
      txHash,
      message: 'Transaction submitted but not yet confirmed. Retry queue active.',
    });
  }

  finalizeConfirmedTrade(poolId, trade);
  return res.json({ success: true, tradeId, txHash, delivery: trade.delivery });
});

app.post('/api/negotiate', (req: Request, res: Response) => {
  const { poolId, msg } = (req.body || {}) as { poolId?: string; msg?: NegotiationMessage };
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
    } satisfies FeedActivity);
  }

  // Let the BrainManager process this message for configured agents
  try {
    void (brainManager as any).handleIncoming(poolId, msg);
  } catch (e) {
    console.warn('[negotiate] brainManager handleIncoming error', e && (e as Error).message);
  }

  return res.json({ relayed: true });
});

app.get('/api/pools', (_req: Request, res: Response) => {
  res.json(
    Object.keys(darkPools).map((poolId) => ({
      poolId,
      brokers: darkPools[poolId].brokers,
      tradeCount: darkPools[poolId].trades.length,
      createdAt: darkPools[poolId].createdAt,
    }))
  );
});

app.get('/api/pools/:poolId', (req: Request, res: Response) => {
  const { poolId } = req.params as { poolId: string };
  const pool = darkPools[poolId];
  if (!pool) return res.status(404).json({ error: 'Pool not found' });
  return res.json({ poolId, ...pool });
});

app.get('/api/trades', (_req: Request, res: Response) => {
  res.json(globalTrades.slice().reverse());
});

app.get('/api/trades/:id', (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const trade = globalTrades.find((item) => item.id === id);
  if (!trade) return res.status(404).json({ error: 'Trade not found' });
  return res.json(trade);
});

app.get('/api/delivery/:tradeId', (req: Request, res: Response) => {
  const { tradeId } = req.params as { tradeId: string };
  const token = String(req.query.token || '');
  const record = deliveryTokens[tradeId];

  if (!record) return res.status(404).json({ error: 'Delivery not found for trade' });
  if (!token || token !== record.token) return res.status(401).json({ error: 'Invalid token' });
  if (Date.now() > record.expiresAt) {
    delete deliveryTokens[tradeId];
    return res.status(410).json({ error: 'Token expired' });
  }

  if (record.filename) {
    const filePath = path.join(__dirname, '..', 'data', record.filename);
    return res.sendFile(filePath, (err) => {
      if (err) {
        console.warn('[delivery] sendFile error:', err && err.message);
        return res.status(500).json({ error: 'Failed to deliver dataset' });
      }
      return undefined;
    });
  }

  if (record.signedUrl) {
    return res.redirect(302, record.signedUrl);
  }

  return res.status(500).json({ error: 'No delivery method configured' });
});

app.get('/api/agents', (_req: Request, res: Response) => {
  const agents: ApiAgent[] = [];
  for (const [poolId, pool] of Object.entries(darkPools)) {
    for (const broker of pool.brokers) {
      agents.push({ ...broker, poolId });
    }
  }
  return res.json(agents);
});

app.patch('/api/agents/:agentId/status', (req: Request, res: Response) => {
  const { status } = (req.body || {}) as { status?: Status };
  if (!status || !['NEGOTIATING', 'SETTLING', 'IDLE'].includes(status)) {
    return res.status(400).json({ error: 'status must be NEGOTIATING, SETTLING, or IDLE' });
  }

  let found: Broker | null = null;
  const { agentId } = req.params as { agentId: string };
  for (const [poolId, pool] of Object.entries(darkPools)) {
    const broker = pool.brokers.find((item) => item.agentId === agentId);
    if (broker) {
      broker.status = status;
      broker.lastActive = new Date().toISOString();
      found = broker;
      broadcastPoolState(poolId);
      break;
    }
  }

  if (!found) return res.status(404).json({ error: 'Agent not found' });
  return res.json(found);
});

app.get('/mock-approval/:requestId', (req: Request, res: Response) => {
  const { requestId } = req.params as { requestId: string };
  res.send(`
    <html>
      <head><title>Kite Mock Approval</title></head>
      <body style="font-family:monospace;background:#0a0a0a;color:#22c55e;padding:2rem;">
        <h1>Kite Agent Passport - Mock Approval</h1>
        <p>Request ID: <strong>${requestId}</strong></p>
        <p>In production, this is a real passkey confirmation flow.</p>
        <p>In mock mode (NEXUS_KPASS_MOCK=true), this is auto-approved.</p>
      </body>
    </html>
  `);
});

server.listen(PORT, () => {
  const authMode = API_KEY ? 'API key auth ENABLED' : 'auth DISABLED (dev mode)';
  console.log(`Nexus OTC Clearinghouse running on http://localhost:${PORT}`);
  console.log(`Socket.io ready`);
  console.log(authMode);
});
