// Supabase client + runtime configuration.
//
// This app has no bundler, so there is no build step to inline environment
// variables. Instead the server serves a tiny /env.js that assigns
// window.__REPELLENT_ENV__ from its own process env, and this module reads it.
// The keys therefore never live in the repository, and staging and production
// can point at different projects without a rebuild.
//
// On the anon key: it is designed to be public — it identifies the project, it
// does not grant anything. Every row this app can reach is decided by the RLS
// policies in supabase/migrations, evaluated against the signed-in user's JWT.
// The service_role key is the opposite: it bypasses RLS entirely and must never
// reach a browser. If you ever find it in this file, treat it as a leaked
// credential and rotate it.

// vendor/supabase.js is the UMD build, loaded by a plain <script> tag in
// index.html exactly like leaflet and html5-qrcode, so it arrives as a global
// rather than an ES import. The published "+esm" bundle is not self-contained —
// it re-imports five sub-packages from the CDN at runtime, which would put a
// hard network dependency on jsdelivr into every page load.
const sdk = (typeof window !== 'undefined' && window.supabase) || null;
if (!sdk) {
  throw new Error(
    '[repellent] vendor/supabase.js yuklenmedi. index.html icinde ' +
    'src/app.js modulunden ONCE <script src="./vendor/supabase.js"> olmali.'
  );
}
const { createClient } = sdk;

const env = (typeof window !== 'undefined' && window.__REPELLENT_ENV__) || {};

export const SUPABASE_URL = env.SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || '';

export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// A misconfigured deployment must say so — but it must still render. createClient
// throws on an empty url, and because this module sits at the root of the import
// graph that throw takes the login screen down with it: the operator gets a white
// page and no way to learn what is wrong. So placeholders keep the module
// loadable, `isConfigured` gates every real call, and signIn() surfaces the
// problem in the UI where someone will actually see it.
const PLACEHOLDER_URL = 'https://unconfigured.invalid';
const PLACEHOLDER_KEY = 'unconfigured';

if (!isConfigured) {
  console.error(
    '[repellent] Supabase yapılandırması eksik. ' +
    'SUPABASE_URL ve SUPABASE_ANON_KEY ortam değişkenlerini ayarlayın (bkz. .env.example).'
  );
}

export const supabase = createClient(
  SUPABASE_URL || PLACEHOLDER_URL,
  SUPABASE_ANON_KEY || PLACEHOLDER_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'repellent-auth'
    },
    global: {
      headers: { 'x-application-name': 'repellent-ops' }
    }
  }
);

/**
 * Normalise a PostgREST / GoTrue error into something a Turkish-speaking user
 * can act on. Raw Postgres messages leak schema details and read as noise, so
 * the known cases are mapped and anything else falls back to a generic line
 * while the original is logged for support.
 *
 * @param {unknown} error
 * @returns {string}
 */
export function errorMessage(error) {
  if (!error) return '';
  const code = error.code || '';
  const raw = error.message || String(error);

  if (raw.includes('Invalid login credentials')) return 'E-posta veya şifre hatalı.';
  if (raw.includes('Email not confirmed')) return 'E-posta adresiniz henüz doğrulanmamış.';
  if (code === '42501' || raw.includes('insufficient_privilege') || raw.includes('row-level security')) {
    return 'Bu işlem için yetkiniz yok.';
  }
  if (code === '23505') return 'Bu kayıt zaten mevcut.';
  if (code === 'PGRST301' || raw.includes('JWT expired')) return 'Oturumunuz sona erdi, lütfen tekrar giriş yapın.';
  // Business-rule exceptions raised by the RPCs are already written for the
  // technician, so pass them through untouched.
  if (raw.startsWith('Bu QR') || raw.startsWith('İş tamamlanamaz') || raw.startsWith('Is tamamlanamaz')) {
    return raw;
  }

  console.error('[repellent] beklenmeyen hata', error);
  return 'Beklenmeyen bir hata oluştu. Sorun sürerse yöneticinize bildirin.';
}

/**
 * Await a Supabase query and throw a clean Error on failure, so callers can use
 * plain try/catch instead of checking `.error` at every call site.
 *
 * @template T
 * @param {PromiseLike<{ data: T, error: unknown }>} query
 * @returns {Promise<T>}
 */
export async function run(query) {
  const { data, error } = await query;
  if (error) {
    const err = new Error(errorMessage(error));
    err.cause = error;
    throw err;
  }
  return data;
}
