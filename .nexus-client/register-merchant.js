#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const KITE_FACILITATOR_URL = process.env.KITE_FACILITATOR_URL || 'https://facilitator.pieverse.io';
const MERCHANT_URL         = process.env.NEXUS_PUBLIC_URL || 'https://kite-dzio.onrender.com';
const KITE_PAYEE_ADDRESS   = process.env.KITE_PAYEE_ADDRESS;
const KITE_ASSET_ADDRESS   = process.env.KITE_ASSET_ADDRESS;
const KITE_NETWORK         = process.env.KITE_NETWORK || 'kite-testnet';
const KITE_API_KEY         = process.env.KITE_API_KEY; // if required

async function register() {
  const body = {
    merchantUrl: MERCHANT_URL,
    merchantName: 'Nexus OTC Clearinghouse',
    payTo: KITE_PAYEE_ADDRESS,
    asset: KITE_ASSET_ADDRESS,
    network: KITE_NETWORK,
    endpoints: [{ path: '/api/execute-trade', method: 'POST', scheme: 'gokite-aa' }],
    discoveryUrl: `${MERCHANT_URL}/.well-known/kite-payment.json`,
  };

  const headers = { 'Content-Type': 'application/json' };
  if (KITE_API_KEY) headers['x-api-key'] = KITE_API_KEY;

  // Try the catalog/merchant registration endpoint
  for (const endpoint of ['/v2/merchant/register', '/v1/catalog/register', '/merchant/register']) {
    try {
      const res = await fetch(`${KITE_FACILITATOR_URL}${endpoint}`, {
        method: 'POST', headers, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        console.log(`✅ Registered via ${endpoint}:`, JSON.stringify(data, null, 2));
        return;
      }
      console.log(`❌ ${endpoint} → ${res.status}:`, data);
    } catch (e) {
      console.log(`⚠️  ${endpoint} failed:`, e && e.message ? e.message : e);
    }
  }

  console.log('\nRegistration endpoints did not succeed. Next steps:');
  console.log('1. Check https://docs.gokite.ai for the correct merchant registration endpoint');
  console.log('2. Or use `kpass merchant:register` if the CLI supports it');
  console.log('3. Or email Kite support to manually allowlist:', MERCHANT_URL);
}

register();
