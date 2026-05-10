#!/usr/bin/env node
/**
 * scaffold-agent.js — creates a new agent plugin directory
 *
 * Usage:
 *   node .agents/scaffold-agent.js --name "MyAgent" --role buyer --floor 0.30 --ceiling 0.60
 *
 * This generates:
 *   .agents/plugins/MyAgent/brain.js
 *   .agents/plugins/MyAgent/config.json
 * And registers it in .agents/registry.json
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─── Parse args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function flag(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const agentName  = flag('name',     null);
const role       = flag('role',     'buyer');
const floor      = parseFloat(flag('floor',    '0.40'));
const ceiling    = parseFloat(flag('ceiling',  '0.70'));
const asset      = flag('asset',    'Real-Time Sentiment Dataset');
const strategy   = flag('strategy', 'linear-counter');  // linear-counter | momentum | aggressive | passive
const maxRounds  = parseInt(flag('max-rounds', '10'), 10);
const aiModel    = flag('model',    '');  // e.g. gpt-4o for LLM-powered brains

if (!agentName) {
  console.error('Usage: node scaffold-agent.js --name <AgentName> [--role buyer|seller] [--floor 0.40] [--ceiling 0.70] [--strategy linear-counter|momentum|aggressive|passive] [--model gpt-4o]');
  process.exit(1);
}

const ROOT        = path.resolve(__dirname);
const PLUGINS_DIR = path.join(ROOT, 'plugins');
const REGISTRY    = path.join(ROOT, 'registry.json');
const agentDir    = path.join(PLUGINS_DIR, agentName);

if (fs.existsSync(agentDir)) {
  console.error(`Agent directory already exists: ${agentDir}`);
  process.exit(1);
}

fs.mkdirSync(agentDir, { recursive: true });

// ─── config.json ─────────────────────────────────────────────────────────────
const config = {
  brokerName:   agentName,
  role,
  hiddenFloor:  floor,
  hiddenCeiling: ceiling,
  asset,
  maxRounds,
  ...(aiModel ? { aiModel } : {}),
};

fs.writeFileSync(path.join(agentDir, 'config.json'), JSON.stringify(config, null, 2));

// ─── brain.js (strategy templates) ───────────────────────────────────────────

const brainTemplates = {

  'linear-counter': `'use strict';
/**
 * LinearCounter brain — counters at fixed % steps toward midpoint.
 * Accepts when price is within range, counters by 8%, rejects if hopeless.
 */

async function decide(incomingMsg, agentConfig) {
  const { hiddenFloor, hiddenCeiling, role } = agentConfig;
  const price = Number(incomingMsg.amount ?? incomingMsg.price ?? 0);

  if (role === 'buyer') {
    if (price <= hiddenCeiling) return { action: 'ACCEPT', amount: price };
    const counter = parseFloat((price * 0.92).toFixed(4));
    if (counter >= hiddenFloor)  return { action: 'COUNTER', amount: counter };
    return { action: 'REJECT', amount: 0, reason: 'price too high' };
  }

  // seller
  if (price >= hiddenFloor)    return { action: 'ACCEPT', amount: price };
  const counter = parseFloat((price * 1.08).toFixed(4));
  if (counter <= hiddenCeiling) return { action: 'COUNTER', amount: counter };
  return { action: 'REJECT', amount: 0, reason: 'price too low' };
}

function buildOpeningMove(agentConfig) {
  const { role, hiddenFloor, hiddenCeiling, brokerName, asset } = agentConfig;
  const amount = role === 'seller'
    ? parseFloat((hiddenFloor * 1.15).toFixed(4))
    : parseFloat((hiddenCeiling * 0.70).toFixed(4));
  return { action: role === 'seller' ? 'ASK' : 'BID', amount, asset, from: brokerName };
}

function getMetadata() {
  return {
    name: 'LinearCounter',
    description: 'Counters at fixed % steps toward midpoint',
    strategy: 'linear-counter',
  };
}

module.exports = { decide, buildOpeningMove, getMetadata };
`,

  'momentum': `'use strict';
/**
 * Momentum brain — tracks recent price movement and bets the trend continues.
 * State is per-invocation (no persistence between server restarts).
 */

const priceHistory = [];

async function decide(incomingMsg, agentConfig) {
  const { hiddenFloor, hiddenCeiling, role } = agentConfig;
  const price = Number(incomingMsg.amount ?? incomingMsg.price ?? 0);

  priceHistory.push(price);
  if (priceHistory.length > 5) priceHistory.shift();

  const avg = priceHistory.reduce((a, b) => a + b, 0) / priceHistory.length;
  const trend = priceHistory.length > 1
    ? priceHistory[priceHistory.length - 1] - priceHistory[0]
    : 0;

  if (role === 'buyer') {
    // If prices are falling (negative trend), wait or bid lower
    const target = trend < 0 ? Math.max(hiddenFloor, price * 0.94) : price * 0.98;
    if (price <= hiddenCeiling) return { action: 'ACCEPT', amount: price };
    if (target >= hiddenFloor)   return { action: 'COUNTER', amount: parseFloat(target.toFixed(4)) };
    return { action: 'REJECT', amount: 0, reason: 'out of range' };
  }

  // seller: if prices rising, hold out for more
  const target = trend > 0 ? Math.min(hiddenCeiling, price * 1.06) : price * 1.03;
  if (price >= hiddenFloor)     return { action: 'ACCEPT', amount: price };
  if (target <= hiddenCeiling)  return { action: 'COUNTER', amount: parseFloat(target.toFixed(4)) };
  return { action: 'REJECT', amount: 0, reason: 'out of range' };
}

function buildOpeningMove(agentConfig) {
  const { role, hiddenFloor, hiddenCeiling, brokerName, asset } = agentConfig;
  const amount = role === 'seller'
    ? parseFloat((hiddenFloor * 1.20).toFixed(4))
    : parseFloat((hiddenCeiling * 0.65).toFixed(4));
  return { action: role === 'seller' ? 'ASK' : 'BID', amount, asset, from: brokerName };
}

function getMetadata() {
  return { name: 'MomentumBrain', description: 'Trends price history to predict next move', strategy: 'momentum' };
}

module.exports = { decide, buildOpeningMove, getMetadata };
`,

  'aggressive': `'use strict';
/**
 * Aggressive brain — opens close to ceiling/floor, accepts quickly.
 * Designed for high-volume fast settlement.
 */

async function decide(incomingMsg, agentConfig) {
  const { hiddenFloor, hiddenCeiling, role } = agentConfig;
  const price = Number(incomingMsg.amount ?? incomingMsg.price ?? 0);

  if (role === 'buyer') {
    // Accept anything within 5% above ceiling, otherwise reject fast
    if (price <= hiddenCeiling * 1.05) return { action: 'ACCEPT', amount: price };
    return { action: 'REJECT', amount: 0, reason: 'aggressive-reject' };
  }

  // seller: accept anything within 5% below floor
  if (price >= hiddenFloor * 0.95) return { action: 'ACCEPT', amount: price };
  return { action: 'REJECT', amount: 0, reason: 'aggressive-reject' };
}

function buildOpeningMove(agentConfig) {
  const { role, hiddenFloor, hiddenCeiling, brokerName, asset } = agentConfig;
  // Opens very close to limit (aggressive)
  const amount = role === 'seller'
    ? parseFloat((hiddenFloor * 1.05).toFixed(4))
    : parseFloat((hiddenCeiling * 0.95).toFixed(4));
  return { action: role === 'seller' ? 'ASK' : 'BID', amount, asset, from: brokerName };
}

function getMetadata() {
  return { name: 'AggressiveBrain', description: 'Opens near limit, accepts fast', strategy: 'aggressive' };
}

module.exports = { decide, buildOpeningMove, getMetadata };
`,

  'passive': `'use strict';
/**
 * Passive brain — wide margins, slow counters, very conservative.
 * Good for agents that want to avoid bad trades.
 */

let roundCount = 0;

async function decide(incomingMsg, agentConfig) {
  const { hiddenFloor, hiddenCeiling, role } = agentConfig;
  const price = Number(incomingMsg.amount ?? incomingMsg.price ?? 0);
  roundCount++;

  // Only accept after a few rounds of negotiation
  const minRounds = 3;

  if (role === 'buyer') {
    if (price <= hiddenCeiling && roundCount >= minRounds) { roundCount = 0; return { action: 'ACCEPT', amount: price }; }
    const counter = parseFloat((price * 0.88).toFixed(4));
    if (counter >= hiddenFloor) return { action: 'COUNTER', amount: counter };
    return { action: 'REJECT', amount: 0, reason: 'passive-reject' };
  }

  if (price >= hiddenFloor && roundCount >= minRounds) { roundCount = 0; return { action: 'ACCEPT', amount: price }; }
  const counter = parseFloat((price * 1.12).toFixed(4));
  if (counter <= hiddenCeiling) return { action: 'COUNTER', amount: counter };
  return { action: 'REJECT', amount: 0, reason: 'passive-reject' };
}

function buildOpeningMove(agentConfig) {
  const { role, hiddenFloor, hiddenCeiling, brokerName, asset } = agentConfig;
  const amount = role === 'seller'
    ? parseFloat((hiddenCeiling * 0.98).toFixed(4))  // near ceiling (high ask)
    : parseFloat((hiddenFloor * 1.02).toFixed(4));   // near floor (low bid)
  return { action: role === 'seller' ? 'ASK' : 'BID', amount, asset, from: brokerName };
}

function getMetadata() {
  return { name: 'PassiveBrain', description: 'Conservative, waits for good deals', strategy: 'passive' };
}

module.exports = { decide, buildOpeningMove, getMetadata };
`,
};

// LLM-powered brain (when --model is set)
const llmBrain = (modelName) => `'use strict';
/**
 * AI-powered brain for ${agentName} — uses ${modelName} via the Anthropic API.
 * Falls back to linear-counter if API call fails.
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

async function decide(incomingMsg, agentConfig) {
  const { hiddenFloor, hiddenCeiling, role, brokerName } = agentConfig;
  const price = Number(incomingMsg.amount ?? incomingMsg.price ?? 0);

  if (!ANTHROPIC_API_KEY) {
    // fallback: linear counter
    if (role === 'buyer') {
      if (price <= hiddenCeiling) return { action: 'ACCEPT', amount: price };
      const counter = parseFloat((price * 0.92).toFixed(4));
      if (counter >= hiddenFloor) return { action: 'COUNTER', amount: counter };
      return { action: 'REJECT', amount: 0 };
    }
    if (price >= hiddenFloor) return { action: 'ACCEPT', amount: price };
    const counter = parseFloat((price * 1.08).toFixed(4));
    if (counter <= hiddenCeiling) return { action: 'COUNTER', amount: counter };
    return { action: 'REJECT', amount: 0 };
  }

  const systemPrompt = \`You are ${brokerName}, an autonomous trading agent. Role: \${role}.
Hidden \${role === 'buyer' ? 'ceiling (max you will pay)' : 'floor (min you will accept)'}: $\${
    role === 'buyer' ? hiddenCeiling : hiddenFloor
}.
Reply ONLY with JSON: {"action":"ACCEPT"|"COUNTER"|"REJECT","amount":number}.\`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: '${modelName}' || 'claude-haiku-4-5-20251001',
        system: systemPrompt,
        messages: [{ role: 'user', content: JSON.stringify(incomingMsg) }],
        max_tokens: 80,
        temperature: 0.5,
      }),
    });

    const data = await res.json();
    const text = data.content?.find((b) => b.type === 'text')?.text || '{}';
    const parsed = JSON.parse(text.replace(/\`\`\`json|\`\`\`/gi, '').trim());

    if (!['ACCEPT', 'COUNTER', 'REJECT'].includes(parsed.action)) throw new Error('bad action');
    return { action: parsed.action, amount: Number(parsed.amount) || 0 };
  } catch (e) {
    console.warn('[${agentName}] AI decide() failed, using fallback:', e.message);
    return { action: 'COUNTER', amount: parseFloat(((hiddenFloor + hiddenCeiling) / 2).toFixed(4)) };
  }
}

function buildOpeningMove(agentConfig) {
  const { role, hiddenFloor, hiddenCeiling, brokerName, asset } = agentConfig;
  const amount = role === 'seller'
    ? parseFloat((hiddenFloor * 1.15).toFixed(4))
    : parseFloat((hiddenCeiling * 0.70).toFixed(4));
  return { action: role === 'seller' ? 'ASK' : 'BID', amount, asset, from: brokerName };
}

function getMetadata() {
  return { name: 'AIBrain (${modelName})', description: 'LLM-powered negotiation', strategy: 'ai-${modelName}' };
}

module.exports = { decide, buildOpeningMove, getMetadata };
`;

const brainContent = aiModel
  ? llmBrain(aiModel)
  : (brainTemplates[strategy] || brainTemplates['linear-counter']);

fs.writeFileSync(path.join(agentDir, 'brain.js'), brainContent);

// ─── Update registry.json ─────────────────────────────────────────────────────
let registry = { agents: {} };
if (fs.existsSync(REGISTRY)) {
  try { registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8')); } catch {}
}
registry.agents = registry.agents || {};
registry.agents[agentName] = {
  pluginDir: `./plugins/${agentName}`,
  enabled: true,
};
fs.writeFileSync(REGISTRY, JSON.stringify(registry, null, 2));

// ─── Done ─────────────────────────────────────────────────────────────────────
console.log(`
✅ Agent "${agentName}" scaffolded!

  .agents/plugins/${agentName}/
    ├── brain.js      ← ${aiModel ? `AI brain (${aiModel})` : `${strategy} strategy`}
    └── config.json   ← role: ${role}, floor: ${floor}, ceiling: ${ceiling}

  Registered in .agents/registry.json

To deploy this agent:
  node .nexus-client/script.js deploy-broker \\
    --pool-id POOL-XXXX \\
    --broker-name "${agentName}"

To customize the strategy, edit:
  .agents/plugins/${agentName}/brain.js
`);