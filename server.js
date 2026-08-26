const http = require('http');
const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const port = Number(process.env.PORT || 4173);
const dataDir = path.join(rootDir, 'data');
const stateJsonPath = path.join(dataDir, 'state.json');
const stateJsPath = path.join(rootDir, 'state.js');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function send(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    ...headers
  });
  res.end(body);
}

function resolveFile(urlPath) {
  const cleanPath = urlPath === '/' ? '/index.html' : decodeURIComponent(urlPath.split('?')[0]);
  const filePath = path.join(rootDir, cleanPath);
  if (!filePath.startsWith(rootDir)) return null;
  return filePath;
}

function ensureDataDir() {
  fs.mkdirSync(dataDir, { recursive: true });
}

function writePersistedState(body) {
  ensureDataDir();
  fs.writeFileSync(stateJsonPath, body, 'utf8');
  fs.writeFileSync(stateJsPath, `window.__REPELLENT_STATE__ = ${body};\n`, 'utf8');
}

function readPersistedStateScript() {
  try {
    return fs.readFileSync(stateJsPath, 'utf8');
  } catch {
    return 'window.__REPELLENT_STATE__ = null;\n';
  }
}

http.createServer((req, res) => {
  const requestPath = (req.url || '/').split('?')[0];

  if (req.method === 'GET' && requestPath === '/state.js') {
    send(res, 200, readPersistedStateScript(), { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
    return;
  }

  if (requestPath === '/api/state') {
    if (req.method === 'GET') {
      fs.readFile(stateJsonPath, 'utf8', (err, data) => {
        if (err) {
          send(res, 200, JSON.stringify(null), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
          return;
        }
        send(res, 200, data, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
      });
      return;
    }

    if (req.method === 'PUT') {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          JSON.parse(body);
          writePersistedState(body);
          send(res, 204, '');
        } catch {
          send(res, 400, 'Invalid JSON');
        }
      });
      return;
    }

    send(res, 405, 'Method Not Allowed');
    return;
  }

  const filePath = resolveFile(req.url || '/');
  if (!filePath) {
    send(res, 400, 'Bad Request');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if ((req.url || '/').startsWith('/assets') || path.extname(filePath) === '') {
        fs.readFile(path.join(rootDir, 'index.html'), (indexErr, indexData) => {
          if (indexErr) {
            send(res, 500, 'Server error');
            return;
          }
          send(res, 200, indexData, { 'Content-Type': 'text/html; charset=utf-8' });
        });
        return;
      }
      send(res, 404, 'Not Found');
      return;
    }

    const contentType = mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    // Source files must never be cached: a stale module is indistinguishable
    // from a broken one during development. Only true static assets get a
    // long-lived cache.
    const ext = path.extname(filePath).toLowerCase();
    const isSource = ['.html', '.js', '.css', '.json', '.webmanifest'].includes(ext);
    const cacheControl = isSource ? 'no-cache' : 'public, max-age=31536000, immutable';
    send(res, 200, data, { 'Content-Type': contentType, 'Cache-Control': cacheControl });
  });
}).listen(port, () => {
  console.log(`Repellent Operations static server running at http://localhost:${port}`);
});