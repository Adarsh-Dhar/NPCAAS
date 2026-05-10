// lib/kite-payment.js
'use strict';

const KITE_API_BASE = process.env.KITE_API_BASE || 'https://api.gokite.ai';
const KITE_API_KEY  = process.env.KITE_API_KEY;

async function getSignedXPayment(paymentTerms) {
  if (!KITE_API_KEY) throw new Error('KITE_API_KEY not set');

  const res = await fetch(`${KITE_API_BASE}/v1/payments/authorize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KITE_API_KEY}`,
    },
    body: JSON.stringify({
      network:          paymentTerms.network,
      payTo:            paymentTerms.payTo,
      asset:            paymentTerms.asset,
      maxAmountRequired: paymentTerms.maxAmountRequired,
      resource:         paymentTerms.resource,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kite payment auth failed: ${err}`);
  }

  const { authorization, signature } = await res.json();
  return Buffer.from(JSON.stringify({ authorization, signature })).toString('base64');
}

module.exports = { getSignedXPayment };
