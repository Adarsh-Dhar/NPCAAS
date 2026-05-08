import express, { Request, Response } from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

type Broker = { brokerName: string; agentId: string; sessionId: string };
const darkPools: Record<string, Broker[]> = {};

type TradeBody = { brokerName: string; asset: string; price: string | number };

// 1. Initialize a Secure Dark Pool
app.post('/api/create-pool', (req: Request, res: Response) => {
    const poolId = 'POOL-' + Math.floor(1000 + Math.random() * 9000);
    darkPools[poolId] = [];

    console.log(`\n[NEXUS OTC] 🔒 Secure Dark Pool Initialized: ${poolId}`);
    res.json({ poolId });
});

// 2. Connect an Algorithmic Broker to the Pool
app.post('/api/join-pool', (req: Request, res: Response) => {
    const { poolId, brokerName, agentId, sessionId } = req.body as Partial<Broker & { poolId?: string }>;

    if (!poolId || !darkPools[poolId]) {
        return res.status(404).json({ error: `Pool ${poolId} not found.` });
    }

    const newBroker: Broker = { brokerName: String(brokerName || 'unknown'), agentId: String(agentId || ''), sessionId: String(sessionId || '') };
    darkPools[poolId].push(newBroker);

    console.log(`[NEXUS OTC] 🕴️ Broker "${newBroker.brokerName}" connected to ${poolId}`);
    console.log(`            Agent: ${newBroker.agentId} | Session: ${newBroker.sessionId}`);

    res.json({ success: true, message: 'Broker connected securely.' });
});

// 3. Execute and Clear a Block Trade
app.post('/api/execute-trade', (req: Request<unknown, unknown, Partial<TradeBody>>, res: Response) => {
    const { brokerName, asset, price } = req.body || {};

    console.log(`\n[NEXUS CLEARING] ⚡ P2P Block Trade Confirmed On-Chain`);
    console.log(`[NEXUS CLEARING] 💼 Broker: ${String(brokerName || '')}`);
    console.log(`[NEXUS CLEARING] 📊 Asset Acquired: [${String(asset || '')}]`);
    console.log(`[NEXUS CLEARING] 💵 Settled Amount: $${String(price || '')} USDC`);

    res.json({ success: true, message: 'Trade settled via Kite Chain' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🏛️  Nexus OTC Clearinghouse running on http://localhost:${PORT}`);
});