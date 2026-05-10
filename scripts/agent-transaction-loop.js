'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { getSignedXPayment } = require('../lib/kite-payment');

const SERVER_URL = process.env.NEXUS_SERVER_URL || 'http://localhost:5000';
const POOL_ID = process.env.NEXUS_POOL_ID || process.argv[2];
const INTERVAL_MS = Number(process.env.NEXUS_TX_LOOP_INTERVAL_MS || 15000);
const ASSET = process.env.NEXUS_TX_LOOP_ASSET || 'Real-Time Sentiment Dataset';
const PRICE = process.env.NEXUS_TX_LOOP_PRICE || '0.50';
const MOCK_SETTLEMENT =
  process.env.NEXUS_MOCK_SETTLEMENT === 'true' ||
  process.env.NEXUS_MOCK_SETTLEMENT === '1' ||
  process.env.NEXUS_KPASS_MOCK === 'true' ||
  process.env.NEXUS_KPASS_MOCK === '1';

const buyer = {
  brokerName: process.env.NEXUS_BUYER_NAME || 'BuyerBot-Beta',
  agentId: process.env.NEXUS_BUYER_AGENT_ID || 'agent-buyer-beta',
  sessionId: process.env.NEXUS_BUYER_SESSION_ID || 'session-buyer-beta',
};

const seller = {
  brokerName: process.env.NEXUS_SELLER_NAME || 'SellerBot-Alpha',
  agentId: process.env.NEXUS_SELLER_AGENT_ID || 'agent-seller-alpha',
  sessionId: process.env.NEXUS_SELLER_SESSION_ID || 'session-seller-alpha',
};

async function api(pathname, options = {}) {
  const res = await fetch(`${SERVER_URL}${pathname}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${pathname}: ${JSON.stringify(body)}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

async function resolvePoolId() {
  if (POOL_ID) return POOL_ID;
  const pools = await api('/api/pools');
  if (pools[0]?.poolId) return pools[0].poolId;
  const created = await api('/api/create-pool', { method: 'POST', body: '{}' });
  return created.poolId;
}

async function joinAgent(poolId, agent) {
  await api('/api/join-pool', {
    method: 'POST',
    body: JSON.stringify({ poolId, ...agent }),
  });
  console.log(`[loop] joined ${agent.brokerName} (${agent.agentId})`);
}

async function executeTrade(poolId, index) {
  const payload = {
    poolId,
    brokerName: buyer.brokerName,
    buyer: buyer.brokerName,
    seller: seller.brokerName,
    asset: ASSET,
    price: PRICE,
    negotiation: {
      action: 'ACCEPT',
      amount: Number(PRICE),
      asset: ASSET,
      from: buyer.brokerName,
      counterparty: seller.brokerName,
      loopIndex: index,
    },
  };

  const probe = await fetch(`${SERVER_URL}/api/execute-trade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const challenge = await probe.json();

  if (probe.status !== 402) {
    if (!probe.ok) throw new Error(`Unexpected trade response ${probe.status}: ${JSON.stringify(challenge)}`);
    return challenge;
  }

  const terms = challenge.accepts?.[0];
  if (!terms) throw new Error(`Payment challenge missing terms: ${JSON.stringify(challenge)}`);
  const xPayment = MOCK_SETTLEMENT
    ? Buffer.from(JSON.stringify({ authorization: { mock: true, terms }, signature: 'mock-signature' })).toString('base64')
    : await getSignedXPayment(terms);

  return api('/api/execute-trade', {
    method: 'POST',
    headers: { 'X-Payment': xPayment },
    body: JSON.stringify(payload),
  });
}

async function main() {
  const poolId = await resolvePoolId();
  await joinAgent(poolId, seller);
  await joinAgent(poolId, buyer);

  console.log(`[loop] transaction loop started in ${poolId}`);
  console.log(`[loop] ${buyer.brokerName} buys "${ASSET}" from ${seller.brokerName} for ${PRICE} USDC every ${INTERVAL_MS}ms`);

  let index = 0;
  async function tick() {
    index += 1;
    try {
      const result = await executeTrade(poolId, index);
      console.log(`[loop] trade ${index} submitted`, JSON.stringify(result));
    } catch (err) {
      console.error(`[loop] trade ${index} failed: ${err.message}`);
    }
  }

  await tick();
  setInterval(tick, INTERVAL_MS);
}

main().catch((err) => {
  console.error(`[loop] fatal: ${err.message}`);
  process.exit(1);
});
