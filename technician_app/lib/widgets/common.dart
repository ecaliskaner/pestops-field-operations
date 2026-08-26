import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/app_state.dart';
import '../theme.dart';

/// The connection badge required by the tech-doc (§8.4 "Offline Sync"): a calm
/// pill that shows online / offline and the pending-record count.
class ConnectionBadge extends StatelessWidget {
  const ConnectionBadge({super.key});
  @override
  Widget build(BuildContext context) {
    final st = context.watch<AppState>();
    final offline = st.offlineMode;
    final pending = st.pendingCount;
    final color = offline ? AppColors.warning : AppColors.success;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.5)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(offline ? Icons.cloud_off : Icons.cloud_done, size: 15, color: color),
        const SizedBox(width: 5),
        Text(
          offline ? 'Çevrimdışı' : 'Online',
          style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600),
        ),
        if (pending > 0) ...[
          const SizedBox(width: 6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
            decoration: BoxDecoration(color: AppColors.activity, borderRadius: BorderRadius.circular(10)),
            child: Text('$pending', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
          ),
        ],
      ]),
    );
  }
}

class StatusChip extends StatelessWidget {
  final String label;
  final Color color;
  const StatusChip(this.label, this.color, {super.key});
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(label, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }
}

Color priorityColor(String p) {
  switch (p) {
    case 'critical':
      return AppColors.activity;
    case 'high':
      return AppColors.warning;
    default:
      return AppColors.secondary;
  }
}

void showSnack(BuildContext context, String msg, {bool error = false}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: error ? AppColors.activity : AppColors.primary,
      behavior: SnackBarBehavior.floating,
    ));
}
