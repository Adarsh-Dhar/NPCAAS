const request = require('supertest');
const http = require('http');
const appPath = require('path').join(__dirname, '..', 'server.js');

// This test simply ensures the server responds to /api/health
let serverProcess;

beforeAll(() => {
  // require the server file which starts listening; set PORT to a test port
  process.env.PORT = 34567;
  // eslint-disable-next-line global-require
  require('..//server.js');
});

afterAll(() => {
  // nothing to clean up; server runs in same process
});

test('GET /api/health returns ok', async () => {
  const res = await request('http://localhost:34567').get('/api/health');
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('status', 'ok');
});
