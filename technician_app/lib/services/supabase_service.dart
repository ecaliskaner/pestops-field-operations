import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/models.dart';

/// Thin wrapper over the Supabase client, replacing the old REST ApiClient.
///
/// Every read here relies on Row Level Security (supabase/migrations/
/// *_rls.sql) to scope results to the signed-in technician — there is no
/// `.eq('technician_id', ...)` filter on the route query below because the
/// database itself refuses to return another technician's work orders.
/// Every write that matters — departing, arriving, scanning a QR, saving a
/// form, completing a visit — goes through a SECURITY DEFINER RPC
/// (supabase/migrations/*_rpc_and_storage.sql) rather than a direct table
/// write, because those RPCs own the visit state machine: real_work_started_at
/// is write-once and only the QR-scan RPC may set it.
class SupabaseService {
  SupabaseService(this._client);
  final SupabaseClient _client;

  // Foreign-key embeds, matching the schema in
  // supabase/migrations/20260905000001_core_schema.sql: sites.customer_id ->
  // customers, stations.site_id -> sites, inspections.work_order_id ->
  // work_orders. PostgREST nests each as the relation name.
  static const _workOrderSelect = '''
    id, code, title, description, priority, visit_type, status, due_at,
    departed_at, arrived_gps_at, real_work_started_at, completed_at,
    site:sites(
      id, name, city, sector, address, lat, lng, geofence_radius_m,
      contact_name, contact_phone,
      customer:customers(name),
      stations(id, code, type, qr_token)
    ),
    inspections(station_code, status, pest_type, activity_count)
  ''';

  bool get isLoggedIn => _client.auth.currentSession != null;

  /// Restores a previously persisted session on cold start. supabase_flutter
  /// persists the refresh token itself (via the platform's local storage), so
  /// this is a local check plus a token refresh — not a network round trip
  /// that can fail the way the old code's cached-token guess could.
  Future<bool> restoreSession() async {
    final session = _client.auth.currentSession;
    if (session == null) return false;
    if (session.isExpired) {
      try {
        await _client.auth.refreshSession();
      } on AuthException {
        return false;
      }
    }
    return true;
  }

  Future<void> signIn(String email, String password) => _client.auth
      .signInWithPassword(email: email.trim().toLowerCase(), password: password);

  Future<void> signOut() => _client.auth.signOut();

  Future<Technician> fetchTechnician() async {
    final uid = _client.auth.currentUser?.id;
    if (uid == null) throw StateError('signIn() must succeed before fetchTechnician()');
    final row = await _client.from('technicians').select().eq('profile_id', uid).single();
    return Technician.fromJson(row);
  }

  Future<List<WorkOrder>> fetchRoute() async {
    final rows = await _client.from('work_orders').select(_workOrderSelect).order('due_at');
    return (rows as List)
        .map((e) => WorkOrder.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<WorkOrder> fetchWorkOrder(String id) async {
    final row =
        await _client.from('work_orders').select(_workOrderSelect).eq('id', id).single();
    return WorkOrder.fromJson(row);
  }

  Future<void> depart(String workOrderId) async {
    await _client.rpc('wo_depart', params: {'p_wo': workOrderId});
  }

  /// Returns the RPC's jsonb result (insideGeofence, distanceM, ...) so the
  /// caller can show the right message; the caller re-fetches the work order
  /// separately for the canonical state.
  Future<Map<String, dynamic>> arrive(
    String workOrderId,
    double lat,
    double lng, {
    String? mobileEventId,
    String? capturedAt,
  }) async {
    final res = await _client.rpc('wo_arrive', params: {
      'p_wo': workOrderId,
      'p_lat': lat,
      'p_lng': lng,
      'p_mobile_event_id': mobileEventId,
      'p_captured_at': capturedAt,
    });
    return Map<String, dynamic>.from(res as Map);
  }

  Future<Map<String, dynamic>> qrScan(
    String workOrderId,
    String code, {
    String? mobileEventId,
    String? capturedAt,
  }) async {
    final res = await _client.rpc('wo_scan_qr', params: {
      'p_wo': workOrderId,
      'p_code': code,
      'p_mobile_event_id': mobileEventId,
      'p_captured_at': capturedAt,
    });
    return Map<String, dynamic>.from(res as Map);
  }

  Future<void> saveInspection({
    required String workOrderId,
    required String stationCode,
    required String status,
    String baitStatus = 'intact',
    required String pestType,
    required int activityCount,
    required String notes,
    int photoCount = 0,
    String? mobileEventId,
    String? capturedAt,
  }) async {
    await _client.rpc('save_inspection', params: {
      'p_wo': workOrderId,
      'p_station_code': stationCode,
      'p_status': status,
      'p_bait_status': baitStatus,
      'p_pest_type': pestType,
      'p_activity_count': activityCount,
      'p_notes': notes,
      'p_photo_count': photoCount,
      'p_mobile_event_id': mobileEventId,
      'p_captured_at': capturedAt,
    });
  }

  Future<void> complete(String workOrderId) async {
    await _client.rpc('wo_complete', params: {'p_wo': workOrderId});
  }
}

/// True for the class of failure AppState treats as "we are offline": no
/// response reached the server at all. A PostgrestException or AuthException
/// means the server DID answer (with a rejection), which is a different,
/// user-facing error rather than a reason to queue the action for later.
bool isNetworkFailure(Object error) {
  if (error is AuthException || error is PostgrestException) return false;
  return true;
}
