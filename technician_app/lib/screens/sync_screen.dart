import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../services/app_state.dart';
import '../theme.dart';
import '../widgets/common.dart';

class SyncScreen extends StatelessWidget {
  const SyncScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final st = context.watch<AppState>();
    final events = st.outbox.events;
    final last = st.lastSyncAtLocal != null ? DateTime.tryParse(st.lastSyncAtLocal!) : null;

    return Scaffold(
      appBar: AppBar(title: const Text('Senkronizasyon')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(children: [
                Row(children: [
                  Icon(st.offlineMode ? Icons.cloud_off : Icons.cloud_done, color: st.offlineMode ? AppColors.warning : AppColors.success),
                  const SizedBox(width: 10),
                  Text(st.offlineMode ? 'Çevrimdışı — kayıt alınıyor' : 'Online', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                  const Spacer(),
                  const ConnectionBadge(),
                ]),
                const Divider(height: 26),
                Row(children: [
                  Expanded(child: _stat('${st.pendingCount}', 'Bekleyen kayıt')),
                  Container(width: 1, height: 36, color: AppColors.line),
                  Expanded(child: _stat(last != null ? DateFormat('HH:mm').format(last) : '—', 'Son senkron')),
                ]),
              ]),
            ),
          ),
          const SizedBox(height: 14),
          Row(children: [
            Expanded(
              child: OutlinedButton.icon(
                icon: Icon(st.offlineMode ? Icons.wifi : Icons.airplanemode_active),
                label: Text(st.offlineMode ? 'Çevrimiçi Ol' : 'Çevrimdışı Moda Geç'),
                onPressed: () => st.toggleOffline(),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: FilledButton.icon(
                icon: const Icon(Icons.sync),
                label: const Text('Tekrar Dene'),
                onPressed: st.offlineMode || st.pendingCount == 0
                    ? null
                    : () async {
                        final msg = await st.drainOutbox();
                        if (context.mounted) showSnack(context, msg);
                      },
              ),
            ),
          ]),
          const SizedBox(height: 22),
          Text('KUYRUK (${events.length})', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.textMuted)),
          const SizedBox(height: 10),
          if (events.isEmpty)
            Container(
              padding: const EdgeInsets.all(28),
              alignment: Alignment.center,
              child: Column(children: [
                const Icon(Icons.check_circle_outline, color: AppColors.success, size: 40),
                const SizedBox(height: 8),
                Text('Tüm kayıtlar senkronize.', style: TextStyle(color: AppColors.textMuted)),
              ]),
            )
          else
            ...events.map((e) => Card(
                  child: ListTile(
                    leading: Icon(_icon(e.type), color: AppColors.warning),
                    title: Text(e.label, style: const TextStyle(fontSize: 14)),
                    subtitle: Text('Bekliyor · ${_fmt(e.capturedAt)}', style: const TextStyle(fontSize: 12)),
                    trailing: const Icon(Icons.hourglass_bottom, size: 18, color: AppColors.textMuted),
                  ),
                )),
          const SizedBox(height: 16),
          Text(
            'Çevrimdışı kayıtlar cihazda tutulur ve bağlantı gelince sıralı, tekrarsız (idempotent) şekilde sunucuya yüklenir. Orijinal kayıt zamanı korunur.',
            style: TextStyle(fontSize: 12, color: AppColors.textMuted),
          ),
        ],
      ),
    );
  }

  Widget _stat(String v, String l) => Column(children: [
        Text(v, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: AppColors.primary)),
        Text(l, style: const TextStyle(fontSize: 11, color: AppColors.textMuted)),
      ]);

  IconData _icon(String t) {
    switch (t) {
      case 'qr_scan':
        return Icons.qr_code;
      case 'arrive':
        return Icons.location_on;
      default:
        return Icons.assignment;
    }
  }

  String _fmt(String iso) {
    final d = DateTime.tryParse(iso)?.toLocal();
    if (d == null) return iso;
    return DateFormat('HH:mm:ss').format(d);
  }
}
