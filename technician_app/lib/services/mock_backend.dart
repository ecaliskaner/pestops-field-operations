import '../models/models.dart';

/// Bundled copy of api/mobileData.js, used only when the real /api/mobile
/// backend can't be reached (e.g. this build is running as a static demo
/// with no server behind it, such as the GitHub Pages build). Lets the demo
/// logins still work end-to-end — AppState treats a mock login exactly like
/// a normal offline session, so every later action (GPS arrival, QR scan,
/// station form, sync queue) already goes through the existing offline path.
class MockBackend {
  static const demoPasswordHint = '1234';

  static final List<Map<String, dynamic>> _technicians = [
    {'id': 'tech-ayse', 'name': 'Ayşe Demir', 'email': 'ayse@ladybug.com', 'phone': '+90 532 000 0001', 'avatar': 'AD', 'title': 'Baş Teknisyen'},
    {'id': 'tech-mert', 'name': 'Mert Kaya', 'email': 'mert@ladybug.com', 'phone': '+90 532 000 0002', 'avatar': 'MK', 'title': 'Saha Teknisyeni'},
    {'id': 'tech-ece', 'name': 'Ece Yılmaz', 'email': 'ece@ladybug.com', 'phone': '+90 532 000 0003', 'avatar': 'EY', 'title': 'Saha Teknisyeni'},
    {'id': 'tech-can', 'name': 'Can Öztürk', 'email': 'can@ladybug.com', 'phone': '+90 532 000 0004', 'avatar': 'CÖ', 'title': 'Saha Teknisyeni'},
  ];

  static final Map<String, Map<String, dynamic>> _sites = {
    's1': {
      'id': 's1', 'company': 'Acme Foods', 'name': 'Gebze Üretim Tesisi', 'city': 'Kocaeli',
      'sector': 'Gıda Üretimi & Depolama', 'address': 'Gebze OSB, 41400 Gebze/Kocaeli',
      'lat': 40.8021, 'lng': 29.4307, 'geofenceRadiusM': 150,
      'contact': {'name': 'Ahmet Yılmaz', 'phone': '+90 532 123 4567'},
      'stations': [
        {'code': 'R-01', 'type': 'rodent', 'pestType': 'rodent'},
        {'code': 'R-02', 'type': 'rodent', 'pestType': 'rodent'},
        {'code': 'R-03', 'type': 'rodent', 'pestType': 'rodent'},
        {'code': 'C-01', 'type': 'crawler', 'pestType': 'crawler'},
        {'code': 'C-02', 'type': 'crawler', 'pestType': 'crawler'},
        {'code': 'F-01', 'type': 'flying', 'pestType': 'flying'},
        {'code': 'ILT-01', 'type': 'insect_light_trap', 'pestType': 'flying'},
        {'code': 'ILT-02', 'type': 'insect_light_trap', 'pestType': 'flying'},
      ],
    },
    's2': {
      'id': 's2', 'company': 'Kuzey Lojistik', 'name': 'Hadımköy Dağıtım Merkezi', 'city': 'İstanbul',
      'sector': 'Lojistik & Depolama', 'address': 'Hadımköy, 34555 Arnavutköy/İstanbul',
      'lat': 41.1372, 'lng': 28.6792, 'geofenceRadiusM': 180,
      'contact': {'name': 'Banu Gök', 'phone': '+90 541 456 7890'},
      'stations': [
        {'code': 'R-01', 'type': 'rodent', 'pestType': 'rodent'},
        {'code': 'R-02', 'type': 'rodent', 'pestType': 'rodent'},
        {'code': 'R-03', 'type': 'rodent', 'pestType': 'rodent'},
        {'code': 'R-04', 'type': 'rodent', 'pestType': 'rodent'},
        {'code': 'C-01', 'type': 'crawler', 'pestType': 'crawler'},
        {'code': 'C-02', 'type': 'crawler', 'pestType': 'crawler'},
        {'code': 'F-01', 'type': 'flying', 'pestType': 'flying'},
      ],
    },
    's3': {
      'id': 's3', 'company': 'Aster Hospital', 'name': 'Ataşehir Kampüsü', 'city': 'İstanbul',
      'sector': 'Sağlık & Hastane', 'address': 'Ataşehir, 34758 İstanbul',
      'lat': 40.9923, 'lng': 29.1277, 'geofenceRadiusM': 120,
      'contact': {'name': 'Dr. Selim Tekin', 'phone': '+90 533 987 6543'},
      'stations': [
        {'code': 'R-01', 'type': 'rodent', 'pestType': 'rodent'},
        {'code': 'R-02', 'type': 'rodent', 'pestType': 'rodent'},
        {'code': 'R-03', 'type': 'rodent', 'pestType': 'rodent'},
        {'code': 'C-01', 'type': 'crawler', 'pestType': 'crawler'},
        {'code': 'C-02', 'type': 'crawler', 'pestType': 'crawler'},
        {'code': 'ILT-01', 'type': 'insect_light_trap', 'pestType': 'flying'},
      ],
    },
    's4': {
      'id': 's4', 'company': 'Bora Retail', 'name': 'Levent Merkez Mağaza', 'city': 'İstanbul',
      'sector': 'Perakende & Mağazacılık', 'address': 'Levent, 34330 Beşiktaş/İstanbul',
      'lat': 41.0812, 'lng': 29.0101, 'geofenceRadiusM': 100,
      'contact': {'name': 'Mustafa Çelik', 'phone': '+90 535 765 4321'},
      'stations': [
        {'code': 'R-01', 'type': 'rodent', 'pestType': 'rodent'},
        {'code': 'R-02', 'type': 'rodent', 'pestType': 'rodent'},
        {'code': 'C-01', 'type': 'crawler', 'pestType': 'crawler'},
        {'code': 'C-02', 'type': 'crawler', 'pestType': 'crawler'},
        {'code': 'F-01', 'type': 'flying', 'pestType': 'flying'},
      ],
    },
    's5': {
      'id': 's5', 'company': 'Novatek', 'name': 'Çayırova Ar-Ge Merkezi', 'city': 'Kocaeli',
      'sector': 'Ar-Ge & Laboratuvar', 'address': 'Çayırova, 41420 Kocaeli',
      'lat': 40.8252, 'lng': 29.3761, 'geofenceRadiusM': 150,
      'contact': {'name': 'Eren Demir', 'phone': '+90 530 234 5678'},
      'stations': [
        {'code': 'R-01', 'type': 'rodent', 'pestType': 'rodent'},
        {'code': 'R-02', 'type': 'rodent', 'pestType': 'rodent'},
        {'code': 'R-03', 'type': 'rodent', 'pestType': 'rodent'},
        {'code': 'C-01', 'type': 'crawler', 'pestType': 'crawler'},
        {'code': 'C-02', 'type': 'crawler', 'pestType': 'crawler'},
        {'code': 'ILT-01', 'type': 'insect_light_trap', 'pestType': 'flying'},
      ],
    },
    's6': {
      'id': 's6', 'company': 'Orion Hotels', 'name': 'Taksim Otel', 'city': 'İstanbul',
      'sector': 'Turizm & Otelcilik', 'address': 'Taksim, 34437 Beyoğlu/İstanbul',
      'lat': 41.0369, 'lng': 28.9851, 'geofenceRadiusM': 100,
      'contact': {'name': 'Selin Şen', 'phone': '+90 542 345 6789'},
      'stations': [
        {'code': 'R-01', 'type': 'rodent', 'pestType': 'rodent'},
        {'code': 'R-02', 'type': 'rodent', 'pestType': 'rodent'},
        {'code': 'R-03', 'type': 'rodent', 'pestType': 'rodent'},
        {'code': 'C-01', 'type': 'crawler', 'pestType': 'crawler'},
        {'code': 'C-02', 'type': 'crawler', 'pestType': 'crawler'},
        {'code': 'ILT-01', 'type': 'insect_light_trap', 'pestType': 'flying'},
      ],
    },
  };

  static final List<Map<String, dynamic>> _workOrders = [
    {'id': 'WO-2048', 'siteId': 's1', 'techEmail': 'ayse@ladybug.com', 'title': 'Kemirgen aktivitesi — acil inceleme', 'priority': 'critical', 'visitType': 'AC', 'dueAt': '14:30',
      'description': 'R-01 yem istasyonunda yüksek kemirgen aktivitesi tespit edildi. Alanın incelenmesi ve aksiyon planının kayıt altına alınması gerekiyor.'},
    {'id': 'WO-2049', 'siteId': 's5', 'techEmail': 'ayse@ladybug.com', 'title': 'Periyodik saha servisi', 'priority': 'medium', 'visitType': 'RZ', 'dueAt': '17:00',
      'description': 'Aylık sözleşme kapsamındaki rutin saha servisi ve dijital istasyon denetimi.'},
    {'id': 'WO-2047', 'siteId': 's2', 'techEmail': 'mert@ladybug.com', 'title': 'Yükleme alanı istasyon kontrolü', 'priority': 'critical', 'visitType': 'RZ', 'dueAt': '16:00',
      'description': 'Yükleme rampası çevresindeki istasyonlar için kontrol ve yenileme servisi planlandı.'},
    {'id': 'WO-2045', 'siteId': 's3', 'techEmail': 'ece@ladybug.com', 'title': 'Periyodik saha servisi', 'priority': 'high', 'visitType': 'RZ', 'dueAt': '09:00',
      'description': 'Aylık sözleşme kapsamındaki rutin saha servisi ve dijital istasyon denetimi.'},
    {'id': 'WO-2044', 'siteId': 's6', 'techEmail': 'ece@ladybug.com', 'title': 'Mutfak & depo jel uygulaması', 'priority': 'medium', 'visitType': 'RZ', 'dueAt': '13:30',
      'description': 'Mutfak ve depo alanlarında yürüyen haşere jel uygulaması ve UV cihaz denetimi.'},
    {'id': 'WO-2042', 'siteId': 's4', 'techEmail': 'can@ladybug.com', 'title': 'Müşteri talebi — uçan haşere', 'priority': 'high', 'visitType': 'ES', 'dueAt': '11:00',
      'description': 'Müşteri tarafından bildirilen uçan haşere aktivitesinin yerinde kontrolü.'},
  ];

  static String qrTokenFor(String siteId, String code) => 'RPL-$siteId-$code';

  /// Mirrors the real /auth/login rule: known email (case/whitespace
  /// insensitive) + any non-empty password.
  static Technician? findTechnician(String email, String password) {
    if (password.trim().isEmpty) return null;
    final normalized = email.trim().toLowerCase();
    for (final t in _technicians) {
      if (t['email'] == normalized) return Technician.fromJson(t);
    }
    return null;
  }

  static Map<String, dynamic> _serializeWorkOrder(Map<String, dynamic> wo) {
    final site = _sites[wo['siteId']]!;
    return {
      'id': wo['id'],
      'title': wo['title'],
      'priority': wo['priority'],
      'visitType': wo['visitType'],
      'dueAt': wo['dueAt'],
      'description': wo['description'],
      'status': 'scheduled',
      'site': {
        ...site,
        'stations': (site['stations'] as List).map((s) => {
              ...s as Map<String, dynamic>,
              'qrToken': qrTokenFor(site['id'] as String, s['code'] as String),
            }).toList(),
      },
      'inspections': <Map<String, dynamic>>[],
    };
  }

  /// Today's route for a technician, in the exact JSON shape AppState/
  /// WorkOrder.fromJson already expect from the real API.
  static List<WorkOrder> routeFor(String email) {
    final normalized = email.trim().toLowerCase();
    return _workOrders
        .where((w) => w['techEmail'] == normalized)
        .map((w) => WorkOrder.fromJson(_serializeWorkOrder(w)))
        .toList();
  }
}
