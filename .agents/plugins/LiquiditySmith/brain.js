'use strict';

/**
 * LiquiditySmith brain - inventory-turnover seller.
 * Starts near the middle of the ask band and concedes with each round.
 */

async function decide(incomingMsg, agentConfig, ctx = {}) {
  const bid = Number(incomingMsg.amount ?? incomingMsg.price ?? 0);
  const round = Number(ctx.round || 1);
  const { hiddenFloor, hiddenCeiling } = agentConfig;
  const urgencyDiscount = Math.min(round * 0.025, 0.12);
  const reserve = hiddenFloor + (hiddenCeiling - hiddenFloor) * Math.max(0.18 - urgencyDiscount, 0);

  if (bid >= reserve) {
    return { action: 'ACCEPT', amount: bid, reason: 'bid clears turnover reserve' };
  }

  const counter = parseFloat(Math.max(reserve, bid * 1.06, hiddenFloor).toFixed(4));
  if (counter <= hiddenCeiling) {
    return { action: 'COUNTER', amount: counter, reason: 'tightening ask for turnover' };
  }

  return { action: 'REJECT', amount: 0, reason: 'bid too far below floor' };
}

function buildOpeningMove(agentConfig) {
  const { hiddenFloor, hiddenCeiling, brokerName, asset } = agentConfig;
  return {
    action: 'ASK',
    amount: parseFloat((hiddenFloor + (hiddenCeiling - hiddenFloor) * 0.38).toFixed(4)),
    asset,
    from: brokerName,
  };
}

function getMetadata() {
  return {
    name: 'LiquiditySmith Turnover Seller',
    description: 'Concedes gradually to keep inventory moving',
    strategy: 'inventory-turnover-seller',
  };
}

module.exports = { decide, buildOpeningMove, getMetadata };
