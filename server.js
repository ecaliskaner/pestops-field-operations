const http = require('http');
const fs = require('fs');
const path = require('path');

const rootDir = __dirname;

// Minimal .env loader. The repo keeps runtime dependencies vendored rather than
// installed, so pulling in dotenv for twenty lines would be the odd one out.
// Real environment variables always win, so a hosting platform's own config
// overrides the file rather than being silently shadowed by it.
function loadEnvFile() {
  try {
    const text = fs.readFileSync(path.join(rootDir, '.env'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const value = m[2].trim().replace(/^["'](.*)["']$/, '$1');
      if (process.env[m[1]] === undefined) process.env[m[1]] = value;
    }
  } catch { /* no .env — env vars alone, which is how production runs */ }
}
loadEnvFile();

const port = Number(process.env.PORT || 4173);

// Only these reach the browser. SUPABASE_SERVICE_ROLE_KEY bypasses every RLS
// policy and must never appear in a response body.
const PUBLIC_ENV_KEYS = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];

// Paths the static handler must never serve, however they are spelled. Without
// this, GET /.env hands out the Supabase keys and GET /.git/config hands out
// the remote URL — both are plain files under rootDir, so the existing
// containment check happily allows them.
function isForbiddenPath(relPath) {
  const segments = relPath.split(/[\\/]+/).filter(Boolean);
  return segments.some((seg) => seg.startsWith('.')) ||
    segments[0] === 'node_modules' ||
    segments[0] === 'data' ||
    segments.includes('supabase');
}

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

// Content-Security-Policy.
//
// connect-src is the clause that earns its keep here: even if an XSS slips
// through, the browser refuses to let the injected script POST the customer
// database to an attacker's host, because only this origin and the project's
// own Supabase endpoint are reachable.
//
// All application scripts are external and generated markup uses delegated
// listeners, so inline JavaScript is not permitted by the policy.
function buildCsp() {
  const connect = new Set(["'self'"]);
  const url = process.env.SUPABASE_URL;
  if (url) {
    try {
      const { origin, host } = new URL(url);
      connect.add(origin);
      connect.add(`wss://${host}`);   // realtime subscriptions
    } catch { /* malformed SUPABASE_URL — leave connect-src at 'self' */ }
  }
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    // Leaflet fetches map tiles over https, and floor plans render as data: URIs.
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    `connect-src ${[...connect].join(' ')}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ');
}

const CSP = buildCsp();

function send(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': CSP,
    // The web app never needs these; the Flutter app asks for location itself.
    'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(self), payment=()',
    ...headers
  });
  res.end(body);
}

function resolveFile(urlPath) {
  let cleanPath;
  try {
    cleanPath = urlPath === '/' ? '/index.html' : decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;   // malformed percent-encoding
  }
  const filePath = path.join(rootDir, cleanPath);
  if (!filePath.startsWith(rootDir)) return null;
  if (isForbiddenPath(path.relative(rootDir, filePath))) return null;
  return filePath;
}

http.createServer((req, res) => {
  const requestPath = (req.url || '/').split('?')[0];

  // Runtime configuration for the browser. Generated per request from the
  // process environment so the keys live in the deployment, not the repository.
  if (req.method === 'GET' && requestPath === '/env.js') {
    const publicEnv = {};
    for (const key of PUBLIC_ENV_KEYS) publicEnv[key] = process.env[key] || '';
    send(res, 200, `window.__REPELLENT_ENV__ = ${JSON.stringify(publicEnv)};\n`, {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    return;
  }

  // There is no legacy state API anymore. Do not let the SPA fallback turn an
  // accidental /api/* request into a misleading 200 HTML response.
  if (requestPath.startsWith('/api/')) {
    send(res, 404, 'Not Found');
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
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.warn('[uyari] SUPABASE_URL / SUPABASE_ANON_KEY tanimli degil — .env.example dosyasina bakin.');
  }
});
