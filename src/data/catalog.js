// Domain catalog: pest taxonomy, visit types, equipment, chemicals, labels.
// Extracted from app.js (Phase 0a-1).

// ===== UI LABEL MAPS =====
export const names = { dashboard:"Genel bakış", sites:"Tesisler", work:"İş emirleri", team:"Ekip & rota", insights:"Analizler", reports:"Raporlar", companyDetail:"Tesis Detayı & Profil", mobileSim:"Mobil Uygulama", inventory:"Stok & Envanter", finance:"Finans & Fatura" };
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

// ===== CHEMICAL DATABASE =====
export const chemicalDatabase = [
  { id: 'ch1', name: 'K-Othrine SC 25', activeIngredient: 'Deltamethrin', concentration: '2.5%', usage: 'Yürüyen & uçan haşere', dosagePerM2: '50 ml/100m²', waterRatio: '5 lt suya 50 ml', category: 'İnsektisit', unitCost: 1.5, unit: 'ml' },
  { id: 'ch2', name: 'Goliath Gel', activeIngredient: 'Fipronil', concentration: '0.05%', usage: 'Hamamböceği jel uygulaması', dosagePerM2: '3 nokta/m²', waterRatio: 'Doğrudan uygulama', category: 'İnsektisit Jel', unitCost: 15.0, unit: 'gr' },
  { id: 'ch3', name: 'Racumin Paste', activeIngredient: 'Coumatetralyl', concentration: '0.0375%', usage: 'Kemirgen yem istasyonu', dosagePerM2: '20 gr/istasyon', waterRatio: 'Doğrudan uygulama', category: 'Rodentisit', unitCost: 0.8, unit: 'gr' },
  { id: 'ch4', name: 'Storm Secure', activeIngredient: 'Flocoumafen', concentration: '0.005%', usage: 'Kemirgen mücadelesi', dosagePerM2: '50 gr/istasyon', waterRatio: 'Doğrudan uygulama', category: 'Rodentisit', unitCost: 1.2, unit: 'gr' },
  { id: 'ch5', name: 'Aqua K-Othrine EW 20', activeIngredient: 'Deltamethrin', concentration: '2%', usage: 'Rezidüel ilaçlama', dosagePerM2: '50 ml/100m²', waterRatio: '10 lt suya 25 ml', category: 'İnsektisit', unitCost: 1.8, unit: 'ml' },
  { id: 'ch6', name: 'Icon 10 CS', activeIngredient: 'Lambda-cyhalothrin', concentration: '10%', usage: 'Dış alan bariyer ilaçlama', dosagePerM2: '100 ml/100m²', waterRatio: '10 lt suya 10 ml', category: 'İnsektisit', unitCost: 2.2, unit: 'ml' },
  { id: 'ch7', name: 'Maxforce White IC', activeIngredient: 'Imidacloprid', concentration: '2.15%', usage: 'Hamamböceği jel', dosagePerM2: '3 nokta/m²', waterRatio: 'Doğrudan uygulama', category: 'İnsektisit Jel', unitCost: 12.0, unit: 'gr' },
  { id: 'ch8', name: 'Cislin 2.5 UL', activeIngredient: 'Deltamethrin', concentration: '2.5%', usage: 'ULV fogger uygulama', dosagePerM2: '1 ml/m³', waterRatio: 'Doğrudan ULV', category: 'ULV İnsektisit', unitCost: 3.5, unit: 'ml' },
  { id: 'ch9', name: 'Steri-Fab', activeIngredient: 'İzopropil Alkol + Phenothrin', concentration: 'Karışım', usage: 'Dezenfeksiyon & haşere', dosagePerM2: '100 ml/10m²', waterRatio: 'Doğrudan sprey', category: 'Dezenfektan', unitCost: 0.9, unit: 'ml' },
  { id: 'ch10', name: 'Actellic 50 EC', activeIngredient: 'Pirimiphos-methyl', concentration: '50%', usage: 'Depo zararlıları fumigasyon', dosagePerM2: '100 ml/100m²', waterRatio: '10 lt suya 50 ml', category: 'Depo İnsektisit', unitCost: 2.5, unit: 'ml' },
  { id: 'ch11', name: 'Demand CS', activeIngredient: 'Lambda-cyhalothrin', concentration: '10%', usage: 'Genel haşere mücadelesi', dosagePerM2: '50 ml/100m²', waterRatio: '10 lt suya 12.5 ml', category: 'İnsektisit', unitCost: 2.0, unit: 'ml' },
  { id: 'ch12', name: 'Responsar SC', activeIngredient: 'Alfasipermetrin', concentration: '10%', usage: 'Dış çevre ilaçlama', dosagePerM2: '100 ml/100m²', waterRatio: '10 lt suya 20 ml', category: 'İnsektisit', unitCost: 1.6, unit: 'ml' }
];

// ===== STRUCTURED DOSING =====
// Machine-readable form of the `dosagePerM2` / `waterRatio` strings above, so
// the field calculator can work from numbers instead of re-parsing prose.
//   dose  — how much product per `per` units of `perUnit`
//   mix   — tank ratio: `chem` units of product per `water` litres of water.
//           null for products applied neat (gels, pastes, ULV).
//   basis — what the technician measures: area, volume or device count.
const DEFAULT_TANK_LITRES = 10;

export const chemicalDosing = {
  ch1:  { basis: 'area',   dose: { amount: 50,  unit: 'ml', per: 100, perUnit: 'm²' }, mix: { chem: 50,   water: 5 } },
  ch2:  { basis: 'area',   dose: { amount: 3,   unit: 'nokta', per: 1, perUnit: 'm²' }, mix: null, neatNote: 'Jel — doğrudan nokta uygulaması, su ile seyreltilmez.' },
  ch3:  { basis: 'device', dose: { amount: 20,  unit: 'gr', per: 1,  perUnit: 'istasyon' }, mix: null, neatNote: 'Yem bloğu — istasyona doğrudan yerleştirilir.' },
  ch4:  { basis: 'device', dose: { amount: 50,  unit: 'gr', per: 1,  perUnit: 'istasyon' }, mix: null, neatNote: 'Yem bloğu — istasyona doğrudan yerleştirilir.' },
  ch5:  { basis: 'area',   dose: { amount: 50,  unit: 'ml', per: 100, perUnit: 'm²' }, mix: { chem: 25,   water: 10 } },
  ch6:  { basis: 'area',   dose: { amount: 100, unit: 'ml', per: 100, perUnit: 'm²' }, mix: { chem: 10,   water: 10 } },
  ch7:  { basis: 'area',   dose: { amount: 3,   unit: 'nokta', per: 1, perUnit: 'm²' }, mix: null, neatNote: 'Jel — doğrudan nokta uygulaması, su ile seyreltilmez.' },
  ch8:  { basis: 'volume', dose: { amount: 1,   unit: 'ml', per: 1,   perUnit: 'm³' }, mix: null, neatNote: 'ULV — cihaza saf olarak doldurulur.' },
  ch9:  { basis: 'area',   dose: { amount: 100, unit: 'ml', per: 10,  perUnit: 'm²' }, mix: null, neatNote: 'Hazır sprey — seyreltilmeden uygulanır.' },
  ch10: { basis: 'area',   dose: { amount: 100, unit: 'ml', per: 100, perUnit: 'm²' }, mix: { chem: 50,   water: 10 } },
  ch11: { basis: 'area',   dose: { amount: 50,  unit: 'ml', per: 100, perUnit: 'm²' }, mix: { chem: 12.5, water: 10 } },
  ch12: { basis: 'area',   dose: { amount: 100, unit: 'ml', per: 100, perUnit: 'm²' }, mix: { chem: 20,   water: 10 } }
};

const round = (n, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp;

// Given a chemical and the measured quantity the technician entered (m², m³ or
// number of stations, depending on the product), work out how much product and
// how much water is required, plus how many tank loads that comes to.
// Returns null when the chemical or the amount is unusable, so callers can
// simply hide the panel.
export function calculateDosage(chemicalId, amount, tankLitres = DEFAULT_TANK_LITRES) {
  const dosing = chemicalDosing[chemicalId];
  const chem = chemicalDatabase.find(c => c.id === chemicalId);
  if (!dosing || !chem) return null;

  const measured = parseFloat(amount);
  if (!isFinite(measured) || measured <= 0) return null;

  const { dose, mix, basis } = dosing;
  const productAmount = round((measured / dose.per) * dose.amount, 2);

  const basisUnit = basis === 'volume' ? 'm³' : (basis === 'device' ? 'istasyon' : 'm²');

  const result = {
    chemicalId,
    chemicalName: chem.name,
    basis,
    basisUnit,
    measured,
    productAmount,
    productUnit: dose.unit,
    doseText: `${dose.amount} ${dose.unit}/${dose.per === 1 ? '' : dose.per}${dose.perUnit}`,
    waterLitres: 0,
    tankLoads: 0,
    tankLitres,
    perTankProduct: 0,
    neat: !mix,
    neatNote: dosing.neatNote || '',
    // Pre-formatted for the "Miktar" field so the saved record still reads the
    // way a hand-typed entry would.
    quantityText: `${productAmount} ${dose.unit}`,
    estimatedCost: Math.round(productAmount * (chem.unitCost || 0))
  };

  if (mix) {
    result.waterLitres = round((productAmount / mix.chem) * mix.water, 1);
    result.tankLoads = round(result.waterLitres / tankLitres, 2);
    result.perTankProduct = round((tankLitres / mix.water) * mix.chem, 2);
    result.mixText = `${mix.water} lt suya ${mix.chem} ${dose.unit}`;
  }

  return result;
}

// ===== CHEMICAL DOCUMENT LIBRARY =====
// Roadmap §9: the automatic chemical-usage report can only be produced if each
// product carries its MSDS, a label sample and its ministry (biyosidal) permit.
// These are demo placeholders — no real document content is shipped.
const DOC_DATE = '12 Oca 2026';

function chemDocs(permitNo, msdsSize, labelSize, permitSize) {
  return [
    { kind: 'msds',   label: 'MSDS / Güvenlik Bilgi Formu', en: 'Safety Data Sheet', icon: '🧪', size: msdsSize,   date: DOC_DATE, ref: '16 bölümlü GBF' },
    { kind: 'label',  label: 'Etiket Örneği',               en: 'Label Sample',      icon: '🏷️', size: labelSize,  date: DOC_DATE, ref: 'Onaylı ambalaj etiketi' },
    { kind: 'permit', label: 'Bakanlık Biyosidal İzni',     en: 'Ministry Permit',   icon: '📜', size: permitSize, date: DOC_DATE, ref: permitNo }
  ];
}

export const chemicalDocuments = {
  ch1:  chemDocs('T.C. Sağlık Bak. Ruhsat No: 2019/47', '412 KB', '180 KB', '1.1 MB'),
  ch2:  chemDocs('T.C. Sağlık Bak. Ruhsat No: 2018/112', '388 KB', '164 KB', '980 KB'),
  ch3:  chemDocs('T.C. Sağlık Bak. Ruhsat No: 2020/08', '455 KB', '201 KB', '1.3 MB'),
  ch4:  chemDocs('T.C. Sağlık Bak. Ruhsat No: 2021/33', '430 KB', '175 KB', '1.0 MB'),
  ch5:  chemDocs('T.C. Sağlık Bak. Ruhsat No: 2019/91', '402 KB', '188 KB', '1.2 MB'),
  ch6:  chemDocs('T.C. Sağlık Bak. Ruhsat No: 2017/64', '397 KB', '170 KB', '940 KB'),
  ch7:  chemDocs('T.C. Sağlık Bak. Ruhsat No: 2020/126', '365 KB', '158 KB', '1.1 MB'),
  ch8:  chemDocs('T.C. Sağlık Bak. Ruhsat No: 2018/79', '448 KB', '193 KB', '1.4 MB'),
  ch9:  chemDocs('T.C. Sağlık Bak. Ruhsat No: 2022/15', '376 KB', '162 KB', '870 KB'),
  ch10: chemDocs('T.C. Sağlık Bak. Ruhsat No: 2019/58', '421 KB', '184 KB', '1.2 MB'),
  ch11: chemDocs('T.C. Sağlık Bak. Ruhsat No: 2021/71', '409 KB', '177 KB', '1.0 MB'),
  ch12: chemDocs('T.C. Sağlık Bak. Ruhsat No: 2020/94', '393 KB', '169 KB', '990 KB')
};

export function getChemicalDocuments(chemicalId) {
  return chemicalDocuments[chemicalId] || [];
}
