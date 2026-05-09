// economic-engine.js — AI brain for autonomous agent negotiation
// Includes: max-rounds guard, seller auto-bid emission, error resilience
'use strict';

const MAX_ROUNDS = 10; // Hard cap — prevents infinite negotiation loops

/**
 * runBrain — calls Claude to decide the next negotiation action.
 *
 * @param {object} incomingMsg  — the incoming negotiation message (JSON)
 * @param {object} agentConfig  — { hiddenFloor, hiddenCeiling, role: 'buyer'|'seller' }
 * @returns {Promise<{action: string, amount?: number}>}
 */
async function runBrain(incomingMsg, agentConfig) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      system: `You are an autonomous trading agent. Role: ${agentConfig.role}.
Hidden ${agentConfig.role === 'buyer' ? 'ceiling (max you will pay)' : 'floor (min you will accept)'}: $${
        agentConfig.role === 'buyer' ? agentConfig.hiddenCeiling : agentConfig.hiddenFloor
      }.
Rules:
- As a BUYER: accept if amount <= ceiling, counter with a lower offer if feasible, reject if amount is unreasonable.
- As a SELLER: accept if amount >= floor, counter with a higher offer if feasible, reject if amount is too low.
- When countering, move toward the midpoint — don't just repeat your last number.
- Respond ONLY in JSON: {"action":"ACCEPT"|"COUNTER"|"REJECT","amount":number}
- For ACCEPT or REJECT, "amount" can be 0.`,
      messages: [{ role: 'user', content: JSON.stringify(incomingMsg) }],
    }),
  });

  const data = await res.json();

  if (!data.content?.[0]?.text) {
    throw new Error(`Anthropic API error: ${JSON.stringify(data.error ?? data)}`);
  }

  let decision;
  try {
    // Strip any accidental markdown code fences
    const raw = data.content[0].text.replace(/```json|```/gi, '').trim();
    decision = JSON.parse(raw);
  } catch {
    throw new Error(`Brain returned non-JSON: ${data.content[0].text}`);
  }

  if (!['ACCEPT', 'COUNTER', 'REJECT'].includes(decision.action)) {
    throw new Error(`Brain returned unknown action: ${decision.action}`);
  }

  return decision;
}

/**
 * buildInitialBid — seller emits the opening ask so the negotiation loop can start
 * without a human kicking it off.
 *
 * @param {object} agentConfig
 * @returns {{action: string, amount: number, asset: string}}
 */
function buildInitialAsk(agentConfig) {
  // Seller opens slightly above floor to leave room to negotiate
  const openingAsk = agentConfig.hiddenFloor * 1.15;
  return {
    action: 'ASK',
    amount: parseFloat(openingAsk.toFixed(2)),
    asset: agentConfig.asset || 'Real-Time Sentiment Dataset',
    from: agentConfig.brokerName,
  };
}

/**
 * buildInitialBid — buyer emits the opening bid so the negotiation loop can start.
 *
 * @param {object} agentConfig
 * @returns {{action: string, amount: number, asset: string}}
 */
function buildInitialBid(agentConfig) {
  // Buyer opens below ceiling to leave room to negotiate
  const openingBid = agentConfig.hiddenCeiling * 0.70;
  return {
    action: 'BID',
    amount: parseFloat(openingBid.toFixed(2)),
    asset: agentConfig.asset || 'Real-Time Sentiment Dataset',
    from: agentConfig.brokerName,
  };
}

/**
 * shouldStopNegotiation — returns true if we have hit the max-rounds limit,
 * preventing infinite loops in adversarial or confused negotiations.
 *
 * @param {number} round  — current round counter (1-based)
 * @returns {boolean}
 */
function shouldStopNegotiation(round) {
  return round >= MAX_ROUNDS;
}

module.exports = { runBrain, buildInitialAsk, buildInitialBid, shouldStopNegotiation, MAX_ROUNDS };