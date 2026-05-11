const { execSync } = require('child_process');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
require('dotenv').config({ path: path.resolve(__dirname, '.env'), override: true });

const fs = require('fs');

const GITHUB_TOKEN           = process.env.GITHUB_TOKEN;
const SERVER_URL             = (process.env.NEXUS_PUBLIC_URL || process.env.NEXUS_SERVER_URL || 'http://localhost:5000').replace(/\/+$/, '');
const GITHUB_MODELS_ENDPOINT = 'https://models.inference.ai.azure.com/chat/completions';
const KITE_API_BASE          = process.env.KITE_API_BASE || 'https://api.gokite.ai';

const AGENT_ID = 'agent_019e08c4-8472-7de3-a60e-50675e79a3bc';
const BROKER_NAME = 'QuantBot-Alpha';
const COUNTERPARTY = 'DataOracle_7';
const POOL_ID = process.env.NEXUS_POOL_ID || 'POOL-8219';

// Use shared state at repo root so both brokers see the same ledger
const STATE_FILE = path.resolve(__dirname, '..', '.broker-state.json');

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const state = JSON.parse(raw);
    const today = new Date().toISOString().slice(0, 10);
    if (state.date !== today) {
      return { date: today, spentToday: 0, lastPurchase: {}, tradeCount: 0 };
    }
    return state;
  } catch {
    return { date: new Date().toISOString().slice(0, 10), spentToday: 0, lastPurchase: {}, tradeCount: 0 };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// Keep the same constraint-driven decision logic as the root broker
const MAX_DAILY_SPEND_USDC  = parseFloat(process.env.BROKER_MAX_DAILY_USDC  || '5.00');
const MAX_PRICE_PER_DATASET = parseFloat(process.env.BROKER_MAX_PRICE_USDC  || '0.75');
const MIN_PRICE_FLOOR       = parseFloat(process.env.BROKER_MIN_PRICE_USDC  || '0.10');
const COOLDOWN_MS           = parseInt(process.env.BROKER_COOLDOWN_MS       || '120000');
const INTERVAL_MS           = parseInt(process.env.BROKER_INTERVAL_MS       || '15000');

async function settleTrade(asset, price) {
  const body = {
    poolId: POOL_ID,
    brokerName: BROKER_NAME,
    buyer: BROKER_NAME,
    seller: COUNTERPARTY,
    asset,
    price: String(price),
  };

  // Try kpass-based execution if available, otherwise fall back to direct fetch
  const cmd = [
    'kpass agent:session execute',
    `--url ${SERVER_URL}/api/execute-trade`,
    '--method POST',
    `--headers '${JSON.stringify({ 'Content-Type': 'application/json' })}'`,
    `--body '${JSON.stringify(body)}'`,
    '--output json',
    '--no-interactive',
  ].join(' ');

  try {
    const resultRaw = execSync(cmd, { shell: '/bin/bash', stdio: ['ignore', 'pipe', 'pipe'] }).toString();
    return JSON.parse(resultRaw || '{}');
  } catch (_) {
    const localServerUrl = SERVER_URL;
    const res = await fetch(`${localServerUrl}/api/execute-trade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Dark pool settlement failed: ${JSON.stringify(data)}`);
    return data;
  }
}

function checkHardConstraints(asset, price, state) {
  const failures = [];
  if (price > MAX_PRICE_PER_DATASET) failures.push(`price $${price} exceeds ceiling $${MAX_PRICE_PER_DATASET}`);
  if (price < MIN_PRICE_FLOOR) failures.push(`price $${price} below floor $${MIN_PRICE_FLOOR}`);
  if (state.spentToday + price > MAX_DAILY_SPEND_USDC) failures.push('daily budget exhausted');
  const lastBuy = state.lastPurchase[asset];
  if (lastBuy && (Date.now() - lastBuy) < COOLDOWN_MS) failures.push('cooldown active');
  return failures;
}

async function fetchMarketContext() {
  try {
    const res = await fetch(`${SERVER_URL}/api/trades`);
    if (!res.ok) return null;
    const trades = await res.json();
    const recent = trades.slice(0, 20);
    const prices = recent.map(t => parseFloat(t.price)).filter(p => !isNaN(p));
    const avgPrice = prices.length ? (prices.reduce((a,b)=>a+b,0)/prices.length).toFixed(4) : 'unknown';
    const assetCount = recent.filter(t => t.asset === 'Real-Time Sentiment Dataset').length;
    return { recentTradeCount: recent.length, avgRecentPrice: avgPrice, datasetPurchasedLast20Trades: assetCount };
  } catch { return null; }
}

async function askModel(asset, offerPrice, state, marketCtx) {
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN not set');
  const budgetRemaining = (MAX_DAILY_SPEND_USDC - state.spentToday).toFixed(4);
  const lastBuyAgo = state.lastPurchase[asset] ? `${Math.floor((Date.now()-state.lastPurchase[asset])/1000)}s ago` : 'never';

  const systemPrompt = `You are ${BROKER_NAME}, an autonomous data broker. Evaluate economic value only. Reply with JSON: {"decision":"BUY"|"PASS","reason":"one sentence"}`;
  const userPrompt = `Dataset: "${asset}"\nPrice: $${offerPrice} USDC\nDaily remaining: $${budgetRemaining}\nTrades today: ${state.tradeCount}\nLast buy: ${lastBuyAgo}\nAvg recent price: $${marketCtx?.avgRecentPrice || 'unknown'}\nRecent purchases: ${marketCtx?.datasetPurchasedLast20Trades ?? 'unknown'}`;

  const response = await fetch(GITHUB_MODELS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GITHUB_TOKEN}` },
    body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], temperature: 0.4, max_tokens: 100 }),
  });
  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || '{}';
  try { const parsed = JSON.parse(raw.replace(/```json|```/gi, '').trim()); return { decision: parsed.decision === 'BUY' ? 'BUY' : 'PASS', reason: parsed.reason || 'no reason' }; } catch { return { decision: 'PASS', reason: 'unparseable model output' }; }
}

async function evaluateAndTrade() {
  const asset = process.env.NEXUS_ASSET || 'Real-Time Sentiment Dataset';
  const offerPrice = 0.50;
  console.log(`\n[Broker] ${BROKER_NAME} evaluating ${asset} @ $${offerPrice}`);
  const state = loadState();
  const violations = checkHardConstraints(asset, offerPrice, state);
  if (violations.length) { console.log('[Broker] PASS —', violations.join('; ')); return; }
  const marketCtx = await fetchMarketContext(); console.log('[Broker] marketCtx', marketCtx);
  const { decision, reason } = await askModel(asset, offerPrice, state, marketCtx);
  console.log('[Broker] Model decision', decision, reason);
  if (decision === 'BUY') {
    try {
      const result = await settleTrade(asset, offerPrice);
      console.log('[Broker] Settled', result);
      state.spentToday += offerPrice; state.tradeCount += 1; state.lastPurchase[asset] = Date.now(); saveState(state);
    } catch (err) { console.error('[Broker] settlement failed', err.message); }
  } else {
    console.log('[Broker] Passing on trade');
  }
}

console.log(`📈 Starting Autonomous Trading Broker (${AGENT_ID})...`);
setInterval(evaluateAndTrade, INTERVAL_MS);
evaluateAndTrade();
