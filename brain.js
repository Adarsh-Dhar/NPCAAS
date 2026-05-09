"use strict";
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const GITHUB_TOKEN           = process.env.GITHUB_TOKEN;
const SERVER_URL             = process.env.NEXUS_SERVER_URL || 'http://localhost:5000';
const GITHUB_MODELS_ENDPOINT = 'https://models.inference.ai.azure.com/chat/completions';
const KITE_API_BASE          = process.env.KITE_API_BASE || 'https://api.gokite.ai';
const KITE_API_KEY           = process.env.KITE_API_KEY;

const BROKER_NAME  = 'QuantBot-Alpha';
const COUNTERPARTY = 'DataOracle_7';
const POOL_ID      = process.env.NEXUS_POOL_ID || 'POOL-8219';

// ─── Hard constraints (tunable via env) ───────────────────────────────────────
const MAX_DAILY_SPEND_USDC  = parseFloat(process.env.BROKER_MAX_DAILY_USDC  || '5.00');
const MAX_PRICE_PER_DATASET = parseFloat(process.env.BROKER_MAX_PRICE_USDC  || '0.75');
const MIN_PRICE_FLOOR       = parseFloat(process.env.BROKER_MIN_PRICE_USDC  || '0.10');
const COOLDOWN_MS           = parseInt(process.env.BROKER_COOLDOWN_MS       || '120000'); // 2 min
const INTERVAL_MS           = parseInt(process.env.BROKER_INTERVAL_MS       || '15000');

// ─── State file — persists budget across restarts ─────────────────────────────
const STATE_FILE = path.resolve(__dirname, '.broker-state.json');

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const state = JSON.parse(raw);
    // Reset daily budget if it's a new UTC day
    const today = new Date().toISOString().slice(0, 10);
    if (state.date !== today) {
      return { date: today, spentToday: 0, lastPurchase: {}, tradeCount: 0 };
    }
    return state;
  } catch {
    return {
      date: new Date().toISOString().slice(0, 10),
      spentToday: 0,
      lastPurchase: {},   // asset → timestamp of last buy
      tradeCount: 0,
    };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ─── Pre-flight constraint checks (before even calling the model) ─────────────
function checkHardConstraints(asset, price, state) {
  const failures = [];

  if (price > MAX_PRICE_PER_DATASET) {
    failures.push(`price $${price} exceeds ceiling $${MAX_PRICE_PER_DATASET}`);
  }

  if (price < MIN_PRICE_FLOOR) {
    failures.push(`price $${price} is suspiciously below floor $${MIN_PRICE_FLOOR} — possible scam`);
  }

  if (state.spentToday + price > MAX_DAILY_SPEND_USDC) {
    failures.push(
      `daily budget exhausted — spent $${state.spentToday.toFixed(2)} of $${MAX_DAILY_SPEND_USDC} today`
    );
  }

  const lastBuy = state.lastPurchase[asset];
  if (lastBuy) {
    const elapsed = Date.now() - lastBuy;
    if (elapsed < COOLDOWN_MS) {
      const waitSec = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
      failures.push(`cooldown active — bought "${asset}" ${Math.floor(elapsed/1000)}s ago, wait ${waitSec}s more`);
    }
  }

  return failures;
}

// ─── Market context — real numbers the model can reason about ─────────────────
async function fetchMarketContext() {
  // Pull live trade history from our own server to give the model real context
  try {
    const res = await fetch(`${SERVER_URL}/api/trades`);
    if (!res.ok) return null;
    const trades = await res.json();

    const recent = trades.slice(0, 20);
    const prices = recent.map(t => parseFloat(t.price)).filter(p => !isNaN(p));
    const avgPrice = prices.length
      ? (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(4)
      : 'unknown';
    const assetCount = recent.filter(t => t.asset === 'Real-Time Sentiment Dataset').length;

    return {
      recentTradeCount: recent.length,
      avgRecentPrice: avgPrice,
      datasetPurchasedLast20Trades: assetCount,
      serverOnline: true,
    };
  } catch {
    return { serverOnline: false };
  }
}

// ─── The actual model call — with real context, not a rigged prompt ───────────
async function askModel(asset, offerPrice, state, marketCtx) {
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN not set');

  const budgetRemaining = (MAX_DAILY_SPEND_USDC - state.spentToday).toFixed(4);
  const lastBuyAgo = state.lastPurchase[asset]
    ? `${Math.floor((Date.now() - state.lastPurchase[asset]) / 1000)}s ago`
    : 'never';

  // The prompt gives the model real numbers and real uncertainty.
  // It does NOT tell the model what to decide.
  const systemPrompt = `You are QuantBot-Alpha, an autonomous data broker with strict risk controls.
Your job is to evaluate whether to purchase a dataset at the offered price.
You must be conservative. Your budget is real money. You can and should say NO.

Hard constraints already checked by the system — do not re-evaluate these.
Your job is to evaluate ECONOMIC VALUE only.

Reply ONLY with valid JSON: {"decision":"BUY"|"PASS","reason":"one sentence"}`;

  const userPrompt = `Dataset offered: "${asset}"
Offered price: $${offerPrice} USDC
Counterparty: ${COUNTERPARTY}

Your current state:
- Daily budget remaining: $${budgetRemaining} USDC (limit: $${MAX_DAILY_SPEND_USDC})
- Trades executed today: ${state.tradeCount}
- Last purchase of this asset: ${lastBuyAgo}

Market context (last 20 trades on this clearinghouse):
- Average price paid: $${marketCtx?.avgRecentPrice || 'unknown'}
- Times this dataset purchased recently: ${marketCtx?.datasetPurchasedLast20Trades ?? 'unknown'}
- Total recent trades: ${marketCtx?.recentTradeCount ?? 'unknown'}

Evaluate: Is $${offerPrice} a good price for real-time sentiment data right now, 
given your remaining budget and recent market activity? 
If this dataset has been purchased many times recently, its marginal value is lower.
If you are near your daily limit, be more conservative.`;

  const response = await fetch(GITHUB_MODELS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GITHUB_TOKEN}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 100,
    }),
  });

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || '{}';

  try {
    const parsed = JSON.parse(raw.replace(/```json|```/gi, '').trim());
    return {
      decision: parsed.decision === 'BUY' ? 'BUY' : 'PASS',
      reason: parsed.reason || 'no reason given',
    };
  } catch {
    // If the model returns garbage, default to PASS — fail safe
    console.warn('[Brain] Model returned non-JSON, defaulting to PASS:', raw);
    return { decision: 'PASS', reason: 'model output unparseable — failing safe' };
  }
}

// ─── x402 settlement (unchanged from previous version) ────────────────────────
async function settleTrade(asset, price) {
  const body = {
    poolId: POOL_ID,
    brokerName: BROKER_NAME,
    buyer: BROKER_NAME,
    seller: COUNTERPARTY,
    asset,
    price: String(price),
  };

  const probe = await fetch(`${SERVER_URL}/api/execute-trade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (probe.status !== 402) {
    const data = await probe.json();
    if (!probe.ok) throw new Error(`Unexpected response ${probe.status}: ${JSON.stringify(data)}`);
    return data;
  }

  const paymentChallenge = await probe.json();
  const paymentTerms = paymentChallenge.accepts?.[0];
  if (!paymentTerms) throw new Error('No payment terms in 402 response');

  if (!KITE_API_KEY) throw new Error('KITE_API_KEY not set');

  const addrRes = await fetch(`${KITE_API_BASE}/v1/passport/wallet`, {
    headers: { Authorization: `Bearer ${KITE_API_KEY}` },
  });
  if (!addrRes.ok) throw new Error(`Wallet fetch failed: ${await addrRes.text()}`);
  const { address: payerAddr } = await addrRes.json();

  const authRes = await fetch(`${KITE_API_BASE}/v1/passport/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KITE_API_KEY}` },
    body: JSON.stringify({
      payer_addr: payerAddr,
      payee_addr: paymentTerms.payTo,
      amount:     paymentTerms.maxAmountRequired,
      token_type: 'USDC',
      network:    paymentTerms.network,
      resource:   paymentTerms.resource,
    }),
  });
  if (!authRes.ok) throw new Error(`Authorization failed: ${await authRes.text()}`);
  const { x_payment: xPayment } = await authRes.json();
  if (!xPayment) throw new Error('No x_payment in authorization response');

  const settleRes = await fetch(`${SERVER_URL}/api/execute-trade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Payment': xPayment },
    body: JSON.stringify(body),
  });
  const result = await settleRes.json();
  if (!settleRes.ok) throw new Error(`Settlement failed: ${JSON.stringify(result)}`);
  return result;
}

// ─── Main loop ────────────────────────────────────────────────────────────────
async function evaluateAndTrade() {
  const asset      = 'Real-Time Sentiment Dataset';
  const offerPrice = 0.50;

  console.log(`\n[${new Date().toISOString()}] ${BROKER_NAME} evaluating offer from ${COUNTERPARTY}`);
  console.log(`  Asset: "${asset}" @ $${offerPrice} USDC`);

  const state = loadState();

  // 1. Hard constraint check — model never even runs if these fail
  const violations = checkHardConstraints(asset, offerPrice, state);
  if (violations.length > 0) {
    console.log(`[Brain] ❌ PASS — hard constraints failed:`);
    violations.forEach(v => console.log(`  • ${v}`));
    return;
  }

  // 2. Fetch real market context
  const marketCtx = await fetchMarketContext();
  console.log(`[Brain] Market context:`, marketCtx);

  // 3. Ask the model with real numbers
  const { decision, reason } = await askModel(asset, offerPrice, state, marketCtx);
  console.log(`[Brain] Model decision: ${decision} — "${reason}"`);

  // 4. Execute or log pass
  if (decision === 'BUY') {
    console.log(`[Broker] Executing settlement via Kite x402...`);
    try {
      const result = await settleTrade(asset, offerPrice);
      console.log(`[Broker] ✅ Settled:`, JSON.stringify(result));

      // Update state only on confirmed settlement
      state.spentToday    += offerPrice;
      state.tradeCount    += 1;
      state.lastPurchase[asset] = Date.now();
      saveState(state);

      console.log(`[Budget] Spent today: $${state.spentToday.toFixed(4)} / $${MAX_DAILY_SPEND_USDC}`);
    } catch (err) {
      console.error(`[Broker] ❌ Settlement failed:`, err.message);
      // Do NOT update state — spend only counts on confirmed settlement
    }
  } else {
    console.log(`[Broker] Passing on this trade.`);
  }
}

console.log(`📈 Starting ${BROKER_NAME}`);
console.log(`   Daily budget: $${MAX_DAILY_SPEND_USDC} USDC`);
console.log(`   Price ceiling: $${MAX_PRICE_PER_DATASET} USDC`);
console.log(`   Cooldown: ${COOLDOWN_MS / 1000}s between same-asset purchases`);
console.log(`   Interval: every ${INTERVAL_MS / 1000}s\n`);

setInterval(evaluateAndTrade, INTERVAL_MS);
evaluateAndTrade();
