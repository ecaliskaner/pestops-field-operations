import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../services/app_state.dart';
import '../theme.dart';
import '../widgets/common.dart';
import 'qr_scan_screen.dart';
import 'station_form_screen.dart';

class JobDetailScreen extends StatelessWidget {
  final String workOrderId;
  const JobDetailScreen({super.key, required this.workOrderId});

  @override
  Widget build(BuildContext context) {
    final st = context.watch<AppState>();
    final w = st.jobById(workOrderId);
    if (w == null) {
      return const Scaffold(body: Center(child: Text('İş emri bulunamadı.')));
    }
    return Scaffold(
      appBar: AppBar(
        title: Text(w.site.company, style: const TextStyle(fontSize: 16)),
        actions: [Padding(padding: const EdgeInsets.only(right: 8), child: Center(child: const ConnectionBadge()))],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _facilityCard(context, w),
          const SizedBox(height: 14),
          _lifecycle(w),
          const SizedBox(height: 14),
          if (w.arrived && !w.started) _firstQrWarning(),
          _actions(context, st, w),
          const SizedBox(height: 18),
          _stationsHeader(w),
          const SizedBox(height: 8),
          ...w.site.stations.map((s) => _stationTile(context, st, w, s)),
          const SizedBox(height: 16),
          if (w.started && !w.completed)
            OutlinedButton.icon(
              icon: const Icon(Icons.check_circle_outline),
              label: const Text('Ziyareti Tamamla'),
              onPressed: () async {
                final msg = await st.complete(w);
                if (context.mounted) showSnack(context, msg);
              },
            ),
          if (w.completed)
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: AppColors.success.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
              child: const Row(children: [
                Icon(Icons.verified, color: AppColors.success),
                SizedBox(width: 8),
                Text('Ziyaret tamamlandı.', style: TextStyle(fontWeight: FontWeight.w600)),
              ]),
            ),
        ],
      ),
    );
  }

  Widget _facilityCard(BuildContext context, WorkOrder w) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              StatusChip(w.priority == 'critical' ? 'Kritik' : (w.priority == 'high' ? 'Yüksek' : 'Normal'), priorityColor(w.priority)),
              const Spacer(),
              Text('Ziyaret: ${w.visitType}', style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
            ]),
            const SizedBox(height: 10),
            Text(w.site.name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            Text(w.site.sector, style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
            const SizedBox(height: 10),
            _row(Icons.place_outlined, w.site.address),
            _row(Icons.person_outline, '${w.site.contactName} · ${w.site.contactPhone}'),
            _row(Icons.description_outlined, w.title),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.map_outlined, size: 18),
                  label: const Text('Tesis planı'),
                  onPressed: () => _showFloorPlan(context, w),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.navigation_outlined, size: 18),
                  label: const Text('Haritada aç'),
                  onPressed: () => showSnack(context, 'Navigasyon: ${w.site.lat.toStringAsFixed(4)}, ${w.site.lng.toStringAsFixed(4)}'),
                ),
              ),
            ]),
          ],
        ),
      ),
    );
  }

  Widget _row(IconData icon, String text) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, size: 16, color: AppColors.textMuted),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 13))),
        ]),
      );

  // Three-stage lifecycle — the tech-doc's core audit story (§7).
  Widget _lifecycle(WorkOrder w) {
    Widget step(String label, bool done, bool active, String? time) => Expanded(
          child: Column(children: [
            Container(
              width: 26,
              height: 26,
              decoration: BoxDecoration(
                color: done ? AppColors.success : (active ? AppColors.warning : AppColors.line),
                shape: BoxShape.circle,
              ),
              child: Icon(done ? Icons.check : Icons.circle, size: 14, color: Colors.white),
            ),
            const SizedBox(height: 6),
            Text(label, textAlign: TextAlign.center, style: TextStyle(fontSize: 11, fontWeight: active || done ? FontWeight.w700 : FontWeight.normal)),
            if (time != null) Text(time, style: const TextStyle(fontSize: 10, color: AppColors.textMuted)),
          ]),
        );
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 10),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          step('Planlandı', true, !w.arrived, null),
          _connector(w.arrived),
          step('Tesise varıldı\n(GPS)', w.arrived, w.arrived && !w.started, _fmt(w.arrivedGpsAt)),
          _connector(w.started),
          step('Gerçek başladı\n(İlk QR)', w.started, w.started && !w.completed, _fmt(w.realWorkStartedAt)),
        ]),
      ),
    );
  }

  Widget _connector(bool on) => Padding(
        padding: const EdgeInsets.only(top: 12),
        child: SizedBox(width: 24, child: Divider(color: on ? AppColors.success : AppColors.line, thickness: 2)),
      );

  Widget _firstQrWarning() => Container(
        margin: const EdgeInsets.only(bottom: 14),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.warning.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.warning.withValues(alpha: 0.4)),
        ),
        child: const Row(children: [
          Icon(Icons.warning_amber_rounded, color: AppColors.warning),
          SizedBox(width: 10),
          Expanded(child: Text('GPS doğrulandı ama iş henüz gerçek başlamadı. İlk QR bekleniyor.',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500))),
        ]),
      );

  Widget _actions(BuildContext context, AppState st, WorkOrder w) {
    if (!w.arrived) {
      return FilledButton.icon(
        icon: const Icon(Icons.location_on),
        label: const Text('Müşteriye Vardım'),
        onPressed: () => _arrive(context, st, w),
      );
    }
    if (!w.started) {
      return FilledButton.icon(
        style: FilledButton.styleFrom(backgroundColor: AppColors.activity),
        icon: const Icon(Icons.qr_code_scanner),
        label: const Text('İlk QR Tara (İşi Başlat)'),
        onPressed: () => _scan(context, w),
      );
    }
    return FilledButton.icon(
      icon: const Icon(Icons.qr_code_scanner),
      label: const Text('İstasyon QR Tara'),
      onPressed: () => _scan(context, w),
    );
  }

  Future<void> _arrive(BuildContext context, AppState st, WorkOrder w) async {
    showDialog(context: context, barrierDismissible: false, builder: (_) => const Center(child: CircularProgressIndicator()));
    final pos = await _currentPosition(w);
    if (context.mounted) Navigator.pop(context);
    final msg = await st.arrive(w, pos.$1, pos.$2);
    if (context.mounted) showSnack(context, msg);
  }

  // Real GPS where available; on denial/error we fall back to the facility's
  // own coordinates so the demo still records a plausible arrival.
  Future<(double, double)> _currentPosition(WorkOrder w) async {
    try {
      LocationPermission perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
      if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
        return (w.site.lat, w.site.lng);
      }
      final p = await Geolocator.getCurrentPosition().timeout(const Duration(seconds: 6));
      return (p.latitude, p.longitude);
    } catch (_) {
      return (w.site.lat, w.site.lng);
    }
  }

  Future<void> _scan(BuildContext context, WorkOrder w) async {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => QrScanScreen(workOrderId: w.id)));
  }

  Widget _stationsHeader(WorkOrder w) {
    final checked = w.inspections.length;
    return Row(children: [
      const Text('İSTASYONLAR', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.textMuted, letterSpacing: 0.5)),
      const Spacer(),
      Text('$checked / ${w.site.stations.length} kontrol edildi', style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
    ]);
  }

  Widget _stationTile(BuildContext context, AppState st, WorkOrder w, Station s) {
    final insp = w.inspections.where((i) => i.stationCode == s.code).cast<InspectionSummary?>().firstWhere((_) => true, orElse: () => null);
    final status = insp?.status ?? 'unchecked';
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Card(
        child: ListTile(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          leading: Container(
            width: 40, height: 40,
            decoration: BoxDecoration(color: statusColor(status).withValues(alpha: 0.15), borderRadius: BorderRadius.circular(10)),
            child: Icon(_typeIcon(s.type), color: statusColor(status), size: 20),
          ),
          title: Text(s.code, style: const TextStyle(fontWeight: FontWeight.w600)),
          subtitle: Text(insp == null ? _typeLabel(s.type) : '${_statusLabel(status)}${insp.activityCount > 0 ? ' · ${insp.activityCount} adet' : ''}',
              style: TextStyle(fontSize: 12, color: insp == null ? AppColors.textMuted : statusColor(status))),
          trailing: insp != null ? Icon(Icons.check_circle, color: statusColor(status), size: 20) : const Icon(Icons.chevron_right),
          onTap: () {
            if (!w.started) {
              showSnack(context, 'Önce ilk QR okutulmalı — iş gerçek başlamadan form doldurulamaz.', error: true);
              return;
            }
            Navigator.push(context, MaterialPageRoute(builder: (_) => StationFormScreen(workOrderId: w.id, stationCode: s.code)));
          },
        ),
      ),
    );
  }

  void _showFloorPlan(BuildContext context, WorkOrder w) {
    bool offlineSaved = false;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (c) => StatefulBuilder(builder: (c, setSheet) {
        return Padding(
          padding: const EdgeInsets.all(20),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Text('${w.site.name} — Kat Planı', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              const Spacer(),
              if (offlineSaved) const StatusChip('Offline hazır', AppColors.success),
            ]),
            const SizedBox(height: 12),
            AspectRatio(
              aspectRatio: 1.4,
              child: Container(
                decoration: BoxDecoration(
                  color: const Color(0xFFF1F5F9),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.line),
                ),
                child: LayoutBuilder(builder: (c, box) {
                  final stations = w.site.stations;
                  return Stack(children: [
                    for (int i = 0; i < stations.length; i++)
                      Positioned(
                        left: (0.12 + 0.76 * (i % 4) / 3) * box.maxWidth - 12,
                        top: (0.18 + 0.64 * (i ~/ 4) / ((stations.length / 4).ceil().clamp(1, 99))) * box.maxHeight,
                        child: _dot(w, stations[i]),
                      ),
                  ]);
                }),
              ),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              icon: Icon(offlineSaved ? Icons.download_done : Icons.download_outlined, size: 18),
              label: Text(offlineSaved ? 'Offline kullanım için indirildi' : 'Offline kullanım için indir'),
              onPressed: offlineSaved ? null : () { setSheet(() => offlineSaved = true); showSnack(c, 'Plan cihaza indirildi — offline kullanılabilir.'); },
            ),
            const SizedBox(height: 4),
            Text('Not: Plan indirmek opsiyoneldir; varsayılan olarak uygulama içinden görüntülenir.', style: TextStyle(fontSize: 11, color: AppColors.textMuted)),
          ]),
        );
      }),
    );
  }

  Widget _dot(WorkOrder w, Station s) {
    final insp = w.inspections.where((i) => i.stationCode == s.code).cast<InspectionSummary?>().firstWhere((_) => true, orElse: () => null);
    final c = statusColor(insp?.status ?? 'unchecked');
    return Column(mainAxisSize: MainAxisSize.min, children: [
      Container(width: 20, height: 20, decoration: BoxDecoration(color: c, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 2))),
      Text(s.code, style: const TextStyle(fontSize: 8, fontWeight: FontWeight.w600)),
    ]);
  }

  IconData _typeIcon(String t) {
    switch (t) {
      case 'rodent':
        return Icons.pest_control_rodent;
      case 'flying':
      case 'insect_light_trap':
        return Icons.flare;
      default:
        return Icons.bug_report;
    }
  }

  String _typeLabel(String t) {
    switch (t) {
      case 'rodent':
        return 'Kemirgen istasyonu';
      case 'crawler':
        return 'Yürüyen haşere';
      case 'flying':
        return 'Uçan haşere';
      case 'insect_light_trap':
        return 'UV ışıklı tuzak';
      default:
        return 'İstasyon';
    }
  }

  String _statusLabel(String s) {
    switch (s) {
      case 'clean':
        return 'Temiz';
      case 'activity':
        return 'Aktivite var';
      case 'damaged':
        return 'Hasarlı';
      case 'missing':
        return 'Eksik';
      default:
        return 'Kontrol edilmedi';
    }
  }

  String? _fmt(String? iso) {
    if (iso == null) return null;
    final d = DateTime.tryParse(iso)?.toLocal();
    if (d == null) return null;
    return '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
  }
}
