import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../services/app_state.dart';
import '../theme.dart';
import '../widgets/common.dart';

class StationFormScreen extends StatefulWidget {
  final String workOrderId;
  final String stationCode;
  const StationFormScreen({super.key, required this.workOrderId, required this.stationCode});
  @override
  State<StationFormScreen> createState() => _StationFormScreenState();
}

class _StationFormScreenState extends State<StationFormScreen> {
  String _status = 'clean';
  String _pest = 'none';
  int _count = 0;
  int _photos = 0;
  final _notes = TextEditingController();
  bool _saving = false;

  static const _statuses = [
    ('clean', 'Temiz', AppColors.success),
    ('activity', 'Aktivite Var', AppColors.activity),
    ('damaged', 'Hasarlı', AppColors.secondary),
    ('missing', 'Eksik', AppColors.secondary),
  ];
  static const _pests = [
    ('none', 'Yok'),
    ('rodent', 'Kemirgen'),
    ('crawler', 'Yürüyen Haşere'),
    ('flying', 'Uçan Haşere'),
    ('other', 'Diğer'),
  ];

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  Station? _nextUnchecked(WorkOrder w) {
    for (final s in w.site.stations) {
      if (s.code == widget.stationCode) continue;
      final done = w.inspections.any((i) => i.stationCode == s.code);
      if (!done) return s;
    }
    return null;
  }

  Future<void> _save({required bool goNext}) async {
    setState(() => _saving = true);
    final st = context.read<AppState>();
    final w = st.jobById(widget.workOrderId)!;
    final msg = await st.saveInspection(
      w,
      stationCode: widget.stationCode,
      status: _status,
      pestType: _status == 'activity' ? _pest : 'none',
      activityCount: _status == 'activity' ? _count : 0,
      notes: _notes.text,
      photoCount: _photos,
    );
    if (!mounted) return;
    showSnack(context, msg);
    final next = goNext ? _nextUnchecked(w) : null;
    if (next != null) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => StationFormScreen(workOrderId: widget.workOrderId, stationCode: next.code)),
      );
    } else {
      Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    final activity = _status == 'activity';
    return Scaffold(
      appBar: AppBar(title: Text('İstasyon ${widget.stationCode}')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('DURUM', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.textMuted)),
          const SizedBox(height: 10),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: _statuses.map((s) {
              final sel = _status == s.$1;
              return ChoiceChip(
                label: Text(s.$2),
                selected: sel,
                onSelected: (_) => setState(() => _status = s.$1),
                selectedColor: s.$3.withValues(alpha: 0.18),
                labelStyle: TextStyle(color: sel ? s.$3 : AppColors.primary, fontWeight: sel ? FontWeight.w700 : FontWeight.normal),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10), side: BorderSide(color: sel ? s.$3 : AppColors.line)),
                backgroundColor: AppColors.card,
              );
            }).toList(),
          ),
          if (activity) ...[
            const SizedBox(height: 22),
            const Text('ZARARLI TÜRÜ', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.textMuted)),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: _pests.where((p) => p.$1 != 'none').map((p) {
                final sel = _pest == p.$1;
                return ChoiceChip(
                  label: Text(p.$2),
                  selected: sel,
                  onSelected: (_) => setState(() => _pest = p.$1),
                  selectedColor: AppColors.primary.withValues(alpha: 0.12),
                );
              }).toList(),
            ),
            const SizedBox(height: 22),
            const Text('AKTİVİTE ADEDİ', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.textMuted)),
            const SizedBox(height: 6),
            Row(children: [
              IconButton.filledTonal(onPressed: () => setState(() => _count = (_count - 1).clamp(0, 999)), icon: const Icon(Icons.remove)),
              Expanded(child: Text('$_count', textAlign: TextAlign.center, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.bold))),
              IconButton.filledTonal(onPressed: () => setState(() => _count++), icon: const Icon(Icons.add)),
            ]),
          ],
          const SizedBox(height: 22),
          const Text('FOTOĞRAF', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.textMuted)),
          const SizedBox(height: 10),
          Row(children: [
            for (int i = 0; i < _photos; i++)
              Container(
                width: 56, height: 56, margin: const EdgeInsets.only(right: 8),
                decoration: BoxDecoration(color: AppColors.line, borderRadius: BorderRadius.circular(10)),
                child: const Icon(Icons.image, color: AppColors.secondary),
              ),
            InkWell(
              onTap: () => setState(() => _photos++),
              borderRadius: BorderRadius.circular(10),
              child: Container(
                width: 56, height: 56,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppColors.line, style: BorderStyle.solid),
                ),
                child: const Icon(Icons.add_a_photo_outlined, color: AppColors.textMuted),
              ),
            ),
          ]),
          const SizedBox(height: 22),
          const Text('NOT', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.textMuted)),
          const SizedBox(height: 10),
          TextField(
            controller: _notes,
            maxLines: 3,
            decoration: const InputDecoration(hintText: 'İstasyonla ilgili gözlem...'),
          ),
          const SizedBox(height: 24),
          FilledButton.icon(
            icon: _saving ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.arrow_forward),
            label: const Text('Kaydet ve Sonraki İstasyon'),
            onPressed: _saving ? null : () => _save(goNext: true),
          ),
          const SizedBox(height: 8),
          OutlinedButton(onPressed: _saving ? null : () => _save(goNext: false), child: const Text('Kaydet ve Kapat')),
        ],
      ),
    );
  }
}
