import 'dart:io' show Platform;
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/models.dart';
import 'api_client.dart';
import 'mock_backend.dart';
import 'outbox.dart';

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

/// The single source of truth the UI listens to.
class AppState extends ChangeNotifier {
  late ApiClient api;
  final Outbox outbox = Outbox();

  Technician? technician;
  String? _token;
  String baseUrl = _defaultBaseUrl();

  List<WorkOrder> route = [];
  bool loading = false;
  String? lastSyncAtLocal;

  /// Manual demo toggle. Field techs (and presenters) can force airplane mode
  /// on stage; a real network failure also flips this on automatically.
  bool offlineMode = false;

  bool get isLoggedIn => _token != null && technician != null;
  int get pendingCount => outbox.length;

  static String _defaultBaseUrl() {
    if (kIsWeb) return 'http://localhost:4173';
    try {
      if (Platform.isAndroid) return 'http://10.0.2.2:4173'; // emulator → host
    } catch (_) {}
    return 'http://localhost:4173';
  }

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    baseUrl = prefs.getString('baseUrl') ?? _defaultBaseUrl();
    _token = prefs.getString('token');
    lastSyncAtLocal = prefs.getString('lastSyncAt');
    final techJson = prefs.getString('technician');
    if (techJson != null) {
      // stored as email:name:... minimal — re-fetch on next bootstrap anyway
    }
    api = ApiClient(baseUrl: baseUrl, token: _token);
    await outbox.load();
    notifyListeners();
  }

  Future<void> setBaseUrl(String url) async {
    baseUrl = url.trim().replaceAll(RegExp(r'/+$'), '');
    api.baseUrl = baseUrl;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('baseUrl', baseUrl);
    notifyListeners();
  }

  Future<String?> login(String email, String password) async {
    loading = true;
    notifyListeners();
    try {
      final res = await api.login(email, password);
      _token = res['token'];
      api.token = _token;
      technician = Technician.fromJson(res['technician']);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('token', _token!);
      await prefs.setString('technician', technician!.email);
      offlineMode = false;
      await loadRoute();
      return null;
    } on ApiException catch (e) {
      return e.statusCode == 401 ? 'E-posta veya şifre hatalı.' : e.message;
    } catch (_) {
      // Backend unreachable (wrong address, or this build has no server
      // behind it at all — e.g. a static demo deploy). Fall back to the
      // bundled demo dataset so the known accounts still work, fully
      // offline: every action already has a local/offline path.
      final mockTech = MockBackend.findTechnician(email, password);
      if (mockTech == null) return 'E-posta veya şifre hatalı.';
      technician = mockTech;
      _token = 'demo-${mockTech.email}';
      api.token = _token;
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('token', _token!);
      await prefs.setString('technician', technician!.email);
      offlineMode = true;
      route = MockBackend.routeFor(mockTech.email);
      return null;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> logout() async {
    _token = null;
    technician = null;
    route = [];
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('token');
    await prefs.remove('technician');
    notifyListeners();
  }

  Future<void> loadRoute() async {
    loading = true;
    notifyListeners();
    try {
      final res = await api.bootstrap();
      final list = (res['route'] as List).map((e) => WorkOrder.fromJson(e)).toList();
      route = list;
      offlineMode = false;
    } catch (_) {
      // Stay on cached route; flip the badge to offline.
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

  void _replaceJob(Map<String, dynamic>? woJson) {
    if (woJson == null) return;
    final updated = WorkOrder.fromJson(woJson);
    final i = route.indexWhere((w) => w.id == updated.id);
    if (i >= 0) route[i] = updated;
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
      final res = await api.depart(w.id);
      _replaceJob(res['workOrder']);
    } catch (_) {
      offlineMode = true;
      w.status = 'on_the_way';
      notifyListeners();
    }
  }

  /// GPS arrival — deliberately NOT work start. Returns a status message.
  Future<String> arrive(WorkOrder w, double lat, double lng) async {
    if (offlineMode) {
      w.status = 'arrived_gps';
      w.arrivedGpsAt = DateTime.now().toUtc().toIso8601String();
      await outbox.add(
        type: 'arrive',
        label: '${w.site.company} — GPS varış',
        payload: {'workOrderId': w.id, 'lat': lat, 'lng': lng},
      );
      notifyListeners();
      return 'GPS konumu kaydedildi (çevrimdışı). İş henüz başlamadı — ilk QR bekleniyor.';
    }
    try {
      final res = await api.arrive(w.id, lat, lng);
      _replaceJob(res['workOrder']);
      return res['message'] ?? 'GPS doğrulandı. İlk QR bekleniyor.';
    } catch (_) {
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
        w.realWorkStartedAt = DateTime.now().toUtc().toIso8601String();
        w.status = 'started_by_first_qr';
      }
      await outbox.add(
        type: 'qr_scan',
        label: '${w.site.company} — QR ${st.code}${first ? ' (ilk QR)' : ''}',
        payload: {'workOrderId': w.id, 'stationCode': st.code, 'first': first},
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
      final res = await api.qrScan(w.id, raw);
      _replaceJob(res['workOrder']);
      return ScanResult(
        ok: true,
        isFirstScan: res['isFirstScan'] == true,
        stationCode: res['stationCode'] ?? '',
        message: res['message'] ?? '',
      );
    } on ApiException catch (e) {
      return ScanResult(ok: false, isFirstScan: false, stationCode: '', message: e.message);
    } catch (_) {
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
      );
      notifyListeners();
      return 'Form çevrimdışı kaydedildi. Sync kuyruğunda.';
    }
    try {
      final res = await api.saveInspection({...payload, 'mobileEventId': Outbox.newEventId()});
      _replaceJob(res['workOrder']);
      return 'Form kaydedildi ✓';
    } catch (_) {
      offlineMode = true;
      await outbox.add(
        type: 'inspection',
        label: '${w.site.company} — $stationCode formu',
        payload: payload,
      );
      notifyListeners();
      return 'Bağlantı yok — form sync kuyruğuna alındı.';
    }
  }

  Future<String> complete(WorkOrder w) async {
    if (!w.started) return 'İş tamamlanamaz — önce ilk QR okutulmalı.';
    if (offlineMode) {
      w.status = 'completed';
      w.completedAt = DateTime.now().toUtc().toIso8601String();
      notifyListeners();
      return 'Ziyaret çevrimdışı tamamlandı.';
    }
    try {
      final res = await api.complete(w.id);
      _replaceJob(res['workOrder']);
      return 'Ziyaret tamamlandı ✓';
    } on ApiException catch (e) {
      return e.message;
    } catch (_) {
      offlineMode = true;
      return complete(w);
    }
  }

  /// Drain the outbox to the server, one batch, idempotently. Called on
  /// reconnect (offline toggle off) or from the sync screen.
  Future<String> drainOutbox() async {
    if (outbox.isEmpty) return 'Kuyruk boş.';
    if (offlineMode) return 'Önce çevrimiçi olun.';
    final events = outbox.events.map((e) => e.toSyncEvent()).toList();
    try {
      final res = await api.sync(events);
      final results = (res['results'] as List).cast<Map<String, dynamic>>();
      for (final r in results) {
        if (r['ok'] == true) await outbox.remove(r['mobileEventId']);
      }
      if (res['route'] != null) {
        route = (res['route'] as List).map((e) => WorkOrder.fromJson(e)).toList();
      }
      lastSyncAtLocal = DateTime.now().toIso8601String();
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('lastSyncAt', lastSyncAtLocal!);
      notifyListeners();
      return '${res['accepted']} kayıt senkronize edildi.';
    } catch (_) {
      offlineMode = true;
      notifyListeners();
      return 'Senkronizasyon başarısız — bağlantı yok.';
    }
  }
}
