const request = require('supertest');

process.env.PORT = '34567';
process.env.DELIVERY_TOKEN_TTL_MS = '50';
process.env.DELIVERY_TOKEN_CLEANUP_MS = '20';
process.env.NEXUS_CONFIRM_MAX_ATTEMPTS = '1';
process.env.NEXUS_CONFIRM_DELAY_MS = '1';
process.env.NEXUS_RETRY_POLL_MS = '25';

const originalFetch = global.fetch;

let settleCalls = 0;
let confirmCalls = 0;

global.fetch = jest.fn(async (url) => {
  const text = String(url);

  if (text.includes('/v2/settle')) {
    settleCalls += 1;
    return {
      ok: true,
      json: async () => ({ txHash: `0xtesthash${settleCalls}` }),
    };
  }

  if (text.includes('action=gettxreceiptstatus')) {
    confirmCalls += 1;
    const confirmed = confirmCalls >= 2;
    return {
      ok: true,
      json: async () => ({ result: { status: confirmed ? '1' : '0' } }),
    };
  }

  throw new Error(`Unexpected fetch URL: ${text}`);
});

// eslint-disable-next-line global-require
require('../server.js');

async function waitFor(condition, timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    const done = await condition();
    if (done) return true;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
}

afterAll(() => {
  global.fetch = originalFetch;
});

test('GET /api/health returns ok', async () => {
  const res = await request('http://localhost:34567').get('/api/health');
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('status', 'ok');
});

test('POST /api/execute-trade without X-Payment returns 402 with payment terms', async () => {
  const poolRes = await request('http://localhost:34567').post('/api/create-pool').send({});
  const poolId = poolRes.body.poolId;

  const res = await request('http://localhost:34567').post('/api/execute-trade').send({
    poolId,
    brokerName: 'BuyerAlpha',
    buyer: 'BuyerAlpha',
    seller: 'SellerOmega',
    asset: 'Dataset',
    price: '12.5',
  });

  expect(res.status).toBe(402);
  expect(res.body).toHaveProperty('accepts');
  expect(Array.isArray(res.body.accepts)).toBe(true);
  expect(res.body.accepts[0]).toHaveProperty('payTo');
  expect(res.body.accepts[0]).toHaveProperty('maxAmountRequired');
});

test('POST /api/execute-trade with mock X-Payment settles trade and eventually issues delivery token', async () => {
  const poolRes = await request('http://localhost:34567').post('/api/create-pool').send({});
  const poolId = poolRes.body.poolId;

  const header = Buffer.from(JSON.stringify({ authorization: { test: true }, signature: '0xabc' })).toString('base64');

  const settleRes = await request('http://localhost:34567')
    .post('/api/execute-trade')
    .set('X-Payment', header)
    .send({
      poolId,
      brokerName: 'BuyerBeta',
      buyer: 'BuyerBeta',
      seller: 'SellerBeta',
      asset: 'Sentiment Feed',
      price: '3.2',
    });

  expect([200, 202]).toContain(settleRes.status);
  expect(settleRes.body).toHaveProperty('tradeId');

  const tradeId = settleRes.body.tradeId;

  const confirmed = await waitFor(async () => {
    const tradeRes = await request('http://localhost:34567').get(`/api/trades/${tradeId}`);
    return tradeRes.status === 200 && tradeRes.body?.status === 'SETTLED' && tradeRes.body?.delivery?.token;
  }, 3000);

  expect(confirmed).toBe(true);

  const tradeRes = await request('http://localhost:34567').get(`/api/trades/${tradeId}`);
  expect(tradeRes.status).toBe(200);
  expect(tradeRes.body.status).toBe('SETTLED');
  expect(tradeRes.body.delivery).toHaveProperty('token');

  const token = tradeRes.body.delivery.token;
  const deliveryRes = await request('http://localhost:34567').get(`/api/delivery/${tradeId}`).query({ token });
  expect([200, 500]).toContain(deliveryRes.status);

  const expired = await waitFor(async () => {
    const expiryRes = await request('http://localhost:34567').get(`/api/delivery/${tradeId}`).query({ token });
    return expiryRes.status === 410 || expiryRes.status === 404;
  }, 2500);

  expect(expired).toBe(true);
});
