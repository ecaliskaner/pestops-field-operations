// Basic smoke test for the technician app shell.
//
// AppState now talks to Supabase.instance.client, so any widget test that
// reaches TechnicianApp() needs a Supabase instance to exist — even a fake
// one, since initialize() itself makes no network call, it just sets up the
// local session store.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:technician_app/main.dart';

void main() {
  setUpAll(() async {
    // supabase_flutter persists its session via shared_preferences under the
    // hood; the plugin has no platform channel in a widget test, so it needs
    // mock initial values or Supabase.initialize() throws before anything else
    // in the tree gets a chance to run.
    SharedPreferences.setMockInitialValues({});
    await Supabase.initialize(
      url: 'https://test.supabase.co',
      anonKey: 'test-anon-key',
      debug: false,
    );
  });

  testWidgets('App boots to the login screen when signed out', (WidgetTester tester) async {
    await tester.pumpWidget(const TechnicianApp());
    await tester.pump();
    expect(find.text('Giriş Yap'), findsOneWidget);
  });

  testWidgets('Login screen starts with empty fields — no demo credentials prefilled',
      (WidgetTester tester) async {
    await tester.pumpWidget(const TechnicianApp());
    await tester.pump();
    final emailField = tester.widget<TextField>(find.byType(TextField).first);
    expect(emailField.controller?.text, isEmpty);
  });
}
