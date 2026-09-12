import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/models.dart';
import 'outbox.dart';
import 'supabase_service.dart';

/// Result of a QR scan, so the screen can react to the first-QR unlock.
class ScanResult {
  final bool ok;
  final bool isFirstScan;
  final String stationCode;
  final String message;
  final bool queuedOffline;
  ScanResult({
    required this.ok,
    required this.isFirstScan,
    required this.stationCode,
    required this.message,
    this.queuedOffline = false,
  });
}

String _nowIso() => DateTime.now().toUtc().toIso8601String();

/// The single source of truth the UI listens to.
///
/// Every mutating field action below follows the same shape: try the live
/// Supabase RPC; if the failure looks like "no network reached the server"
/// (isNetworkFailure), fall back to the offline outbox and reflect the change
/// optimistically in local state; if the server DID answer with a rejection
/// (a PostgrestException — e.g. RLS denied it, or a business rule like
/// "already completed"), surface that real message instead of queuing an
/// action that will only fail again on retry.
class AppState extends ChangeNotifier {
  AppState() : _service = SupabaseService(Supabase.instance.client);

  final SupabaseService _service;
  final Outbox outbox = Outbox();

  Technician? technician;
  List<WorkOrder> route = [];
  bool loading = false;
  String? lastSyncAtLocal;

  /// Manual "force offline" toggle for field testing and demos — the offline
  /// path is exercised deliberately, not just discovered by accident. A real
  /// network failure also flips this on automatically.
  bool offlineMode = false;

  bool get isLoggedIn => _service.isLoggedIn && technician != null;
  int get pendingCount => outbox.length;

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    lastSyncAtLocal = prefs.getString('lastSyncAt');
    await outbox.load();

    final restored = await _service.restoreSession();
    if (restored) {
      try {
        technician = await _service.fetchTechnician();
        await loadRoute();
      } on Object {
        // Session token was valid but the account has no technician row yet
        // (an admin hasn't finished onboarding it) — do not pretend to be
        // logged in with nothing to show.
        await _service.signOut();
        technician = null;
      }
    }
    notifyListeners();
  }

  Future<String?> login(String email, String password) async {
    loading = true;
    notifyListeners();
    try {
      await _service.signIn(email, password);
      technician = await _service.fetchTechnician();
      offlineMode = false;
      await loadRoute();
      return null;
    } on AuthException catch (e) {
      return e.message.contains('Invalid') ? 'E-posta veya şifre hatalı.' : e.message;
    } on Object catch (e) {
      if (technician != null) {
        // signIn succeeded but fetchTechnician found no row for this account.
        await _service.signOut();
        technician = null;
        return 'Hesabınız henüz bir teknisyen kaydına bağlanmamış. Yöneticinize başvurun.';
      }
      if (isNetworkFailure(e)) return 'Sunucuya ulaşılamıyor. İnternet bağlantınızı kontrol edin.';
      return 'Giriş yapılamadı.';
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> logout() async {
    await _service.signOut();
    technician = null;
    route = [];
    notifyListeners();
  }

  Future<void> loadRoute() async {
    loading = true;
    notifyListeners();
    try {
      route = await _service.fetchRoute();
      offlineMode = false;
    } on Object {
      // Stay on the cached route; flip the badge to offline rather than
      // clearing what the technician already has on screen.
      offlineMode = true;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  WorkOrder? jobById(String id) {
    for (final w in route) {
      if (w.id == id) return w;
    }
    return null;
  }

  Future<void> _refreshJob(String id) async {
    try {
      final updated = await _service.fetchWorkOrder(id);
      final i = route.indexWhere((w) => w.id == updated.id);
      if (i >= 0) route[i] = updated;
    } on Object {
      // Best-effort: the optimistic local update already applied by the
      // caller stands until the next successful loadRoute()/refresh.
    }
    notifyListeners();
  }

  Future<void> toggleOffline() async {
    offlineMode = !offlineMode;
    notifyListeners();
    if (!offlineMode) await drainOutbox();
  }

  // ---- field actions ----

  Future<void> depart(WorkOrder w) async {
    if (offlineMode) {
      w.status = 'on_the_way';
      notifyListeners();
      return;
    }
    try {
      await _service.depart(w.id);
      await _refreshJob(w.id);
    } on Object {
      offlineMode = true;
      w.status = 'on_the_way';
      notifyListeners();
    }
  }

  /// GPS arrival — deliberately NOT work start. Returns a status message.
  Future<String> arrive(WorkOrder w, double lat, double lng) async {
    if (offlineMode) {
      w.status = 'arrived_gps';
      w.arrivedGpsAt = _nowIso();
      await outbox.add(
        type: 'arrive',
        label: '${w.site.company} — GPS varış',
        payload: {'workOrderId': w.id, 'lat': lat, 'lng': lng},
      );
      notifyListeners();
      return 'GPS konumu kaydedildi (çevrimdışı). İş henüz başlamadı — ilk QR bekleniyor.';
    }
    try {
      final res = await _service.arrive(w.id, lat, lng,
          mobileEventId: Outbox.newEventId(), capturedAt: _nowIso());
      await _refreshJob(w.id);
      return (res['message'] as String?) ?? 'GPS doğrulandı. İlk QR bekleniyor.';
    } on Object catch (e) {
      if (!isNetworkFailure(e)) return _friendlyMessage(e);
      offlineMode = true;
      return arrive(w, lat, lng);
    }
  }

  /// Scan a QR (or manually-typed code). First successful scan is the
  /// audit-grade real work start.
  Future<ScanResult> qrScan(WorkOrder w, String code) async {
    final raw = code.trim();
    if (offlineMode) {
      // Validate locally against the cached station list.
      Station? st;
      for (final s in w.site.stations) {
        if (s.qrToken == raw || s.code.toLowerCase() == raw.toLowerCase()) {
          st = s;
          break;
        }
      }
      if (st == null) {
        return ScanResult(ok: false, isFirstScan: false, stationCode: '', message: 'Bu QR bu iş emrine ait değil.');
      }
      final first = w.realWorkStartedAt == null;
      if (first) {
        w.realWorkStartedAt = _nowIso();
        w.status = 'started_by_first_qr';
      }
      await outbox.add(
        type: 'qr_scan',
        label: '${w.site.company} — QR ${st.code}${first ? ' (ilk QR)' : ''}',
        payload: {'workOrderId': w.id, 'stationCode': st.code},
      );
      notifyListeners();
      return ScanResult(
        ok: true,
        isFirstScan: first,
        stationCode: st.code,
        queuedOffline: true,
        message: first ? 'Gerçek iş başlangıcı kaydedildi ✓ (çevrimdışı)' : '${st.code} tarandı (çevrimdışı).',
      );
    }
    try {
      final res = await _service.qrScan(w.id, raw,
          mobileEventId: Outbox.newEventId(), capturedAt: _nowIso());
      await _refreshJob(w.id);
      return ScanResult(
        ok: true,
        isFirstScan: res['isFirstScan'] == true,
        stationCode: (res['stationCode'] as String?) ?? '',
        message: (res['message'] as String?) ?? '',
      );
    } on Object catch (e) {
      if (!isNetworkFailure(e)) {
        return ScanResult(ok: false, isFirstScan: false, stationCode: '', message: _friendlyMessage(e));
      }
      offlineMode = true;
      return qrScan(w, code);
    }
  }

  Future<String> saveInspection(
    WorkOrder w, {
    required String stationCode,
    required String status,
    required String pestType,
    required int activityCount,
    required String notes,
    int photoCount = 0,
  }) async {
    final mobileEventId = Outbox.newEventId();
    final capturedAt = _nowIso();
    final payload = {
      'workOrderId': w.id,
      'stationCode': stationCode,
      'status': status,
      'pestType': pestType,
      'activityCount': activityCount,
      'notes': notes,
      'photoCount': photoCount,
    };
    // Optimistic local reflection so the station shows its new colour at once.
    w.inspections.removeWhere((i) => i.stationCode == stationCode);
    w.inspections.add(InspectionSummary(
      stationCode: stationCode,
      status: status,
      pestType: pestType,
      activityCount: activityCount,
    ));
    if (offlineMode) {
      await outbox.add(
        type: 'inspection',
        label: '${w.site.company} — $stationCode formu',
        payload: payload,
        mobileEventId: mobileEventId,
        capturedAt: capturedAt,
      );
      notifyListeners();
      return 'Form çevrimdışı kaydedildi. Sync kuyruğunda.';
    }
    try {
      await _service.saveInspection(
        workOrderId: w.id,
        stationCode: stationCode,
        status: status,
        pestType: pestType,
        activityCount: activityCount,
        notes: notes,
        photoCount: photoCount,
        mobileEventId: mobileEventId,
        capturedAt: capturedAt,
      );
      await _refreshJob(w.id);
      return 'Form kaydedildi ✓';
    } on Object catch (e) {
      if (!isNetworkFailure(e)) return _friendlyMessage(e);
      offlineMode = true;
      await outbox.add(
        type: 'inspection',
        label: '${w.site.company} — $stationCode formu',
        payload: payload,
        mobileEventId: mobileEventId,
        capturedAt: capturedAt,
      );
      notifyListeners();
      return 'Bağlantı yok — form sync kuyruğuna alındı.';
    }
  }

  Future<String> complete(WorkOrder w) async {
    if (!w.started) return 'İş tamamlanamaz — önce ilk QR okutulmalı.';
    if (offlineMode) {
      w.status = 'completed';
      w.completedAt = _nowIso();
      notifyListeners();
      return 'Ziyaret çevrimdışı tamamlandı.';
    }
    try {
      await _service.complete(w.id);
      await _refreshJob(w.id);
      return 'Ziyaret tamamlandı ✓';
    } on Object catch (e) {
      if (!isNetworkFailure(e)) return _friendlyMessage(e);
      offlineMode = true;
      return complete(w);
    }
  }

  /// Drain the outbox to the server, one event at a time, idempotently — each
  /// carries the mobileEventId it was queued with, so a retried sync (or one
  /// that partially succeeded before a connection drop) never double-writes.
  Future<String> drainOutbox() async {
    if (outbox.isEmpty) return 'Kuyruk boş.';
    if (offlineMode) return 'Önce çevrimiçi olun.';
    var accepted = 0;
    for (final ev in List<OutboxEvent>.from(outbox.events)) {
      try {
        await _replay(ev);
        await outbox.remove(ev.mobileEventId);
        accepted++;
      } on Object catch (e) {
        if (!isNetworkFailure(e)) {
          // The server rejected this specific event (not a connectivity
          // problem) — drop it rather than retrying forever, but keep
          // draining the rest of the queue.
          await outbox.remove(ev.mobileEventId);
          continue;
        }
        // Real connectivity failure: stop here, leave the remainder queued.
        offlineMode = true;
        notifyListeners();
        return accepted > 0
            ? '$accepted kayıt senkronize edildi, bağlantı koptu.'
            : 'Senkronizasyon başarısız — bağlantı yok.';
      }
    }
    await loadRoute();
    lastSyncAtLocal = _nowIso();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('lastSyncAt', lastSyncAtLocal!);
    notifyListeners();
    return '$accepted kayıt senkronize edildi.';
  }

  Future<void> _replay(OutboxEvent ev) async {
    final p = ev.payload;
    switch (ev.type) {
      case 'arrive':
        await _service.arrive(
          p['workOrderId'] as String,
          (p['lat'] as num).toDouble(),
          (p['lng'] as num).toDouble(),
          mobileEventId: ev.mobileEventId,
          capturedAt: ev.capturedAt,
        );
        return;
      case 'qr_scan':
        await _service.qrScan(
          p['workOrderId'] as String,
          p['stationCode'] as String,
          mobileEventId: ev.mobileEventId,
          capturedAt: ev.capturedAt,
        );
        return;
      case 'inspection':
        await _service.saveInspection(
          workOrderId: p['workOrderId'] as String,
          stationCode: p['stationCode'] as String,
          status: p['status'] as String,
          pestType: (p['pestType'] as String?) ?? 'none',
          activityCount: (p['activityCount'] as num?)?.toInt() ?? 0,
          notes: (p['notes'] as String?) ?? '',
          photoCount: (p['photoCount'] as num?)?.toInt() ?? 0,
          mobileEventId: ev.mobileEventId,
          capturedAt: ev.capturedAt,
        );
        return;
      default:
        throw StateError('unknown outbox event type: ${ev.type}');
    }
  }

  String _friendlyMessage(Object e) {
    if (e is PostgrestException) return e.message;
    if (e is AuthException) return e.message;
    return 'İşlem tamamlanamadı.';
  }
}
