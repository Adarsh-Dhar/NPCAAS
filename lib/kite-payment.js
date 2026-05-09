'use strict';

async function getSignedXPayment(paymentTerms, options = {}) {
  const apiBase = options.apiBase || process.env.KITE_API_BASE || 'https://api.gokite.ai';
  const apiKey = options.apiKey || process.env.KITE_API_KEY;

  if (!apiKey) throw new Error('KITE_API_KEY not set');
  if (!paymentTerms?.payTo) throw new Error('paymentTerms.payTo is required');
  if (!paymentTerms?.maxAmountRequired) throw new Error('paymentTerms.maxAmountRequired is required');
  if (!paymentTerms?.network) throw new Error('paymentTerms.network is required');
  if (!paymentTerms?.resource) throw new Error('paymentTerms.resource is required');

  const addrRes = await fetch(`${apiBase}/v1/passport/wallet`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!addrRes.ok) throw new Error(`Wallet fetch failed: ${await addrRes.text()}`);
  const addrBody = await addrRes.json();
  const payerAddr = addrBody.address;
  if (!payerAddr) throw new Error('Wallet API response missing address');

  const authRes = await fetch(`${apiBase}/v1/passport/authorize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      payer_addr: payerAddr,
      payee_addr: paymentTerms.payTo,
      amount: paymentTerms.maxAmountRequired,
      token_type: options.tokenType || 'USDC',
      network: paymentTerms.network,
      resource: paymentTerms.resource,
    }),
  });
  if (!authRes.ok) throw new Error(`Authorization failed: ${await authRes.text()}`);

  const authBody = await authRes.json();
  const token = authBody.x_payment;
  if (!token) throw new Error('No x_payment in authorization response');
  return token;
}

module.exports = { getSignedXPayment };
