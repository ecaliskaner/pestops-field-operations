// Data models mirroring the Supabase schema (supabase/migrations/
// 20260905000001_core_schema.sql), read through the embedded-select shape
// SupabaseService's queries produce — snake_case column names, with `site`
// and `customer` nested via foreign-key embedding rather than the old REST
// API's hand-built JSON.

class Technician {
  final String id, name, email, phone, avatar, title;
  Technician({
    required this.id,
    required this.name,
    required this.email,
    required this.phone,
    required this.avatar,
    required this.title,
  });
  factory Technician.fromJson(Map<String, dynamic> j) => Technician(
        id: j['id'] ?? '',
        name: j['full_name'] ?? '',
        email: j['email'] ?? '',
        phone: j['phone'] ?? '',
        avatar: j['initials'] ?? '',
        // The schema has no per-technician title column (that lives on
        // profiles.title, one hop away); left blank rather than joined for —
        // no screen currently renders it, so the extra query isn't worth it.
        title: j['title'] ?? '',
      );
}

class Station {
  final String id, code, type, qrToken;
  Station({required this.id, required this.code, required this.type, required this.qrToken});
  factory Station.fromJson(Map<String, dynamic> j) => Station(
        id: j['id'] ?? '',
        code: j['code'] ?? '',
        type: j['type'] ?? '',
        qrToken: j['qr_token'] ?? '',
      );
}

class Site {
  final String id, company, name, city, sector, address;
  final double lat, lng;
  final int geofenceRadiusM;
  final String contactName, contactPhone;
  final List<Station> stations;
  Site({
    required this.id,
    required this.company,
    required this.name,
    required this.city,
    required this.sector,
    required this.address,
    required this.lat,
    required this.lng,
    required this.geofenceRadiusM,
    required this.contactName,
    required this.contactPhone,
    required this.stations,
  });
  factory Site.fromJson(Map<String, dynamic> j) => Site(
        id: j['id'] ?? '',
        // customer is a foreign-key embed (sites.customer_id -> customers.id);
        // PostgREST nests it as a single object under the relation name.
        company: (j['customer']?['name']) ?? '',
        name: j['name'] ?? '',
        city: j['city'] ?? '',
        sector: j['sector'] ?? '',
        address: j['address'] ?? '',
        lat: (j['lat'] ?? 0).toDouble(),
        lng: (j['lng'] ?? 0).toDouble(),
        geofenceRadiusM: (j['geofence_radius_m'] ?? 150).toInt(),
        contactName: j['contact_name'] ?? '',
        contactPhone: j['contact_phone'] ?? '',
        stations: ((j['stations'] as List?) ?? [])
            .map((e) => Station.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class InspectionSummary {
  final String stationCode, status, pestType;
  final int activityCount;
  InspectionSummary({
    required this.stationCode,
    required this.status,
    required this.pestType,
    required this.activityCount,
  });
  factory InspectionSummary.fromJson(Map<String, dynamic> j) => InspectionSummary(
        stationCode: j['station_code'] ?? '',
        status: j['status'] ?? '',
        pestType: j['pest_type'] ?? 'none',
        activityCount: (j['activity_count'] ?? 0).toInt(),
      );
}

class WorkOrder {
  final String id, title, priority, visitType, dueAt, description;
  String status;
  String? arrivedGpsAt, realWorkStartedAt, completedAt;
  final Site site;
  List<InspectionSummary> inspections;

  WorkOrder({
    required this.id,
    required this.title,
    required this.priority,
    required this.visitType,
    required this.dueAt,
    required this.description,
    required this.status,
    required this.site,
    required this.inspections,
    this.arrivedGpsAt,
    this.realWorkStartedAt,
    this.completedAt,
  });

  factory WorkOrder.fromJson(Map<String, dynamic> j) => WorkOrder(
        id: j['id'] ?? '',
        title: j['title'] ?? '',
        priority: j['priority'] ?? 'normal',
        visitType: j['visit_type'] ?? '',
        dueAt: j['due_at'] ?? '',
        description: j['description'] ?? '',
        status: j['status'] ?? 'scheduled',
        arrivedGpsAt: j['arrived_gps_at'],
        realWorkStartedAt: j['real_work_started_at'],
        completedAt: j['completed_at'],
        site: Site.fromJson((j['site'] as Map<String, dynamic>?) ?? {}),
        inspections: ((j['inspections'] as List?) ?? [])
            .map((e) => InspectionSummary.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  bool get arrived => arrivedGpsAt != null;
  bool get started => realWorkStartedAt != null;
  bool get completed => completedAt != null;

  /// The three-stage lifecycle the tech-doc (§7) insists the app must show.
  String get stageLabel {
    if (completed) return 'Tamamlandı';
    if (started) return 'Gerçek başladı';
    if (arrived) return 'Tesise varıldı';
    return 'Planlandı';
  }
}
