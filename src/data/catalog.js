// Domain catalog: pest taxonomy, visit types, equipment, chemicals, labels.
// Extracted from app.js (Phase 0a-1).

// ===== UI LABEL MAPS =====
export const names = { dashboard:"Genel bakış", sites:"Tesisler", work:"İş emirleri", team:"Ekip & rota", customerHome:"Genel Durum", visitReports:"Ziyaret Raporları", insights:"Analizler", reports:"Raporlar", companyDetail:"Tesis Detayı & Profil", mobileSim:"Mobil Uygulama", inventory:"Stok & Envanter", finance:"Finans & Fatura" };
export const stateLabel = {risk:"Riskli",watch:"İzlenmeli",healthy:"Sağlıklı"};

// ===== PEST TAXONOMY DATABASE =====
export const pestDatabase = {
  rodent: [
    { code: 'F', name: 'Fare', en: 'Mouse', sci: 'Mus musculus' },
    { code: 'S', name: 'Sıçan', en: 'Rat', sci: 'Rattus spp.' },
    { code: '0', name: 'Aktivite Yok', en: 'No Activity', sci: '' }
  ],
  crawling: [
    { code: 'ALH', name: 'Alman Hamamböceği', en: 'German Cockroach', sci: 'Blattella germanica' },
    { code: 'DOH', name: 'Doğu Hamamböceği', en: 'Oriental Cockroach', sci: 'Blatta orientalis' },
    { code: 'AMH', name: 'Amerikan Hamamböceği', en: 'American Cockroach', sci: 'Periplaneta americana' },
    { code: 'K', name: 'Kınkanatlı', en: 'Ground Beetle', sci: 'Carabidae spp.' },
    { code: 'D', name: 'Diğer Yürüyen', en: 'Other Crawling', sci: '' },
    { code: '0', name: 'Aktivite Yok', en: 'No Activity', sci: '' }
  ],
  flying: [
    { code: 'KS', name: 'Karasinek', en: 'House Fly', sci: 'Musca domestica' },
    { code: 'SS', name: 'Sivrisinek', en: 'Mosquito', sci: 'Culicidae spp.' },
    { code: 'MS', name: 'Meyve Sineği', en: 'Fruit Fly', sci: 'Drosophila spp.' },
    { code: 'KMS', name: 'Kambur Sineği', en: 'Humpback Fly', sci: 'Phoridae spp.' },
    { code: 'KUS', name: 'Küçük Sinek', en: 'Small Flies', sci: 'Diptera spp.' },
    { code: 'ARI', name: 'Arı', en: 'Wasp', sci: 'Vespidae spp.' },
    { code: 'KEL', name: 'Kelebek (Güve)', en: 'Moth', sci: 'Lepidoptera spp.' },
    { code: 'D', name: 'Diğer Uçan', en: 'Other Flying', sci: '' },
    { code: '0', name: 'Aktivite Yok', en: 'No Activity', sci: '' }
  ],
  // `sub` splits the stored-product list the way the roadmap does: moth traps
  // and beetle ("bit") traps each carry their own species sheet.
  storedProduct: [
    { code: 'KMG', name: 'Kuru Meyve Güvesi', en: 'Indian Meal Moth', sci: 'Plodia interpunctella', sub: 'moth' },
    { code: 'DG', name: 'Değirmen Güvesi', en: 'Mediterranean Flour Moth', sci: 'Ephestia kuehniella', sub: 'moth' },
    { code: 'AG', name: 'Arpa Güvesi', en: 'Angoumois Grain Moth', sci: 'Sitotroga cerealella', sub: 'moth' },
    { code: 'UG', name: 'Un Güvesi', en: 'Meal Moth', sci: 'Pyralis farinalis', sub: 'moth' },
    { code: 'TG', name: 'Tütün Güvesi', en: 'Tobacco Moth', sci: 'Ephestia elutella', sub: 'moth' },
    { code: 'IK', name: 'İncir Kurdu', en: 'Almond Moth', sci: 'Ephestia cautella', sub: 'moth' },
    { code: 'KIG', name: 'Kuru İncir Güvesi', en: 'Fig Moth', sci: 'Ephestia figuliella', sub: 'moth' },
    { code: 'PG', name: 'Patates Güvesi', en: 'Potato Tuber Moth', sci: 'Phthorimaea operculella', sub: 'moth' },
    { code: 'UKB', name: 'Un / Kırma Biti', en: 'Flour Beetle', sci: 'Tribolium spp.', sub: 'beetle' },
    { code: 'BMP', name: 'Buğday/Mısır/Pirinç Biti', en: 'Grain Weevil', sci: 'Sitophilus spp.', sub: 'beetle' },
    { code: 'TB', name: 'Testereli Böcek', en: 'Saw-toothed Grain Beetle', sci: 'Oryzaephilus spp.', sub: 'beetle' },
    { code: 'TK', name: 'Tatlı Kurt', en: 'Cigarette Beetle', sci: 'Lasioderma spp.', sub: 'beetle' },
    { code: 'THB', name: 'Tohum Böcekleri', en: 'Bean Weevil', sci: 'Bruchus spp.', sub: 'beetle' },
    { code: 'EKB', name: 'Ekşilik Böcekleri', en: 'Sap Beetle', sci: 'Carpophilus spp.', sub: 'beetle' },
    { code: 'DRB', name: 'Deri Böcekleri', en: 'Hide Beetle', sci: 'Dermestidae spp.', sub: 'beetle' },
    { code: 'HLB', name: 'Halı Böcekleri', en: 'Carpet Beetle', sci: 'Anthrenus spp.', sub: 'beetle' },
    { code: 'D', name: 'Diğer Depo Zararlısı', en: 'Other Stored Product', sci: '', sub: 'both' },
    { code: '0', name: 'Aktivite Yok', en: 'No Activity', sci: '', sub: 'both' }
  ]
};

// Which species sheet a device offers, keyed by equipment type. A fly unit must
// not offer "Fare"; a moth trap must not offer the beetle list. Legacy type keys
// (`rodent`, `crawler`, `flying`, `insect_light_trap`) are mapped alongside the
// roadmap's own names so existing seeded stations resolve too.
const PEST_GROUPS_BY_EQUIPMENT = {
  rodent_bait:        [{ group: 'rodent' }, { group: 'crawling' }],
  rodent:             [{ group: 'rodent' }, { group: 'crawling' }],
  catch_alive_trap:   [{ group: 'rodent' }],
  insect_detector:    [{ group: 'crawling' }, { group: 'storedProduct', sub: 'beetle' }],
  crawler:            [{ group: 'crawling' }, { group: 'storedProduct', sub: 'beetle' }],
  flying_insect_trap: [{ group: 'flying' }],
  flying:             [{ group: 'flying' }],
  insect_light_trap:  [{ group: 'flying' }],
  sp_moth_trap:       [{ group: 'storedProduct', sub: 'moth' }],
  sp_insect_trap:     [{ group: 'storedProduct', sub: 'beetle' }]
};

// Returns the pest species a given equipment type can record, de-duplicated by
// code and with "Aktivite Yok" removed — multi-finding entry expresses "no
// activity" as an empty findings list instead of a sentinel row.
export function pestsForEquipment(type) {
  const groups = PEST_GROUPS_BY_EQUIPMENT[type] || [{ group: 'rodent' }, { group: 'crawling' }, { group: 'flying' }, { group: 'storedProduct' }];
  const seen = new Set();
  const out = [];
  groups.forEach(({ group, sub }) => {
    (pestDatabase[group] || []).forEach(p => {
      if (p.code === '0') return;
      if (sub && p.sub && p.sub !== sub && p.sub !== 'both') return;
      const key = `${group}:${p.code}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(p);
    });
  });
  return out;
}

// Seeded stations (and the pre-Phase-1 inspection forms) store pest types as
// English slugs rather than taxonomy codes. Map them onto real codes so a
// legacy reading still resolves to a species when it is re-opened for editing
// — otherwise the row renders blank and the finding is silently lost on save.
const LEGACY_PEST_CODES = {
  mouse: 'F', rat: 'S',
  cockroach: 'ALH', german_cockroach: 'ALH', oriental_cockroach: 'DOH', american_cockroach: 'AMH',
  ground_beetle: 'K', other_crawling: 'D',
  fly: 'KS', house_fly: 'KS', mosquito: 'SS', fruit_fly: 'MS', humpback_fly: 'KMS',
  small_flies: 'KUS', wasp: 'ARI',
  indian_meal_moth: 'KMG', flour_moth: 'DG', grain_moth: 'AG',
  flour_beetle: 'UKB', grain_weevil: 'BMP', cigarette_beetle: 'TK',
  other: 'D', none: ''
};

export function normalizePestCode(code) {
  if (!code) return '';
  if (pestNameByCode[code]) return code;
  return LEGACY_PEST_CODES[code] || '';
}

// Flat code → display name map, used wherever a stored finding code has to be
// rendered back as text.
export const pestNameByCode = (() => {
  const map = {};
  Object.values(pestDatabase).forEach(list => list.forEach(p => { map[p.code] = p.name; }));
  return map;
})();

// ===== VISIT TYPES =====
export const visitTypes = [
  { code: 'RZ', name: 'Rutin Ziyaret', en: 'Routine Visit' },
  { code: 'TZ', name: 'Takip Ziyareti', en: 'Follow-up Visit' },
  { code: 'AC', name: 'Acil Çağrı', en: 'Call-out' },
  { code: 'IZ', name: 'İlaçlama Ziyareti', en: 'Pesticide Application' },
  { code: 'ILK', name: 'İlk Ziyaret', en: 'First Visit' },
  { code: 'ES', name: 'Ek Servis', en: 'Extra Visit' },
  { code: '3G', name: '3. Göz Denetim', en: 'Third Eye Audit' },
  { code: 'DZ', name: 'Dezenfeksiyon', en: 'Disinfection' }
];

// ===== EXPANDED EQUIPMENT TYPES =====
export const equipmentTypes = {
  rodent_bait: { name: 'Kemirgen Yem İstasyonu', en: 'Rodent Bait Box', icon: '🪤', prefix: 'R' },
  insect_detector: { name: 'Böcek Dedektörü', en: 'Insect Detector', icon: '🔍', prefix: 'BD' },
  flying_insect_trap: { name: 'Sinek Yakalama Cihazı', en: 'Flying Insect Trap', icon: '💡', prefix: 'F' },
  sp_insect_trap: { name: 'DZ Bit Tuzağı', en: 'S.P. Insect Trap', icon: '📌', prefix: 'DZB' },
  catch_alive_trap: { name: 'Canlı Kapan', en: 'Catch Alive Trap', icon: '🏠', prefix: 'CK' },
  sp_moth_trap: { name: 'DZ Güve Tuzağı', en: 'S.P. Moth Trap', icon: '🦋', prefix: 'DZG' },
  // Legacy types mapped to new system
  rodent: { name: 'Kemirgen Yem İstasyonu', en: 'Rodent Bait Box', icon: '🪤', prefix: 'R' },
  crawler: { name: 'Yürüyen Haşere Monitörü', en: 'Insect Detector', icon: '🔍', prefix: 'C' },
  flying: { name: 'Uçan Haşere Cihazı', en: 'Flying Insect Trap', icon: '💡', prefix: 'F' },
  insect_light_trap: { name: 'UV Işıklı Cihaz (ILT)', en: 'Insect Light Trap', icon: '💡', prefix: 'ILT' }
};

// ===== PER-EQUIPMENT PLACEMENT SCHEMAS =====
// The roadmap defines a different placement ("yerleşim listesi") sheet per
// device family: bait boxes carry only the base fields, fly units add tube and
// power specs, and moth / beetle traps add trap type and pheromone period.
// Every schema starts from BASE_PLACEMENT_FIELDS so the map, barcode and point
// number stay common across all device types.
const BASE_PLACEMENT_FIELDS = [
  { key: 'areaName', label: 'Bölge Adı', en: 'Name of Area', type: 'text', placeholder: 'Örn: Hammadde Deposu' },
  { key: 'pointNo', label: 'Sayı / Nokta No', en: 'Number', type: 'text', placeholder: 'Örn: 34' },
  { key: 'installType', label: 'Montaj Türü', en: 'Installation Type', type: 'select', options: ['Duvar', 'Tavan', 'Zemin', 'Askılı', 'Serbest'] },
  { key: 'purchaseDate', label: 'Alınış Tarihi', en: 'Date of Purchase', type: 'date' }
];

export const placementSchemas = {
  // Fly units — roadmap §4, "Sinek cihazları tanımlamaları"
  flying_insect_trap: {
    title: 'Sinek Cihazı Yerleşim Kaydı',
    fields: [
      ...BASE_PLACEMENT_FIELDS.slice(0, 2),
      { key: 'unitType', label: 'Ünite Türü', en: 'Type of Unit', type: 'select', options: ['Yapışkanlı (Glue Board)', 'Elektrikli Izgara', 'Kombine', 'Dekoratif'] },
      BASE_PLACEMENT_FIELDS[2],
      { key: 'tubeLength', label: 'Floresan Uzunluğu', en: 'Tube Length', type: 'select', options: ['15 W / 45 cm', '18 W / 60 cm', '36 W / 120 cm'] },
      { key: 'unitPower', label: 'Cihaz Gücü', en: 'Power of Unit', type: 'select', options: ['15 W', '20 W', '30 W', '40 W', '80 W'] },
      { key: 'uvTubeType', label: 'UV Tüp Cinsi', en: 'Type of UV Tubes', type: 'select', options: ['Shatterproof (Kırılmaz)', 'Standart UV-A', 'Kaplamalı'] },
      { key: 'purchaseDate', label: 'Cihaz Alınış Tarihi', en: 'FIT. Date of Purchase', type: 'date' },
      { key: 'tubeChangeDate', label: 'Floresan Değişim Tarihi', en: 'Change of Tubes Date', type: 'date' }
    ]
  },
  // Moth traps — roadmap §4, "Güve tuzaklarında"
  sp_moth_trap: {
    title: 'Güve Tuzağı Yerleşim Kaydı',
    fields: [
      ...BASE_PLACEMENT_FIELDS.slice(0, 2),
      { key: 'monitorType', label: 'İzleme Aparatı Türü', en: 'Type of Monitor', type: 'select', options: ['Feromonlu Delta Tuzak', 'Feromonlu Huni Tuzak', 'Yapışkanlı Levha'] },
      BASE_PLACEMENT_FIELDS[2],
      { key: 'trapType', label: 'Tuzak Tipi', en: 'Trap Type', type: 'select', options: ['Delta', 'Huni (Funnel)', 'Kanatlı (Wing)', 'Levha'] },
      { key: 'purchaseDate', label: 'Tuzak Alınış Tarihi', en: 'Trap Date of Purchase', type: 'date' },
      { key: 'pheromonePeriod', label: 'Feromon Değişim Periyodu', en: 'Change of Pheromone Period', type: 'select', options: ['4 hafta', '6 hafta', '8 hafta', '12 hafta'] },
      { key: 'other', label: 'Diğer', en: 'Other', type: 'text', placeholder: 'Ek not' }
    ]
  },
  // Beetle ("bit") traps use the same sheet as moth traps per the roadmap.
  sp_insect_trap: {
    title: 'Bit Tuzağı Yerleşim Kaydı',
    fields: [
      ...BASE_PLACEMENT_FIELDS.slice(0, 2),
      { key: 'monitorType', label: 'İzleme Aparatı Türü', en: 'Type of Monitor', type: 'select', options: ['Feromonlu Çukur Tuzak', 'Yapışkanlı Levha', 'Gıda Cezbedicili Tuzak'] },
      BASE_PLACEMENT_FIELDS[2],
      { key: 'trapType', label: 'Tuzak Tipi', en: 'Trap Type', type: 'select', options: ['Çukur (Pitfall)', 'Delta', 'Levha'] },
      { key: 'purchaseDate', label: 'Tuzak Alınış Tarihi', en: 'Trap Date of Purchase', type: 'date' },
      { key: 'pheromonePeriod', label: 'Feromon Değişim Periyodu', en: 'Change of Pheromone Period', type: 'select', options: ['4 hafta', '6 hafta', '8 hafta', '12 hafta'] },
      { key: 'other', label: 'Diğer', en: 'Other', type: 'text', placeholder: 'Ek not' }
    ]
  },
  // Base sheet — bait boxes, detectors, live catch traps.
  _default: {
    title: 'Ekipman Yerleşim Kaydı',
    fields: [
      ...BASE_PLACEMENT_FIELDS,
      { key: 'other', label: 'Diğer', en: 'Other', type: 'text', placeholder: 'Ek not' }
    ]
  }
};

// Legacy seeded station types resolve onto the roadmap's schemas.
const PLACEMENT_SCHEMA_ALIASES = {
  flying: 'flying_insect_trap',
  insect_light_trap: 'flying_insect_trap',
  rodent: '_default',
  crawler: '_default',
  rodent_bait: '_default',
  insect_detector: '_default',
  catch_alive_trap: '_default'
};

export function getPlacementSchema(type) {
  const key = PLACEMENT_SCHEMA_ALIASES[type] || type;
  return placementSchemas[key] || placementSchemas._default;
}

// Which zone of the floor plan a station's percentage coordinates fall in. Pure
// geometry over the demo plan, used as the fallback "Bölge Adı" when a point has
// no placement record yet. Lives here rather than in a view so the placement
// reports can resolve an area name too.
export function getStationArea(x, y) {
  const px = (x / 100) * 800;
  const py = (y / 100) * 500;
  if (px >= 20 && px < 300 && py >= 20 && py < 220) return "Hammadde Deposu";
  if (px >= 300 && px < 550 && py >= 20 && py < 140) return "Ofisler & Laboratuvar";
  if (px >= 550 && px <= 780 && py >= 20 && py < 220) return "Sosyal Tesisler";
  if (px >= 20 && px < 470 && py >= 220 && py <= 480) return "Ana Üretim Hattı";
  if (px >= 470 && px <= 780 && py >= 220 && py <= 480) return "Ambalaj & Sevkiyat";
  return "Dış Çevre / Genel";
}

/**
 * Display name for the zone a point sits in.
 *
 * The zone lookup above only describes the built-in template plan. Once a
 * facility has its own uploaded floor plan those five room names are fiction,
 * so we fall back to whatever the placement record says and otherwise admit we
 * do not know, rather than labelling a point "Hammadde Deposu" because of where
 * it happens to sit on someone else's layout.
 */
export function stationAreaName(site, station) {
  const recorded = station && station.placement && station.placement.areaName;
  if (recorded) return recorded;
  if (site && site.floorPlan) return 'Belirtilmedi';
  return getStationArea(station.x, station.y);
}

// One-line digest of the type-specific placement fields, for the tracking
// table. Returns '' when nothing type-specific has been recorded yet.
export function placementSummary(station) {
  const p = station.placement;
  if (!p) return '';
  const parts = [p.unitPower, p.tubeLength, p.uvTubeType, p.trapType, p.pheromonePeriod && `Feromon: ${p.pheromonePeriod}`]
    .filter(Boolean);
  return parts.join(' · ');
}

// ===== EXPANDED EQUIPMENT STATUS CODES =====
export const equipmentStatusCodes = {
  clean: { name: 'Temiz & Sağlam', code: 'OK', color: 'var(--green)' },
  activity: { name: 'Aktivite Var', code: 'AK', color: 'var(--red)' },
  damaged: { name: 'Hasarlı / Kırık', code: 'KI', color: 'var(--amber)' },
  missing: { name: 'Kayıp / Eksik', code: 'KA', color: '#888' },
  not_accessible: { name: 'Ulaşılamadı', code: 'U', color: '#6b7280' },
  renewed: { name: 'İstasyon Yenilendi', code: 'Y', color: 'var(--blue)' },
  bait_changed: { name: 'Yem Değişti', code: 'YD', color: 'var(--violet)' },
  glue_changed: { name: 'Yapışkan Plaka Değişti', code: 'YPD', color: '#8b5cf6' },
  unchecked: { name: 'Kontrol Bekliyor', code: 'KB', color: '#d4d4d8' }
};

// The chemical catalogue used to live here: twelve brand-name products with
// invented unit costs, plus a dosing table and a calculateDosage() helper keyed
// to their made-up ids (ch1..ch12).
//
// A pest control operator's product range is not a catalogue that ships with
// the software. Each product is registered by that company under its own
// biyosidal ruhsat, and only the registered range may be applied. The range now
// lives in the `chemicals` table and is defined from Stok & Envanter; see
// src/data/repo/inventory.js.
//
// The dosing calculator went with it. It had no caller left and could not have
// worked on real data, because every product it knew about was fictional.
// Per-product dosing belongs on the chemicals row alongside the licence, so it
// can be re-introduced against products that actually exist.

// The chemical document library used to live here: twelve products, each with
// an invented "T.C. Saglik Bak. Ruhsat No", an invented file size and a single
// hardcoded date, rendered on the facility page as MSDS sheets, approved label
// samples and ministry permits. No document content was ever shipped behind
// them and the "Goruntule" button had no handler.
//
// Inventing a ministry permit number is not a placeholder, it is a fabricated
// regulatory record on the screen an auditor inspects. The facility page now
// lists the org's own registered products and the ruhsat number it entered,
// and says plainly when no MSDS has been uploaded. Real document upload is
// still to be built; saying so is the honest state.
