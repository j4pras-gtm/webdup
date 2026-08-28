'use strict';
/**
 * Minimal static preview server for Sidekikz artifacts (zero deps).
 * Usage: node apps/preview/server.js <artifact-dir> [port]
 *   e.g. node apps/preview/server.js jobs/job-002/artifact 8080
 *
 * Extensionless path resolution: /talent/foo/ -> talent/foo/index.html,
 * /talent/foo -> talent/foo/index.html, / -> index.html.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(process.argv[2] || '.');
const port = parseInt(process.argv[3] || '8080', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const abs = path.normalize(path.join(root, p));
    if (!abs.startsWith(root)) { res.writeHead(403); return res.end('forbidden'); }
    let file = fs.existsSync(abs) && fs.statSync(abs).isFile() ? abs : null;
    if (!file && !path.extname(abs)) {
      const asIndex = path.join(abs, 'index.html');
      if (fs.existsSync(asIndex)) file = asIndex;
    }
    if (!file) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('404 ' + p); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    res.writeHead(500); res.end(String(e));
  }
});

server.listen(port, () => console.log('preview: http://localhost:' + port + '  (root: ' + root + ')'));
