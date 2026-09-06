import 'dart:convert';
import 'dart:math';
import 'package:shared_preferences/shared_preferences.dart';

/// A single queued side effect waiting to reach the server. Each carries a
/// stable [mobileEventId] so a retry after a flaky network never double-writes
/// (the server dedups on this id — see api/mobileApi.js).
class OutboxEvent {
  final String mobileEventId;
  final String type; // 'inspection' | 'qr_scan' | 'arrive'
  final String label; // human-readable, shown on the sync screen
  final String capturedAt; // ISO — the original capture time, preserved on sync
  final Map<String, dynamic> payload;

  OutboxEvent({
    required this.mobileEventId,
    required this.type,
    required this.label,
    required this.capturedAt,
    required this.payload,
  });

  Map<String, dynamic> toJson() => {
        'mobileEventId': mobileEventId,
        'type': type,
        'label': label,
        'capturedAt': capturedAt,
        'payload': payload,
      };

  Map<String, dynamic> toSyncEvent() => {
        'mobileEventId': mobileEventId,
        'type': type,
        'capturedAt': capturedAt,
        'payload': payload,
      };

  factory OutboxEvent.fromJson(Map<String, dynamic> j) => OutboxEvent(
        mobileEventId: j['mobileEventId'],
        type: j['type'],
        label: j['label'] ?? '',
        capturedAt: j['capturedAt'],
        payload: Map<String, dynamic>.from(j['payload'] ?? {}),
      );
}

/// Persistent FIFO queue. In a production build this would be a SQLite table
/// (drift/sqflite per the tech-doc §7); shared_preferences keeps the demo
/// cross-platform (including the web build) with the same public contract.
class Outbox {
  static const _key = 'technician_outbox_v1';
  final List<OutboxEvent> _events = [];

  List<OutboxEvent> get events => List.unmodifiable(_events);
  int get length => _events.length;
  bool get isEmpty => _events.isEmpty;

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    _events.clear();
    if (raw != null) {
      for (final e in (jsonDecode(raw) as List)) {
        _events.add(OutboxEvent.fromJson(e as Map<String, dynamic>));
      }
    }
  }

  Future<void> _persist() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(_events.map((e) => e.toJson()).toList()));
  }

  Future<OutboxEvent> add({
    required String type,
    required String label,
    required Map<String, dynamic> payload,
    String? mobileEventId,
    String? capturedAt,
  }) async {
    final ev = OutboxEvent(
      mobileEventId: mobileEventId ?? newEventId(),
      type: type,
      label: label,
      capturedAt: capturedAt ?? DateTime.now().toUtc().toIso8601String(),
      payload: payload,
    );
    _events.add(ev);
    await _persist();
    return ev;
  }

  Future<void> remove(String mobileEventId) async {
    _events.removeWhere((e) => e.mobileEventId == mobileEventId);
    await _persist();
  }

  Future<void> clear() async {
    _events.clear();
    await _persist();
  }

  static final _rnd = Random();
  static String newEventId() {
    final ts = DateTime.now().microsecondsSinceEpoch.toRadixString(36);
    final r = _rnd.nextInt(1 << 32).toRadixString(36);
    return 'm-$ts-$r';
  }
}
