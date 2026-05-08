#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 5173;
const rootCandidates = ['dist', 'public', '.'];
let root = null;
for (const c of rootCandidates) {
  const p = path.resolve(process.cwd(), c);
  try {
    if (fs.existsSync(p) && fs.statSync(p).isDirectory() && fs.readdirSync(p).length > 0) {
      root = p;
      break;
    }
  } catch (e) {}
}

const server = http.createServer((req, res) => {
  if (!root) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html><head><meta charset="utf-8"><title>NeoCity placeholder</title></head><body><h1>NeoCity demo removed</h1><p>This is a placeholder dev server. Restore the original demo files into this folder to run the real game.</p></body></html>`);
    return;
  }

  // Serve static files from root
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  let filePath = path.join(root, urlPath);
  if (filePath.endsWith(path.sep)) filePath = path.join(filePath, 'index.html');

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const map = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': map[ext] || 'application/octet-stream' });
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(port, () => {
  console.log(`Dev server listening at http://localhost:${port}/`);
  if (root) console.log(`Serving files from ${root}`);
  else console.log('No dist/public folder found — returning placeholder HTML.');
});
