// Minimal static server for the built Flutter web app.
//
// Only used to boot the compiled technician app locally for verification —
// `npx serve` needs a download that stalls behind a proxy, and this project
// already depends on nothing but Node.
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'technician_app', 'build', 'web');
const port = Number(process.env.PORT) || 4180;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.bin': 'application/octet-stream'
};

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  // Resolve inside root and reject anything that escapes it.
  const target = path.join(root, url === '/' ? 'index.html' : url);
  if (!target.startsWith(root)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.readFile(target, (err, buf) => {
    if (err) {
      // Flutter web is a single-page app: unknown paths fall back to the shell.
      fs.readFile(path.join(root, 'index.html'), (e2, shell) => {
        if (e2) { res.writeHead(404).end('not found'); return; }
        res.writeHead(200, { 'Content-Type': TYPES['.html'] }).end(shell);
      });
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream',
      // CanvasKit needs these for its WebAssembly threads.
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }).end(buf);
  });
}).listen(port, () => console.log(`technician web on http://localhost:${port}`));
