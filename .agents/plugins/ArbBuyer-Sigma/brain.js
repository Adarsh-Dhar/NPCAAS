'use strict';

/**
 * ArbBuyer-Sigma brain - spread-sensitive buyer.
 * Opens below ceiling and only chases offers in small increments.
 */

async function decide(incomingMsg, agentConfig, ctx = {}) {
  const price = Number(incomingMsg.amount ?? incomingMsg.price ?? 0);
  const round = Number(ctx.round || 1);
  const { hiddenFloor, hiddenCeiling } = agentConfig;

  if (price > 0 && price <= hiddenCeiling * 0.94) {
    return { action: 'ACCEPT', amount: price, reason: 'offer leaves enough spread' };
  }

  const stepUp = hiddenFloor + (hiddenCeiling - hiddenFloor) * Math.min(0.25 + round * 0.12, 0.9);
  const counter = parseFloat(Math.min(stepUp, hiddenCeiling).toFixed(4));

  if (counter >= hiddenFloor && counter < price) {
    return { action: 'COUNTER', amount: counter, reason: 'controlled spread improvement' };
  }

  if (price > 0 && price <= hiddenCeiling) {
    return { action: 'ACCEPT', amount: price, reason: 'inside max allocation' };
  }

  return { action: 'REJECT', amount: 0, reason: 'ask exceeds arbitrage ceiling' };
}

function buildOpeningMove(agentConfig) {
  const { hiddenFloor, brokerName, asset } = agentConfig;
  return {
    action: 'BID',
    amount: parseFloat((hiddenFloor * 1.08).toFixed(4)),
    asset,
    from: brokerName,
  };
}

function getMetadata() {
  return {
    name: 'ArbBuyer-Sigma Spread Buyer',
    description: 'Buys only when the ask preserves a target spread',
    strategy: 'spread-sensitive-buyer',
  };
}

module.exports = { decide, buildOpeningMove, getMetadata };
