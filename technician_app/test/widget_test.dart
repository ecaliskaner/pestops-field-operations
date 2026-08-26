// Basic smoke test for the technician app shell.
import 'package:flutter_test/flutter_test.dart';
import 'package:technician_app/main.dart';

void main() {
  testWidgets('App boots to the login screen', (WidgetTester tester) async {
    await tester.pumpWidget(const TechnicianApp());
    await tester.pump();
    expect(find.text('Giriş Yap'), findsOneWidget);
  });
}
