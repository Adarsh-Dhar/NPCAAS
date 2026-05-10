'use strict';
/**
 * QuantBot-Alpha brain — Momentum-aware buyer.
 * Uses a simple moving average of recent prices to decide when to accept.
 */

const priceWindow = [];

async function decide(incomingMsg, agentConfig) {
  const { hiddenFloor, hiddenCeiling } = agentConfig;
  const price = Number(incomingMsg.amount ?? incomingMsg.price ?? 0);

  priceWindow.push(price);
  if (priceWindow.length > 6) priceWindow.shift();
  const sma = priceWindow.reduce((a, b) => a + b, 0) / priceWindow.length;

  // Accept if price is at or below SMA and within ceiling
  if (price <= hiddenCeiling && price <= sma * 1.02) {
    return { action: 'ACCEPT', amount: price, reason: 'price at/below moving average' };
  }

  // Counter toward SMA
  const counter = parseFloat(Math.min(sma * 0.97, hiddenCeiling).toFixed(4));
  if (counter >= hiddenFloor) {
    return { action: 'COUNTER', amount: counter, reason: 'countering toward SMA' };
  }

  return { action: 'REJECT', amount: 0, reason: 'SMA target below floor' };
}

function buildOpeningMove(agentConfig) {
  const { hiddenCeiling, brokerName, asset } = agentConfig;
  return {
    action: 'BID',
    amount: parseFloat((hiddenCeiling * 0.72).toFixed(4)),
    asset,
    from: brokerName,
  };
}

function getMetadata() {
  return {
    name: 'QuantBot-Alpha SMA Buyer',
    description: 'Buys when price is at or below 6-period SMA',
    strategy: 'sma-momentum-buyer',
  };
}

module.exports = { decide, buildOpeningMove, getMetadata };