import 'dart:convert';
import 'package:http/http.dart' as http;

/// Thin wrapper over the /api/mobile REST API. Throws [ApiException] on a
/// non-2xx response and rethrows the underlying error on a network failure —
/// AppState treats the latter as "we are offline".
class ApiException implements Exception {
  final int statusCode;
  final String message;
  ApiException(this.statusCode, this.message);
  @override
  String toString() => 'ApiException($statusCode): $message';
}

class ApiClient {
  String baseUrl;
  String? token;
  final Duration timeout;

  ApiClient({required this.baseUrl, this.token, this.timeout = const Duration(seconds: 8)});

  Uri _u(String path) => Uri.parse('$baseUrl/api/mobile$path');

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

  Future<Map<String, dynamic>> _decode(http.Response r) async {
    final body = r.body.isEmpty ? '{}' : r.body;
    Map<String, dynamic> json;
    try {
      json = jsonDecode(body) as Map<String, dynamic>;
    } catch (_) {
      json = {};
    }
    if (r.statusCode < 200 || r.statusCode >= 300) {
      throw ApiException(r.statusCode, json['message'] ?? json['error'] ?? 'İstek başarısız');
    }
    return json;
  }

  Future<Map<String, dynamic>> _get(String path) async =>
      _decode(await http.get(_u(path), headers: _headers).timeout(timeout));

  Future<Map<String, dynamic>> _post(String path, [Map<String, dynamic>? body]) async =>
      _decode(await http.post(_u(path), headers: _headers, body: jsonEncode(body ?? {})).timeout(timeout));

  Future<Map<String, dynamic>> login(String email, String password) =>
      _post('/auth/login', {'email': email, 'password': password});

  Future<Map<String, dynamic>> bootstrap() => _get('/bootstrap');

  Future<Map<String, dynamic>> todayRoute() => _get('/today-route');

  Future<Map<String, dynamic>> depart(String workOrderId) =>
      _post('/work-orders/$workOrderId/depart');

  Future<Map<String, dynamic>> arrive(String workOrderId, double lat, double lng) =>
      _post('/work-orders/$workOrderId/arrive', {'lat': lat, 'lng': lng});

  Future<Map<String, dynamic>> qrScan(String workOrderId, String code) =>
      _post('/qr/scan', {'workOrderId': workOrderId, 'code': code});

  Future<Map<String, dynamic>> saveInspection(Map<String, dynamic> payload) =>
      _post('/inspections', payload);

  Future<Map<String, dynamic>> complete(String workOrderId) =>
      _post('/work-orders/$workOrderId/complete');

  Future<Map<String, dynamic>> sync(List<Map<String, dynamic>> events) =>
      _post('/sync', {'events': events});
}
