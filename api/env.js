// Vercel serverless function — the production equivalent of server.js's
// /env.js route (see server.js's own comment for the full rationale: no
// bundler, so runtime config reaches the browser via a generated script
// rather than being baked into source).
//
// server.js remains the entrypoint for local dev (`npm start`); Vercel never
// runs it; a continuously-listening http.Server has no serverless
// equivalent, so production uses this file plus vercel.json's static
// handling instead. Keep the two in sync if PUBLIC_ENV_KEYS ever changes.

const PUBLIC_ENV_KEYS = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];

module.exports = (req, res) => {
  const publicEnv = {};
  for (const key of PUBLIC_ENV_KEYS) publicEnv[key] = process.env[key] || '';
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(`window.__REPELLENT_ENV__ = ${JSON.stringify(publicEnv)};\n`);
};
