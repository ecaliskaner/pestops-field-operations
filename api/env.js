// Vercel serverless function — the production equivalent of server.js's
// /env.js route (see server.js's own comment for the full rationale: no
// bundler, so runtime config reaches the browser via a generated script
// rather than being baked into source).
//
// server.js remains the entrypoint for local dev (`npm start`); Vercel never
// runs it; a continuously-listening http.Server has no serverless
// equivalent, so production uses this file plus vercel.json's static
// handling instead. Keep the two in sync if PUBLIC_ENV_KEYS ever changes.

// Fallback values, used only when the Vercel project has no env vars set.
// Neither is a secret: the anon key is designed to be public (it identifies
// the project and grants nothing by itself — every row this app can reach is
// decided by RLS, see supabase/migrations), so hardcoding it here is not a
// security compromise, only a flexibility one — an env var still overrides
// this if/when the Vercel dashboard's env var UI is usable again.
const FALLBACK = {
  SUPABASE_URL: 'https://ekmxscyrbvzkducuvbtn.supabase.co',
  SUPABASE_ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVrbXhzY3lyYnZ6a2R1Y3V2YnRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3Njk4OTYsImV4cCI6MjEwNDM0NTg5Nn0.lvpJHmzc84wh4sARBTozr0Hfg8S1wnDglus7ZBNK1o4',
};

module.exports = (req, res) => {
  const publicEnv = {};
  for (const key of Object.keys(FALLBACK)) publicEnv[key] = process.env[key] || FALLBACK[key];
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(`window.__REPELLENT_ENV__ = ${JSON.stringify(publicEnv)};\n`);
};
