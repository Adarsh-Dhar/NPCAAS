import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
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

type TradeRecord = {
    id: string;
    poolId: string;
    brokerName: string;
    asset: string;
    price: string;
    status: 'PENDING' | 'ACTIVE' | 'SETTLED';
    txHash: string;
    timestamp: string;
    createdAt: string;
    agents: string[];
    negotiation?: Record<string, unknown> | null;
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
    asset?: string;
    price?: string | number;
    negotiation?: Record<string, unknown> | null;
};

type ApiAgent = Broker & { poolId: string };

const app = express();
app.use(cors({ origin: process.env.NEXUS_CORS_ORIGIN || '*' }));
app.use(express.json());

const server = createServer(app);
const io = new Server(server, {
    cors: { origin: process.env.NEXUS_CORS_ORIGIN || '*', methods: ['GET', 'POST', 'PATCH'] },
});

const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.NEXUS_API_KEY || null;

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
    res.json(getGlobalState());
});

app.post('/api/create-pool', (_req: Request, res: Response) => {
    const poolId = `POOL-${Math.floor(1000 + Math.random() * 9000)}`;
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
    res.json({ poolId });
});

app.post('/api/join-pool', (req: Request, res: Response) => {
    const { poolId, brokerName, agentId, sessionId } = (req.body || {}) as JoinPoolBody;

    if (!poolId || !darkPools[poolId]) {
        return res.status(404).json({ error: `Pool ${poolId} not found.` });
    }

    if (!brokerName) {
        return res.status(400).json({ error: 'brokerName is required' });
    }

    const existing = darkPools[poolId].brokers.find((broker) => broker.agentId === agentId);
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
            poolId,
        });
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

app.post('/api/execute-trade', (req: Request, res: Response) => {
    const { poolId, brokerName, asset, price, negotiation } = (req.body || {}) as ExecuteTradeBody;

    if (!poolId || !darkPools[poolId]) {
        return res.status(404).json({ error: `Pool ${poolId} not found.` });
    }

    if (!brokerName || price === undefined || price === null) {
        return res.status(400).json({ error: 'brokerName and price are required' });
    }

    const numericPrice = parseFloat(String(price).replace(/[^0-9.]/g, ''));
    if (Number.isNaN(numericPrice) || numericPrice <= 0) {
        return res.status(400).json({ error: `Invalid price: ${price}` });
    }

    const tradeId = String(tradeIdCounter++).padStart(4, '0');
    const ts = timestamp();
    const txHash = `0x${Math.random().toString(16).slice(2, 18)}${Math.random().toString(16).slice(2, 18)}`;

    const trade: TradeRecord = {
        id: tradeId,
        poolId,
        brokerName: String(brokerName),
        asset: String(asset || 'Unknown Asset'),
        price: String(price),
        status: 'SETTLED',
        txHash,
        timestamp: ts,
        createdAt: new Date().toISOString(),
        negotiation: negotiation || null,
        agents: darkPools[poolId].brokers.map((broker) => broker.brokerName),
    };

    darkPools[poolId].trades.push(trade);
    pushGlobalTrade(trade);

    const broker = darkPools[poolId].brokers.find((item) => item.brokerName === brokerName);
    if (broker) {
        broker.status = 'SETTLING';
        broker.lastActive = new Date().toISOString();
        broker.sessionLimit = Math.min(100, (broker.sessionLimit || 0) + Math.floor(Math.random() * 30 + 10));
        setTimeout(() => {
            if (broker) broker.status = 'IDLE';
            broadcastPoolState(poolId);
        }, 3000);
    }

    io.to(poolId).emit('pool:trade-settled', trade);
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
    } satisfies FeedActivity);

    io.emit('global:state', getGlobalState());
    broadcastPoolState(poolId);
    return res.json({ success: true, txHash, tradeId });
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
                <h1>🔐 Kite Agent Passport — Mock Approval</h1>
                <p>Request ID: <strong>${requestId}</strong></p>
                <p>✅ In production, you would confirm this with Face ID / passkey.</p>
                <p>In mock mode (NEXUS_KPASS_MOCK=true), this is auto-approved.</p>
                <p style="color:#94a3b8">You can close this tab.</p>
            </body>
        </html>
    `);
});

server.listen(PORT, () => {
    const authMode = API_KEY ? 'API key auth ENABLED' : 'auth DISABLED (dev mode)';
    console.log(`🏛️  Nexus OTC Clearinghouse running on http://localhost:${PORT}`);
    console.log(`📡 Socket.io ready`);
    console.log(`🔑 ${authMode}`);
    if (!API_KEY) {
        console.log('   Set NEXUS_API_KEY env var to enable endpoint authentication.');
    }
});