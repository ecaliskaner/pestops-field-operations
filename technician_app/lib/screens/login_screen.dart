import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/app_state.dart';
import '../theme.dart';
import '../widgets/common.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController(text: 'ayse@ladybug.com');
  final _password = TextEditingController(text: '1234');
  bool _obscure = true;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final st = context.read<AppState>();
    final err = await st.login(_email.text, _password.text);
    if (!mounted) return;
    if (err != null) showSnack(context, err, error: true);
  }

  Future<void> _editServer() async {
    final st = context.read<AppState>();
    final ctrl = TextEditingController(text: st.baseUrl);
    final url = await showDialog<String>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Sunucu adresi'),
        content: TextField(
          controller: ctrl,
          decoration: const InputDecoration(hintText: 'http://10.0.2.2:4173'),
          autofocus: true,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c), child: const Text('İptal')),
          FilledButton(onPressed: () => Navigator.pop(c, ctrl.text), child: const Text('Kaydet')),
        ],
      ),
    );
    if (url != null && url.isNotEmpty) await st.setBaseUrl(url);
  }

  @override
  Widget build(BuildContext context) {
    final st = context.watch<AppState>();
    return Scaffold(
      backgroundColor: AppColors.primary,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 8),
                  Center(
                    child: Container(
                      width: 72,
                      height: 72,
                      decoration: BoxDecoration(
                        color: const Color(0xFF10B981),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: const Center(
                        child: Icon(Icons.shield_rounded, color: Colors.white, size: 38),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text('Repellent Saha',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.bold)),
                  const Text('Teknisyen Uygulaması',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.white70, fontSize: 14)),
                  const SizedBox(height: 28),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          TextField(
                            controller: _email,
                            keyboardType: TextInputType.emailAddress,
                            decoration: const InputDecoration(
                              labelText: 'E-posta / Telefon',
                              prefixIcon: Icon(Icons.person_outline),
                            ),
                          ),
                          const SizedBox(height: 14),
                          TextField(
                            controller: _password,
                            obscureText: _obscure,
                            decoration: InputDecoration(
                              labelText: 'Şifre',
                              prefixIcon: const Icon(Icons.lock_outline),
                              suffixIcon: IconButton(
                                icon: Icon(_obscure ? Icons.visibility_off : Icons.visibility),
                                onPressed: () => setState(() => _obscure = !_obscure),
                              ),
                            ),
                            onSubmitted: (_) => _submit(),
                          ),
                          const SizedBox(height: 18),
                          FilledButton(
                            onPressed: st.loading ? null : _submit,
                            child: st.loading
                                ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                : const Text('Giriş Yap'),
                          ),
                          const SizedBox(height: 6),
                          const Row(children: [
                            Icon(Icons.info_outline, size: 15, color: AppColors.textMuted),
                            SizedBox(width: 6),
                            Expanded(child: Text('İnternet yoksa da kayıt alınır, bağlantı gelince otomatik senkronize edilir.',
                                style: TextStyle(fontSize: 11, color: AppColors.textMuted))),
                          ]),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextButton.icon(
                    onPressed: _editServer,
                    icon: const Icon(Icons.dns_outlined, size: 16, color: Colors.white70),
                    label: Text('Sunucu: ${st.baseUrl}',
                        style: const TextStyle(color: Colors.white70, fontSize: 12)),
                  ),
                  Center(
                    child: Text('Demo: ayse@ladybug.com · mert@ / ece@ / can@ladybug.com — şifre 1234',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Colors.white.withValues(alpha: 0.5), fontSize: 11)),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
