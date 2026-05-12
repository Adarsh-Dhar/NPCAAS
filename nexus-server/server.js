'use strict';

const fs = require('fs');
const path = require('path');

const distEntry = path.join(__dirname, 'dist', 'app.js');
const tsEntry = path.join(__dirname, 'src', 'app.ts');

if (fs.existsSync(distEntry)) {
  module.exports = require(distEntry);
} else {
  try {
    require('ts-node/register');
    module.exports = require(tsEntry);
  } catch (err) {
    console.error('[nexus-server] Failed to start TypeScript app.');
    console.error('[nexus-server] Run "npm run build" or install dev dependencies.');
    console.error(err && err.message ? err.message : err);
    process.exit(1);
  }
}
