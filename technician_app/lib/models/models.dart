// Data models mirroring the /api/mobile serialization (api/mobileApi.js).

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
        name: j['name'] ?? '',
        email: j['email'] ?? '',
        phone: j['phone'] ?? '',
        avatar: j['avatar'] ?? '',
        title: j['title'] ?? '',
      );
  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'email': email,
        'phone': phone,
        'avatar': avatar,
        'title': title,
      };
}

class Station {
  final String code, type, pestType, qrToken;
  Station({required this.code, required this.type, required this.pestType, required this.qrToken});
  factory Station.fromJson(Map<String, dynamic> j) => Station(
        code: j['code'] ?? '',
        type: j['type'] ?? '',
        pestType: j['pestType'] ?? 'none',
        qrToken: j['qrToken'] ?? '',
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
        company: j['company'] ?? '',
        name: j['name'] ?? '',
        city: j['city'] ?? '',
        sector: j['sector'] ?? '',
        address: j['address'] ?? '',
        lat: (j['lat'] ?? 0).toDouble(),
        lng: (j['lng'] ?? 0).toDouble(),
        geofenceRadiusM: (j['geofenceRadiusM'] ?? 150).toInt(),
        contactName: (j['contact']?['name']) ?? '',
        contactPhone: (j['contact']?['phone']) ?? '',
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
        stationCode: j['stationCode'] ?? '',
        status: j['status'] ?? '',
        pestType: j['pestType'] ?? 'none',
        activityCount: (j['activityCount'] ?? 0).toInt(),
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
        priority: j['priority'] ?? 'medium',
        visitType: j['visitType'] ?? '',
        dueAt: j['dueAt'] ?? '',
        description: j['description'] ?? '',
        status: j['status'] ?? 'scheduled',
        arrivedGpsAt: j['arrivedGpsAt'],
        realWorkStartedAt: j['realWorkStartedAt'],
        completedAt: j['completedAt'],
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
