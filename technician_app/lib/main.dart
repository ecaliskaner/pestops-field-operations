import 'package:flutter/material.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'config.dart';
import 'services/app_state.dart';
import 'theme.dart';
import 'screens/login_screen.dart';
import 'screens/route_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('tr', null);

  if (!Config.isConfigured) {
    // A build with no backend configured must say so plainly rather than
    // limping along against an empty URL — the old code's silent fallback to
    // a bundled fake dataset is exactly the failure mode this build removes.
    runApp(const _ConfigMissingApp());
    return;
  }

  await Supabase.initialize(
    url: Config.supabaseUrl,
    // Supabase renamed this: `anonKey` is deprecated and goes away in the next
    // major version. Same value, current parameter name.
    publishableKey: Config.supabaseAnonKey,
  );
  runApp(const TechnicianApp());
}

class TechnicianApp extends StatelessWidget {
  const TechnicianApp({super.key});
  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => AppState()..init(),
      child: MaterialApp(
        title: 'Repellent Saha',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(),
        home: const _Root(),
      ),
    );
  }
}

class _Root extends StatelessWidget {
  const _Root();
  @override
  Widget build(BuildContext context) {
    final st = context.watch<AppState>();
    return st.isLoggedIn ? const RouteScreen() : const LoginScreen();
  }
}

class _ConfigMissingApp extends StatelessWidget {
  const _ConfigMissingApp();
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        backgroundColor: const Color(0xFF14213D),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: const [
                Icon(Icons.cloud_off, color: Colors.white70, size: 48),
                SizedBox(height: 16),
                Text(
                  'Sunucu yapılandırması eksik',
                  style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
                  textAlign: TextAlign.center,
                ),
                SizedBox(height: 8),
                Text(
                  'Bu derleme SUPABASE_URL / SUPABASE_ANON_KEY olmadan build edilmiş.\n'
                  'flutter build ... --dart-define=SUPABASE_URL=... --dart-define=SUPABASE_ANON_KEY=...',
                  style: TextStyle(color: Colors.white70, fontSize: 13),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
