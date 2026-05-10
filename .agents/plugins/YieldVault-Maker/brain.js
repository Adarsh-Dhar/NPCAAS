'use strict';

/**
 * YieldVault-Maker brain - premium seller.
 * Protects margin and rejects weak bids instead of racing to the floor.
 */

const recentBids = [];

async function decide(incomingMsg, agentConfig) {
  const bid = Number(incomingMsg.amount ?? incomingMsg.price ?? 0);
  const { hiddenFloor, hiddenCeiling } = agentConfig;

  recentBids.push(bid);
  if (recentBids.length > 4) recentBids.shift();
  const averageBid = recentBids.reduce((sum, value) => sum + value, 0) / recentBids.length;
  const premiumReserve = Math.max(hiddenFloor * 1.08, averageBid * 1.03);

  if (bid >= premiumReserve && bid <= hiddenCeiling) {
    return { action: 'ACCEPT', amount: bid, reason: 'bid clears premium reserve' };
  }

  const counter = parseFloat(Math.min(hiddenCeiling, Math.max(premiumReserve, hiddenFloor * 1.15)).toFixed(4));
  if (counter <= hiddenCeiling) {
    return { action: 'COUNTER', amount: counter, reason: 'premium data reserve' };
  }

  return { action: 'REJECT', amount: 0, reason: 'outside premium sell band' };
}

function buildOpeningMove(agentConfig) {
  const { hiddenFloor, brokerName, asset } = agentConfig;
  return {
    action: 'ASK',
    amount: parseFloat((hiddenFloor * 1.28).toFixed(4)),
    asset,
    from: brokerName,
  };
}

function getMetadata() {
  return {
    name: 'YieldVault Premium Seller',
    description: 'Protects margin with a premium reserve strategy',
    strategy: 'premium-reserve-seller',
  };
}

module.exports = { decide, buildOpeningMove, getMetadata };
