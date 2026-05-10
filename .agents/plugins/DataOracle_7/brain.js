'use strict';
/**
 * DataOracle_7 brain — conservative seller.
 * Holds inventory unless the incoming price is comfortably inside the ask band.
 */

const offerWindow = [];

async function decide(incomingMsg, agentConfig) {
  const { hiddenFloor, hiddenCeiling } = agentConfig;
  const price = Number(incomingMsg.amount ?? incomingMsg.price ?? 0);

  offerWindow.push(price);
  if (offerWindow.length > 5) offerWindow.shift();

  const averageOffer = offerWindow.reduce((sum, value) => sum + value, 0) / offerWindow.length;

  if (price >= hiddenFloor && price >= averageOffer * 0.98) {
    return { action: 'ACCEPT', amount: price, reason: 'offer clears floor and recent average' };
  }

  const target = parseFloat(Math.max(hiddenFloor, averageOffer * 1.04).toFixed(4));
  if (target <= hiddenCeiling) {
    return { action: 'COUNTER', amount: target, reason: 'countering toward recent average' };
  }

  return { action: 'REJECT', amount: 0, reason: 'offer below acceptable range' };
}

function buildOpeningMove(agentConfig) {
  const { hiddenFloor, brokerName, asset } = agentConfig;
  return {
    action: 'ASK',
    amount: parseFloat((hiddenFloor * 1.12).toFixed(4)),
    asset,
    from: brokerName,
  };
}

function getMetadata() {
  return {
    name: 'DataOracle_7 Conservative Seller',
    description: 'Sells only when the market price is strong enough',
    strategy: 'seller-momentum-guard',
  };
}

module.exports = { decide, buildOpeningMove, getMetadata };