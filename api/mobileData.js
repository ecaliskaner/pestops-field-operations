// Technician-relevant slice of the demo seed, as a CommonJS module the Node
// API can serve directly. Mirrors src/data/seed.js but adds the fields a real
// mobile client needs and the web demo never did: facility geo-coordinates,
// a geofence radius, per-station QR tokens, and technician login emails.
//
// This is the single source of truth for the mobile REST API. It is read-only;
// mutable run-time state (work-order status, inspections, QR/GPS logs) lives in
// api/mobileApi.js and is initialised from here on boot / reset.

'use strict';

// Demo technician directory. Passwords are intentionally trivial — this is a
// pitch demo, not a production auth system. Any known email + the shared demo
// password (or any non-empty password) logs in.
const technicians = [
  { id: 'tech-ayse', name: 'Ayşe Demir',  email: 'ayse@ladybug.com', phone: '+90 532 000 0001', avatar: 'AD', title: 'Baş Teknisyen' },
  { id: 'tech-mert', name: 'Mert Kaya',   email: 'mert@ladybug.com', phone: '+90 532 000 0002', avatar: 'MK', title: 'Saha Teknisyeni' },
  { id: 'tech-ece',  name: 'Ece Yılmaz',  email: 'ece@ladybug.com',  phone: '+90 532 000 0003', avatar: 'EY', title: 'Saha Teknisyeni' },
  { id: 'tech-can',  name: 'Can Öztürk',  email: 'can@ladybug.com',  phone: '+90 532 000 0004', avatar: 'CÖ', title: 'Saha Teknisyeni' },
];

const DEMO_PASSWORD = '1234';

// Facilities. Coordinates are real approximate locations for the named
// districts so the geofence/GPS logic has something plausible to compute
// against. geofenceRadiusM matches the tech-doc default (150 m).
//
// These lat/lng MUST stay in sync with SITE_GEO in src/views/team.js — the ops
// dashboard draws its geofence circles from that table and now plots real
// technician GPS on the same map, so any drift makes a phone that is genuinely
// inside the fence render outside the drawn circle.
const sites = [
  {
    id: 's1', company: 'Acme Foods', name: 'Gebze Üretim Tesisi', city: 'Kocaeli',
    sector: 'Gıda Üretimi & Depolama', address: 'Gebze OSB, 41400 Gebze/Kocaeli',
    lat: 40.8021, lng: 29.4307, geofenceRadiusM: 150,
    contact: { name: 'Ahmet Yılmaz', phone: '+90 532 123 4567' },
    stations: [
      { code: 'R-01',   type: 'rodent',            pestType: 'rodent' },
      { code: 'R-02',   type: 'rodent',            pestType: 'rodent' },
      { code: 'R-03',   type: 'rodent',            pestType: 'rodent' },
      { code: 'C-01',   type: 'crawler',           pestType: 'crawler' },
      { code: 'C-02',   type: 'crawler',           pestType: 'crawler' },
      { code: 'F-01',   type: 'flying',            pestType: 'flying' },
      { code: 'ILT-01', type: 'insect_light_trap', pestType: 'flying' },
      { code: 'ILT-02', type: 'insect_light_trap', pestType: 'flying' },
    ],
  },
  {
    id: 's2', company: 'Kuzey Lojistik', name: 'Hadımköy Dağıtım Merkezi', city: 'İstanbul',
    sector: 'Lojistik & Depolama', address: 'Hadımköy, 34555 Arnavutköy/İstanbul',
    lat: 41.1372, lng: 28.6792, geofenceRadiusM: 180,
    contact: { name: 'Banu Gök', phone: '+90 541 456 7890' },
    stations: [
      { code: 'R-01', type: 'rodent',  pestType: 'rodent' },
      { code: 'R-02', type: 'rodent',  pestType: 'rodent' },
      { code: 'R-03', type: 'rodent',  pestType: 'rodent' },
      { code: 'R-04', type: 'rodent',  pestType: 'rodent' },
      { code: 'C-01', type: 'crawler', pestType: 'crawler' },
      { code: 'C-02', type: 'crawler', pestType: 'crawler' },
      { code: 'F-01', type: 'flying',  pestType: 'flying' },
    ],
  },
  {
    id: 's3', company: 'Aster Hospital', name: 'Ataşehir Kampüsü', city: 'İstanbul',
    sector: 'Sağlık & Hastane', address: 'Ataşehir, 34758 İstanbul',
    lat: 40.9923, lng: 29.1277, geofenceRadiusM: 120,
    contact: { name: 'Dr. Selim Tekin', phone: '+90 533 987 6543' },
    stations: [
      { code: 'R-01',   type: 'rodent',            pestType: 'rodent' },
      { code: 'R-02',   type: 'rodent',            pestType: 'rodent' },
      { code: 'R-03',   type: 'rodent',            pestType: 'rodent' },
      { code: 'C-01',   type: 'crawler',           pestType: 'crawler' },
      { code: 'C-02',   type: 'crawler',           pestType: 'crawler' },
      { code: 'ILT-01', type: 'insect_light_trap', pestType: 'flying' },
    ],
  },
  {
    id: 's4', company: 'Bora Retail', name: 'Levent Merkez Mağaza', city: 'İstanbul',
    sector: 'Perakende & Mağazacılık', address: 'Levent, 34330 Beşiktaş/İstanbul',
    lat: 41.0812, lng: 29.0101, geofenceRadiusM: 100,
    contact: { name: 'Mustafa Çelik', phone: '+90 535 765 4321' },
    stations: [
      { code: 'R-01', type: 'rodent',  pestType: 'rodent' },
      { code: 'R-02', type: 'rodent',  pestType: 'rodent' },
      { code: 'C-01', type: 'crawler', pestType: 'crawler' },
      { code: 'C-02', type: 'crawler', pestType: 'crawler' },
      { code: 'F-01', type: 'flying',  pestType: 'flying' },
    ],
  },
  {
    id: 's5', company: 'Novatek', name: 'Çayırova Ar-Ge Merkezi', city: 'Kocaeli',
    sector: 'Ar-Ge & Laboratuvar', address: 'Çayırova, 41420 Kocaeli',
    lat: 40.8252, lng: 29.3761, geofenceRadiusM: 150,
    contact: { name: 'Eren Demir', phone: '+90 530 234 5678' },
    stations: [
      { code: 'R-01',   type: 'rodent',            pestType: 'rodent' },
      { code: 'R-02',   type: 'rodent',            pestType: 'rodent' },
      { code: 'R-03',   type: 'rodent',            pestType: 'rodent' },
      { code: 'C-01',   type: 'crawler',           pestType: 'crawler' },
      { code: 'C-02',   type: 'crawler',           pestType: 'crawler' },
      { code: 'ILT-01', type: 'insect_light_trap', pestType: 'flying' },
    ],
  },
  {
    id: 's6', company: 'Orion Hotels', name: 'Taksim Otel', city: 'İstanbul',
    sector: 'Turizm & Otelcilik', address: 'Taksim, 34437 Beyoğlu/İstanbul',
    lat: 41.0369, lng: 28.9851, geofenceRadiusM: 100,
    contact: { name: 'Selin Şen', phone: '+90 542 345 6789' },
    stations: [
      { code: 'R-01',   type: 'rodent',            pestType: 'rodent' },
      { code: 'R-02',   type: 'rodent',            pestType: 'rodent' },
      { code: 'R-03',   type: 'rodent',            pestType: 'rodent' },
      { code: 'C-01',   type: 'crawler',           pestType: 'crawler' },
      { code: 'C-02',   type: 'crawler',           pestType: 'crawler' },
      { code: 'ILT-01', type: 'insect_light_trap', pestType: 'flying' },
    ],
  },
];

// Today's work orders. techEmail links each job to a login. status/timestamps
// are seeded fresh (scheduled) and mutated at run time by the API.
const workOrders = [
  { id: 'WO-2048', siteId: 's1', techEmail: 'ayse@ladybug.com', title: 'Kemirgen aktivitesi — acil inceleme',      priority: 'critical', visitType: 'AC', dueAt: '14:30',
    description: 'R-01 yem istasyonunda yüksek kemirgen aktivitesi tespit edildi. Alanın incelenmesi ve aksiyon planının kayıt altına alınması gerekiyor.' },
  { id: 'WO-2049', siteId: 's5', techEmail: 'ayse@ladybug.com', title: 'Periyodik saha servisi',                    priority: 'medium',   visitType: 'RZ', dueAt: '17:00',
    description: 'Aylık sözleşme kapsamındaki rutin saha servisi ve dijital istasyon denetimi.' },
  { id: 'WO-2047', siteId: 's2', techEmail: 'mert@ladybug.com', title: 'Yükleme alanı istasyon kontrolü',           priority: 'critical', visitType: 'RZ', dueAt: '16:00',
    description: 'Yükleme rampası çevresindeki istasyonlar için kontrol ve yenileme servisi planlandı.' },
  { id: 'WO-2045', siteId: 's3', techEmail: 'ece@ladybug.com',  title: 'Periyodik saha servisi',                    priority: 'high',     visitType: 'RZ', dueAt: '09:00',
    description: 'Aylık sözleşme kapsamındaki rutin saha servisi ve dijital istasyon denetimi.' },
  { id: 'WO-2044', siteId: 's6', techEmail: 'ece@ladybug.com',  title: 'Mutfak & depo jel uygulaması',              priority: 'medium',   visitType: 'RZ', dueAt: '13:30',
    description: 'Mutfak ve depo alanlarında yürüyen haşere jel uygulaması ve UV cihaz denetimi.' },
  { id: 'WO-2042', siteId: 's4', techEmail: 'can@ladybug.com',  title: 'Müşteri talebi — uçan haşere',              priority: 'high',     visitType: 'ES', dueAt: '11:00',
    description: 'Müşteri tarafından bildirilen uçan haşere aktivitesinin yerinde kontrolü.' },
];

// The station inspection form schema the mobile app renders (tech-doc §8.4).
const inspectionForm = {
  version: 1,
  statuses: [
    { value: 'clean',    label: 'Temiz' },
    { value: 'activity', label: 'Aktivite Var' },
    { value: 'damaged',  label: 'Hasarlı' },
    { value: 'missing',  label: 'Eksik' },
  ],
  pestTypes: [
    { value: 'none',    label: 'Yok' },
    { value: 'rodent',  label: 'Kemirgen' },
    { value: 'crawler', label: 'Yürüyen Haşere' },
    { value: 'flying',  label: 'Uçan Haşere' },
    { value: 'other',   label: 'Diğer' },
  ],
};

// The QR token printed on a station's physical label. Deterministic so the app
// can scan a real printed code or the tech can type the station code manually.
function qrTokenFor(siteId, code) {
  return `RPL-${siteId}-${code}`;
}

module.exports = { technicians, sites, workOrders, inspectionForm, DEMO_PASSWORD, qrTokenFor };
