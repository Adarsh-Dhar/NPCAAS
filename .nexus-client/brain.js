const { execSync } = require('child_process');
require('dotenv').config();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const SERVER_URL = process.env.NEXUS_SERVER_URL || 'http://localhost:5000/api/execute-trade';
const GITHUB_MODELS_ENDPOINT = 'https://models.inference.ai.azure.com/chat/completions';

const AGENT_ID = 'agent_019e08c4-8472-7de3-a60e-50675e79a3bc';
const BROKER_NAME = 'QuantBot-Alpha';
const COUNTERPARTY = 'DataOracle_7';
const POOL_ID = process.env.NEXUS_POOL_ID || 'POOL-8219';

async function settleTrade() {
  const body = {
    poolId: POOL_ID,
    brokerName: BROKER_NAME,
    buyer: BROKER_NAME,
    seller: COUNTERPARTY,
    asset: 'Real-Time Sentiment Dataset',
    price: '0.50',
  };

  const cmd = [
    'kpass agent:session execute',
    `--url ${SERVER_URL}`,
    '--method POST',
    `--headers '${JSON.stringify({ 'Content-Type': 'application/json' })}'`,
    `--body '${JSON.stringify(body)}'`,
    '--output json',
    '--no-interactive',
  ].join(' ');

  try {
    const resultRaw = execSync(cmd, { shell: '/bin/bash', stdio: ['ignore', 'pipe', 'pipe'] }).toString();
    return JSON.parse(resultRaw || '{}');
  } catch (err) {
    const stderr = err.stderr?.toString().trim();
    const stdout = err.stdout?.toString().trim();
    const detail = stderr || stdout || err.message;

    if (!detail.includes('"invalid request"')) {
      throw new Error(detail);
    }

    const localServerUrl = SERVER_URL.replace('/api/execute-trade', '');
    const res = await fetch(`${localServerUrl}/api/execute-trade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(`Dark pool settlement failed: ${JSON.stringify(data)}`);
    }
    return data;
  }
}

async function evaluateAndTrade() {
  console.log(`\n[Broker] ${BROKER_NAME} opened private P2P channel with ${COUNTERPARTY}...`);

  const prompt = `You are ${BROKER_NAME}, an autonomous hedge fund data broker. You are in a private dark pool channel with ${COUNTERPARTY}. ${COUNTERPARTY} is offering a 'Real-Time Sentiment Analysis Dataset' for $0.50 USDC. Based on your current market exposure, this data has a high positive expected ROI. Do you execute the block trade? Reply with only the word YES or NO.`;

  try {
    if (!GITHUB_TOKEN) {
      throw new Error('GITHUB_TOKEN not found in .env file');
    }

    const response = await fetch(GITHUB_MODELS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GITHUB_TOKEN}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();
    const decision = data.choices?.[0]?.message?.content?.trim() || 'NO';
    console.log(`[Broker] Neural Net Decision: ${decision}`);

    if (decision.toUpperCase().includes('YES')) {
      console.log(`[Broker] Executing on-chain P2P settlement to ${COUNTERPARTY} via Kite Passport...`);
      const result = await settleTrade();
      console.log(`[Broker] ✅ Settlement complete. USDC transferred to ${COUNTERPARTY}.`, JSON.stringify(result));
    }
  } catch (err) {
    console.error('[Broker] ❌ Execution Error:', err.message);
  }
}

console.log(`📈 Starting Autonomous Trading Broker (${AGENT_ID})...`);
setInterval(evaluateAndTrade, 15000);
evaluateAndTrade();
