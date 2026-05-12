"use strict";
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
exports.server = exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const fetchAny = (...args) => globalThis.fetch(...args);
const app = (0, express_1.default)();
exports.app = app;
app.set('trust proxy', true);
app.use((0, cors_1.default)({ origin: process.env.NEXUS_CORS_ORIGIN || '*' }));
app.use(express_1.default.json());
app.use('/data', express_1.default.static(path_1.default.join(__dirname, '..', 'data')));
const server = (0, http_1.createServer)(app);
exports.server = server;
const io = new socket_io_1.Server(server, {
    cors: { origin: process.env.NEXUS_CORS_ORIGIN || '*', methods: ['GET', 'POST', 'PATCH'] },
});
const PUBLIC_SERVER_URL = (process.env.NEXUS_PUBLIC_URL || process.env.NEXUS_SERVER_URL || '').replace(/\/+$/, '');
function getPublicMerchantUrl(req) {
    if (PUBLIC_SERVER_URL)
        return PUBLIC_SERVER_URL;
    const proto = req.get('x-forwarded-proto') || req.protocol;
    const host = req.get('x-forwarded-host') || req.get('host');
    return `${proto}://${host}`.replace(/\/+$/, '');
}
const brain_manager_1 = __importDefault(require("./brain-manager"));
const PORT = Number(process.env.PORT || 5000);
const API_KEY = process.env.NEXUS_API_KEY || null;
const KITE_FACILITATOR_URL = process.env.KITE_FACILITATOR_URL || 'https://facilitator.pieverse.io';
const KITE_PAYEE_ADDRESS = process.env.KITE_PAYEE_ADDRESS || '0x4A50DCA63d541372ad36E5A36F1D542d51164F19';
const KITE_ASSET_ADDRESS = process.env.KITE_ASSET_ADDRESS || '0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63';
const KITE_NETWORK = process.env.KITE_NETWORK || 'kite-testnet';
const KITE_EXPLORER_API = process.env.KITE_EXPLORER_API || 'https://testnet.kitescan.ai/api';
// Production mode only: real settlement through Kite Facilitator
const DELIVERY_TOKEN_TTL_MS = Number(process.env.DELIVERY_TOKEN_TTL_MS || 60 * 60 * 1000);
const DELIVERY_TOKEN_CLEANUP_MS = Number(process.env.DELIVERY_TOKEN_CLEANUP_MS || 60 * 1000);
const CONFIRM_MAX_ATTEMPTS = Number(process.env.NEXUS_CONFIRM_MAX_ATTEMPTS || 10);
const CONFIRM_DELAY_MS = Number(process.env.NEXUS_CONFIRM_DELAY_MS || 3000);
const RETRY_POLL_MS = Number(process.env.NEXUS_RETRY_POLL_MS || 10000);
function requireApiKey(req, res, next) {
    var _a;
    if (!API_KEY)
        return next();
    const provided = req.headers['x-api-key'] || ((_a = req.headers.authorization) === null || _a === void 0 ? void 0 : _a.replace(/^Bearer /, ''));
    if (provided !== API_KEY) {
        return res.status(401).json({ error: 'Unauthorized — invalid or missing API key' });
    }
    return next();
}
app.use('/api', requireApiKey);
const darkPools = {};
const globalTrades = [];
const deliveryTokens = {};
const pendingConfirmations = new Map();
const MAX_GLOBAL_TRADES = 1000;
let tradeIdCounter = 1;
function timestamp() {
    const now = new Date();
    return `${now.toTimeString().split(' ')[0]}.${String(now.getMilliseconds()).padStart(3, '0')}`;
}
function pushGlobalTrade(trade) {
    globalTrades.push(trade);
    if (globalTrades.length > MAX_GLOBAL_TRADES) {
        globalTrades.splice(0, globalTrades.length - MAX_GLOBAL_TRADES);
    }
}
function getGlobalState() {
    return {
        pools: Object.keys(darkPools).map((poolId) => ({
            poolId,
            brokerCount: darkPools[poolId].brokers.length,
            tradeCount: darkPools[poolId].trades.length,
        })),
        trades: globalTrades.slice(-50),
    };
}
function broadcastPoolState(poolId) {
    const pool = darkPools[poolId];
    if (!pool)
        return;
    io.to(poolId).emit('pool:state', {
        poolId,
        brokers: pool.brokers,
        trades: pool.trades,
    });
    io.emit('global:state', getGlobalState());
}
function settleX402Payment(xPaymentHeader) {
    return __awaiter(this, void 0, void 0, function* () {
        // TEMP: Pieverse /v2/settle is broken (confirmed 5/11/26, Kite Discord)
        // Remove this bypass once Pieverse is fixed
        if (process.env.NEXUS_BYPASS_SETTLEMENT === '1') {
            const fakeTxHash = '0x' + crypto_1.default.randomBytes(32).toString('hex');
            console.warn('[x402] BYPASS MODE: returning synthetic txHash', fakeTxHash);
            return { txHash: fakeTxHash };
        }
        let decoded;
        try {
            decoded = JSON.parse(Buffer.from(xPaymentHeader, 'base64').toString('utf8'));
        }
        catch (e) {
            throw new Error(`Invalid X-Payment header: ${e.message}`);
        }
        const settleRes = yield fetchAny(`${KITE_FACILITATOR_URL}/v2/settle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                authorization: decoded.authorization,
                signature: decoded.signature,
                network: KITE_NETWORK,
            }),
        });
        const settleData = yield settleRes.json();
        if (!settleRes.ok) {
            throw new Error(`Facilitator settle failed: ${JSON.stringify(settleData)}`);
        }
        const txHash = settleData.txHash || settleData.transaction_hash || settleData.hash;
        if (!txHash)
            throw new Error('Facilitator response missing txHash');
        return { txHash };
    });
}
function confirmTxOnChain(txHash_1) {
    return __awaiter(this, arguments, void 0, function* (txHash, maxAttempts = CONFIRM_MAX_ATTEMPTS, delayMs = CONFIRM_DELAY_MS) {
        var _a;
        if (process.env.NEXUS_BYPASS_SETTLEMENT === '1')
            return true;
        for (let i = 0; i < maxAttempts; i++) {
            try {
                const res = yield fetchAny(`${KITE_EXPLORER_API}?module=transaction&action=gettxreceiptstatus&txhash=${txHash}`);
                const data = yield res.json();
                if (((_a = data === null || data === void 0 ? void 0 : data.result) === null || _a === void 0 ? void 0 : _a.status) === '1')
                    return true;
            }
            catch (_b) {
                // Keep polling until attempts are exhausted.
            }
            if (i < maxAttempts - 1) {
                yield new Promise((r) => setTimeout(r, delayMs));
            }
        }
        return false;
    });
}
function issueDeliveryToken(trade) {
    const token = crypto_1.default.randomBytes(16).toString('hex');
    const expiresAt = Date.now() + DELIVERY_TOKEN_TTL_MS;
    deliveryTokens[trade.id] = {
        token,
        filename: process.env.DATASET_FILENAME || 'sentiment-dataset.csv',
        expiresAt,
    };
    const delivery = {
        endpoint: `/api/delivery/${trade.id}`,
        token,
        expiresAt,
        confirmed: true,
    };
    trade.delivery = delivery;
    return delivery;
}
function emitSettlementActivity(poolId, trade) {
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
    });
    io.emit('global:state', getGlobalState());
    broadcastPoolState(poolId);
}
function finalizeConfirmedTrade(poolId, trade) {
    trade.status = 'SETTLED';
    issueDeliveryToken(trade);
    emitSettlementActivity(poolId, trade);
}
function queuePendingConfirmation(trade) {
    pendingConfirmations.set(trade.id, { tradeId: trade.id, poolId: trade.poolId, txHash: trade.txHash });
}
function processPendingConfirmations() {
    return __awaiter(this, void 0, void 0, function* () {
        for (const [tradeId, pending] of pendingConfirmations.entries()) {
            const confirmed = yield confirmTxOnChain(pending.txHash, 1, 0);
            if (!confirmed)
                continue;
            pendingConfirmations.delete(tradeId);
            const trade = globalTrades.find((item) => item.id === tradeId);
            if (!trade)
                continue;
            finalizeConfirmedTrade(pending.poolId, trade);
        }
    });
}
setInterval(processPendingConfirmations, RETRY_POLL_MS).unref();
// Instantiate BrainManager to handle per-agent intelligence
const brainManager = new brain_manager_1.default(io);
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
    socket.on('join-pool', (poolId) => {
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
    socket.on('negotiate', ({ poolId, msg }) => {
        if (!poolId || !msg)
            return;
        const ts = timestamp();
        const enriched = Object.assign(Object.assign({}, msg), { timestamp: ts });
        if (darkPools[poolId]) {
            darkPools[poolId].negotiations.push(Object.assign({ timestamp: ts }, msg));
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
            });
        }
        socket.to(poolId).emit('negotiate', enriched);
    });
    socket.on('disconnect', () => {
        console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
});
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});
app.get('/api/state', (_req, res) => {
    res.json({
        pools: Object.keys(darkPools).map((id) => ({
            poolId: id,
            brokers: darkPools[id].brokers,
            tradeCount: darkPools[id].trades.length,
        })),
        trades: globalTrades.slice(-100),
    });
});
app.post('/api/create-pool', (req, res) => {
    const requestedPoolId = (req.body || {}).poolId;
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
    });
    io.emit('global:state', getGlobalState());
    return res.json({ poolId });
});
app.post('/api/join-pool', (req, res) => {
    const { poolId, brokerName, agentId, sessionId } = (req.body || {});
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
        const brokerObj = {
            brokerName: String(brokerName),
            agentId: String(agentId || ''),
            sessionId: String(sessionId || ''),
            status: 'IDLE',
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
            brainManager.registerAgent(poolId, brokerObj);
        }
        catch (e) {
            // non-fatal
            console.warn('[join-pool] brainManager registration failed', e && e.message);
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
    });
    broadcastPoolState(poolId);
    return res.json({ success: true, message: 'Broker connected securely.' });
});
app.post('/api/execute-trade', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { poolId, brokerName, buyer, seller, counterparty, asset, price, negotiation } = (req.body || {});
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
        const merchantUrl = getPublicMerchantUrl(req);
        return res.status(402).json({
            error: 'X-PAYMENT header is required',
            accepts: [
                {
                    scheme: 'gokite-aa',
                    network: KITE_NETWORK,
                    maxAmountRequired: amountWei,
                    resource: `${merchantUrl}/api/execute-trade`,
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
    let txHash;
    try {
        const settled = yield settleX402Payment(xPayment);
        txHash = settled.txHash;
    }
    catch (err) {
        console.error('[x402] Settlement failed:', err.message);
        return res.status(402).json({ error: `Payment settlement failed: ${err.message}` });
    }
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
    const confirmed = yield confirmTxOnChain(txHash);
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
}));
app.post('/api/negotiate', (req, res) => {
    const { poolId, msg } = (req.body || {});
    if (!poolId || !msg)
        return res.status(400).json({ error: 'poolId and msg required' });
    const ts = timestamp();
    io.to(poolId).emit('negotiate', Object.assign(Object.assign({}, msg), { timestamp: ts }));
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
    // Let the BrainManager process this message for configured agents
    try {
        void brainManager.handleIncoming(poolId, msg);
    }
    catch (e) {
        console.warn('[negotiate] brainManager handleIncoming error', e && e.message);
    }
    return res.json({ relayed: true });
});
app.get('/api/pools', (_req, res) => {
    res.json(Object.keys(darkPools).map((poolId) => ({
        poolId,
        brokers: darkPools[poolId].brokers,
        tradeCount: darkPools[poolId].trades.length,
        createdAt: darkPools[poolId].createdAt,
    })));
});
app.get('/api/pools/:poolId', (req, res) => {
    const { poolId } = req.params;
    const pool = darkPools[poolId];
    if (!pool)
        return res.status(404).json({ error: 'Pool not found' });
    return res.json(Object.assign({ poolId }, pool));
});
app.get('/api/trades', (_req, res) => {
    res.json(globalTrades.slice().reverse());
});
app.get('/api/trades/:id', (req, res) => {
    const { id } = req.params;
    const trade = globalTrades.find((item) => item.id === id);
    if (!trade)
        return res.status(404).json({ error: 'Trade not found' });
    return res.json(trade);
});
app.get('/api/delivery/:tradeId', (req, res) => {
    const { tradeId } = req.params;
    const token = String(req.query.token || '');
    const record = deliveryTokens[tradeId];
    if (!record)
        return res.status(404).json({ error: 'Delivery not found for trade' });
    if (!token || token !== record.token)
        return res.status(401).json({ error: 'Invalid token' });
    if (Date.now() > record.expiresAt) {
        delete deliveryTokens[tradeId];
        return res.status(410).json({ error: 'Token expired' });
    }
    if (record.filename) {
        const filePath = path_1.default.join(__dirname, '..', 'data', record.filename);
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
app.get('/api/agents', (_req, res) => {
    const agents = [];
    for (const [poolId, pool] of Object.entries(darkPools)) {
        for (const broker of pool.brokers) {
            agents.push(Object.assign(Object.assign({}, broker), { poolId }));
        }
    }
    return res.json(agents);
});
app.patch('/api/agents/:agentId/status', (req, res) => {
    const { status } = (req.body || {});
    if (!status || !['NEGOTIATING', 'SETTLING', 'IDLE'].includes(status)) {
        return res.status(400).json({ error: 'status must be NEGOTIATING, SETTLING, or IDLE' });
    }
    let found = null;
    const { agentId } = req.params;
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
    if (!found)
        return res.status(404).json({ error: 'Agent not found' });
    return res.json(found);
});
app.get('/.well-known/kite-payment.json', (req, res) => {
    const merchantUrl = getPublicMerchantUrl(req);
    res.json({
        name: 'Nexus OTC Clearinghouse',
        payTo: KITE_PAYEE_ADDRESS,
        asset: KITE_ASSET_ADDRESS,
        network: KITE_NETWORK,
        endpoints: [
            {
                path: '/api/execute-trade',
                method: 'POST',
                scheme: 'gokite-aa',
                description: 'OTC block trade settlement',
            },
        ],
        merchantUrl,
        version: '1',
    });
});
server.listen(PORT, () => {
    const authMode = API_KEY ? 'API key auth ENABLED' : 'auth DISABLED (dev mode)';
    console.log(`Nexus OTC Clearinghouse running on http://localhost:${PORT}`);
    console.log(`Socket.io ready`);
    console.log(authMode);
});
//# sourceMappingURL=app.js.map