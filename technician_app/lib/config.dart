// Compile-time backend configuration.
//
// Mirrors the web app's approach (server.js serves /env.js from process env)
// but Flutter has no server to inject values at request time, so the
// equivalent is --dart-define at build time:
//
//   flutter run \
//     --dart-define=SUPABASE_URL=https://xxxx.supabase.co \
//     --dart-define=SUPABASE_ANON_KEY=eyJ...
//
// Neither value is a secret in the way a server-side key is: the anon key is
// meant to be embedded in a distributed client and grants nothing by itself —
// every row this app can reach is decided by the RLS policies in
// supabase/migrations, evaluated against the signed-in technician's own JWT.
// It still should not be hand-typed into source control, so it is read here
// rather than hardcoded, and CI/release builds should inject it from a
// secrets store rather than committing a value.
class Config {
  static const supabaseUrl = String.fromEnvironment('SUPABASE_URL');
  static const supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');

  static bool get isConfigured => supabaseUrl.isNotEmpty && supabaseAnonKey.isNotEmpty;
}
