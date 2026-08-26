import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../services/app_state.dart';
import '../theme.dart';
import '../widgets/common.dart';
import 'job_detail_screen.dart';
import 'sync_screen.dart';

class RouteScreen extends StatelessWidget {
  const RouteScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final st = context.watch<AppState>();
    final tech = st.technician;
    final today = DateFormat('d MMMM y', 'tr').format(DateTime.now());
    final done = st.route.where((w) => w.completed).length;
    final next = st.route.firstWhere((w) => !w.completed, orElse: () => st.route.isNotEmpty ? st.route.first : _empty);

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(tech?.name ?? 'Teknisyen', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            Text('Günlük Rota · $today', style: const TextStyle(fontSize: 11, color: Colors.white70)),
          ],
        ),
        actions: [
          Padding(padding: const EdgeInsets.only(right: 4), child: Center(child: const ConnectionBadge())),
          IconButton(
            tooltip: 'Senkronizasyon',
            icon: Badge(
              isLabelVisible: st.pendingCount > 0,
              label: Text('${st.pendingCount}'),
              child: const Icon(Icons.sync),
            ),
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SyncScreen())),
          ),
          PopupMenuButton<String>(
            onSelected: (v) {
              if (v == 'offline') st.toggleOffline();
              if (v == 'refresh') st.loadRoute();
              if (v == 'logout') st.logout();
            },
            itemBuilder: (_) => [
              PopupMenuItem(value: 'offline', child: Text(st.offlineMode ? '📶 Çevrimiçi ol' : '✈ Çevrimdışı moda geç')),
              const PopupMenuItem(value: 'refresh', child: Text('↻ Rotayı yenile')),
              const PopupMenuItem(value: 'logout', child: Text('Çıkış yap')),
            ],
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => st.loadRoute(),
        child: st.loading && st.route.isEmpty
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  _summaryCard(context, st.route.length, done, next),
                  const SizedBox(height: 18),
                  const Padding(
                    padding: EdgeInsets.only(left: 4, bottom: 8),
                    child: Text('BUGÜNKÜ İŞLER', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.textMuted, letterSpacing: 0.5)),
                  ),
                  if (st.route.isEmpty)
                    const Padding(padding: EdgeInsets.all(24), child: Center(child: Text('Bugün için atanmış iş yok.')))
                  else
                    ...st.route.map((w) => _jobTile(context, w)),
                ],
              ),
      ),
    );
  }

  Widget _summaryCard(BuildContext context, int total, int done, WorkOrder next) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: _stat('$total', 'Bugünkü İş')),
                Container(width: 1, height: 40, color: AppColors.line),
                Expanded(child: _stat('$done', 'Tamamlanan')),
                Container(width: 1, height: 40, color: AppColors.line),
                Expanded(child: _stat('${total - done}', 'Kalan')),
              ],
            ),
            if (next.id.isNotEmpty) ...[
              const Divider(height: 24),
              Row(children: [
                const Icon(Icons.navigation_outlined, size: 18, color: AppColors.primary),
                const SizedBox(width: 8),
                Expanded(
                  child: Text.rich(TextSpan(children: [
                    const TextSpan(text: 'Sıradaki: ', style: TextStyle(color: AppColors.textMuted, fontSize: 13)),
                    TextSpan(text: '${next.site.company} · ${next.dueAt}', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                  ])),
                ),
              ]),
            ],
          ],
        ),
      ),
    );
  }

  Widget _stat(String value, String label) => Column(
        children: [
          Text(value, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: AppColors.primary)),
          Text(label, style: const TextStyle(fontSize: 11, color: AppColors.textMuted)),
        ],
      );

  Widget _jobTile(BuildContext context, WorkOrder w) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Card(
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => JobDetailScreen(workOrderId: w.id))),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  StatusChip(w.stageLabel, _stageColor(w)),
                  const Spacer(),
                  Icon(Icons.schedule, size: 14, color: AppColors.textMuted),
                  const SizedBox(width: 4),
                  Text(w.dueAt, style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
                ]),
                const SizedBox(height: 10),
                Text(w.site.company, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                Text(w.site.name, style: const TextStyle(fontSize: 13, color: AppColors.textMuted)),
                const SizedBox(height: 8),
                Row(children: [
                  Container(width: 8, height: 8, decoration: BoxDecoration(color: priorityColor(w.priority), shape: BoxShape.circle)),
                  const SizedBox(width: 6),
                  Expanded(child: Text(w.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12))),
                  const Icon(Icons.chevron_right, color: AppColors.textMuted),
                ]),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Color _stageColor(WorkOrder w) {
    if (w.completed) return AppColors.success;
    if (w.started) return AppColors.primary;
    if (w.arrived) return AppColors.warning;
    return AppColors.secondary;
  }

  static final WorkOrder _empty = WorkOrder(
    id: '', title: '', priority: 'medium', visitType: '', dueAt: '', description: '',
    status: 'scheduled', site: Site(id: '', company: '', name: '', city: '', sector: '', address: '', lat: 0, lng: 0, geofenceRadiusM: 0, contactName: '', contactPhone: '', stations: const []),
    inspections: const [],
  );
}
