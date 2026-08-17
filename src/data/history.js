// Seeded 12-month visit history (Phase 0b-1).
//
// Every value below is derived from a fixed seed, so the generator produces
// byte-identical output every time — no demo-day surprises, and screenshots
// taken today still match the app next week.

import { initial } from './seed.js';
import { chemicalDatabase, pestDatabase } from './catalog.js';

const SEED = 0x1adb69;
const MONTH_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

// Window ends on the month the seed data calls "now" (July 2026).
const WINDOW_END = { year: 2026, month: 6 };
const WINDOW_MONTHS = 12;
const LAST_DAY = 12;

const TECHS = ['Ayşe Demir', 'Mert Kaya', 'Ece Yılmaz', 'Can Öztürk'];
const PRIMARY_TECH = { s1: 'Ayşe Demir', s2: 'Mert Kaya', s3: 'Ece Yılmaz', s4: 'Can Öztürk', s5: 'Mert Kaya', s6: 'Ece Yılmaz', s7: 'Ece Yılmaz', s8: 'Can Öztürk' };

// Relative pest pressure by calendar month (0 = January). Flying peaks Jun–Aug;
// rodents move indoors as it cools, so they peak Oct–Dec.
const SEASON = {
  flying:   [0.15, 0.15, 0.25, 0.45, 0.70, 0.95, 1.00, 0.95, 0.70, 0.45, 0.25, 0.15],
  crawling: [0.30, 0.30, 0.40, 0.55, 0.70, 0.85, 1.00, 1.00, 0.80, 0.60, 0.40, 0.30],
  rodent:   [0.80, 0.70, 0.55, 0.45, 0.40, 0.35, 0.35, 0.45, 0.65, 0.90, 1.00, 0.95],
  stored:   [0.40, 0.40, 0.50, 0.60, 0.75, 0.90, 1.00, 0.95, 0.85, 0.60, 0.50, 0.40]
};

// How many pests a single device of each kind catches at full seasonal pressure.
const CATCH_SCALE = { flying: 28, crawling: 7, rodent: 3 };

const STATION_CATEGORY = {
  rodent: 'rodent',
  rodent_bait: 'rodent',
  catch_alive_trap: 'rodent',
  crawler: 'crawling',
  insect_detector: 'crawling',
  sp_insect_trap: 'crawling',
  flying: 'flying',
  flying_insect_trap: 'flying',
  insect_light_trap: 'flying',
  sp_moth_trap: 'flying'
};

const CHEMICALS_BY_CATEGORY = {
  rodent: ['ch3', 'ch4'],
  crawling: ['ch2', 'ch7', 'ch1', 'ch11'],
  flying: ['ch5', 'ch8', 'ch6', 'ch12']
};

const RECOMMENDATIONS = [
  { category: 'Hijyen', desc: 'Atık toplama alanı çevresinde organik artık birikimi tespit edildi; günlük temizlik frekansı artırılmalı.' },
  { category: 'Hijyen', desc: 'Üretim hattı altındaki drenaj kanallarında biyofilm oluşumu var, basınçlı yıkama önerilir.' },
  { category: 'Hijyen', desc: 'Personel yemekhanesinde açıkta bekleyen gıda artıkları uçan haşere çekiyor.' },
  { category: 'Yalıtım', desc: 'Sevkiyat rampası kapı fırçaları yıpranmış, kemirgen geçişine açık boşluk mevcut.' },
  { category: 'Yalıtım', desc: 'Kablo geçiş delikleri sıvamasız; çelik yün ve mastik ile kapatılmalı.' },
  { category: 'Yalıtım', desc: 'Depo penceresi sineklikleri yırtık, uçan haşere girişi engellenmeli.' },
  { category: 'BRCGS', desc: 'Dış çevre kapı eşiği contası yenilenmeli — BRCGS madde 4.14 uygunsuzluğu.' },
  { category: 'BRCGS', desc: 'İstasyon kroki haritası güncel değil; yeni eklenen noktalar işlenmeli.' },
  { category: 'AIB', desc: 'Sevkiyat rampası A-2 kapısına hava perdesi veya PVC şerit bariyer takılmalı.' },
  { category: 'AIB', desc: 'Hammadde paletleri duvara 45 cm’den yakın istiflenmiş; denetim koridoru açılmalı.' }
];

const VISIT_TYPE_WEIGHTS = [
  ['RZ', 68], ['IZ', 12], ['TZ', 9], ['ES', 5], ['AC', 3], ['3G', 2], ['DZ', 1]
];

// ---------- deterministic randomness ----------

function hash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seedStr) {
  let a = (hash(seedStr) ^ SEED) >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];

function weightedPick(r, pairs) {
  const total = pairs.reduce((s, p) => s + p[1], 0);
  let n = r() * total;
  for (const [value, weight] of pairs) {
    n -= weight;
    if (n <= 0) return value;
  }
  return pairs[0][0];
}

// ---------- calendar ----------

export function monthWindow() {
  const out = [];
  let y = WINDOW_END.year;
  let m = WINDOW_END.month - (WINDOW_MONTHS - 1);
  while (m < 0) { m += 12; y -= 1; }
  for (let i = 0; i < WINDOW_MONTHS; i++) {
    out.push({ year: y, month: m, label: MONTH_SHORT[m], key: `${y}-${String(m + 1).padStart(2, '0')}` });
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  return out;
}

const formatDate = (y, m, d) => `${String(d).padStart(2, '0')} ${MONTH_SHORT[m]} ${y}`;
const clock = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

// ---------- generation ----------

// Sites with a worse score carry more pest pressure; this keeps generated
// history consistent with the scores already shown elsewhere in the demo.
const pressureOf = (site) => Math.max(0.15, Math.min(1, (100 - site.score) / 45));

function visitsInMonth(site, month, r) {
  const scope = site.serviceScope;
  let n = 2;
  if (scope && scope.flyingPest) {
    const high = month >= 3 && month <= 9; // Nisan–Ekim
    n = high ? scope.flyingPest.frequency : Math.max(2, Math.round(scope.flyingPest.frequency / 2));
  }
  if (site.score < 70) n += 1;
  if (r() < 0.15) n -= 1;
  return Math.max(1, Math.min(5, n));
}

function readStation(station, month, pressure, r) {
  const category = STATION_CATEGORY[station.type] || 'crawling';
  const season = SEASON[category][month];
  const expected = CATCH_SCALE[category] * season * pressure;

  let count = 0;
  // Below expected ~1 catch, most inspections come back clean.
  if (r() < Math.min(0.92, expected / (expected + 1.4))) {
    count = Math.max(1, Math.round(expected * (0.45 + r() * 1.35)));
  }

  let status = count > 0 ? 'activity' : 'clean';
  const fault = r();
  if (count === 0 && fault < 0.03) status = 'damaged';
  else if (count === 0 && fault < 0.045) status = 'missing';
  else if (count === 0 && fault < 0.075) status = 'bait_changed';

  const species = pestDatabase[category === 'crawling' ? 'crawling' : category] || pestDatabase.crawling;
  const live = species.filter((s) => s.code !== '0');

  // One draw for the species — picking separately for the code and the name
  // produced readings whose code and name disagreed (e.g. code "ARI" labelled
  // "Diğer Uçan"), which surfaces anywhere both are shown.
  const found = count > 0 ? pick(r, live) : null;

  return {
    code: station.code,
    type: station.type,
    category,
    status,
    pestCount: count,
    pestCode: found ? found.code : '0',
    pestName: found ? found.name : 'Aktivite Yok'
  };
}

function buildChemicalUse(site, readings, dateStr, tech, r) {
  const hot = [...new Set(readings.filter((x) => x.pestCount > 0).map((x) => x.category))];
  if (!hot.length && r() > 0.25) return [];
  const categories = hot.length ? hot : ['crawling'];
  return categories.slice(0, 2).map((cat) => {
    const id = pick(r, CHEMICALS_BY_CATEGORY[cat]);
    const chem = chemicalDatabase.find((c) => c.id === id);
    const qty = chem.unit === 'gr' ? 20 + Math.round(r() * 60) : 120 + Math.round(r() * 380);
    return {
      chemicalId: id,
      name: chem.name,
      quantity: qty,
      unit: chem.unit,
      area: `${100 + Math.round(r() * 500)} m²`,
      date: dateStr,
      tech,
      cost: Math.round(qty * chem.unitCost)
    };
  });
}

function generate() {
  const months = monthWindow();
  const visits = [];
  const recommendations = [];
  let visitSeq = 0;
  let recSeq = 0;

  for (const site of initial.sites) {
    const pressure = pressureOf(site);
    const stations = site.stations || [];
    const openRecs = [];

    months.forEach((mo, monthIndex) => {
      const monthRng = rng(`${site.id}|${mo.key}`);
      const count = visitsInMonth(site, mo.month, monthRng);
      const spacing = Math.floor(26 / count);

      for (let v = 0; v < count; v++) {
        const r = rng(`${site.id}|${mo.key}|${v}`);
        const day = Math.min(28, 2 + v * spacing + Math.floor(r() * Math.max(1, spacing - 1)));
        // The seed data's "today" is 12 Tem 2026 — never generate a visit past it.
        if (monthIndex === WINDOW_MONTHS - 1 && day > LAST_DAY) continue;
        const dateStr = formatDate(mo.year, mo.month, day);
        const tech = r() < 0.78 ? PRIMARY_TECH[site.id] || TECHS[0] : pick(r, TECHS);

        const readings = stations.map((st) => readStation(st, mo.month, pressure, r));
        const totalPests = readings.reduce((s, x) => s + x.pestCount, 0);

        const travelMin = 18 + Math.floor(r() * 42);
        const onSiteMin = 45 + stations.length * 6 + Math.floor(r() * 40) + Math.round(totalPests * 0.8);
        const startMin = 8 * 60 + Math.floor(r() * 7) * 30;

        const chemicals = buildChemicalUse(site, readings, dateStr, tech, r);

        const visit = {
          id: `VH-${String(++visitSeq).padStart(4, '0')}`,
          siteId: site.id,
          company: site.company,
          siteName: site.name,
          city: site.city,
          monthKey: mo.key,
          monthIndex,
          calendarMonth: mo.month,
          year: mo.year,
          date: dateStr,
          day,
          visitType: weightedPick(r, VISIT_TYPE_WEIGHTS),
          tech,
          arrival: clock(startMin),
          departure: clock(startMin + onSiteMin),
          travelMin,
          onSiteMin,
          readings,
          totals: {
            all: totalPests,
            rodent: readings.filter((x) => x.category === 'rodent').reduce((s, x) => s + x.pestCount, 0),
            flying: readings.filter((x) => x.category === 'flying').reduce((s, x) => s + x.pestCount, 0),
            crawler: readings.filter((x) => x.category === 'crawling').reduce((s, x) => s + x.pestCount, 0)
          },
          chemicals,
          recommendationsRaised: [],
          recommendationsClosed: []
        };

        // A bad reading day is what actually triggers a written recommendation.
        const raiseChance = 0.08 + Math.min(0.42, totalPests / 60);
        if (r() < raiseChance) {
          const template = pick(r, RECOMMENDATIONS);
          // Point the finding at a real station where possible, so the
          // "photograph the problem area" step has somewhere to refer to.
          const hotReading = readings.find((x) => x.pestCount > 0);
          const rec = {
            id: `RH-${String(++recSeq).padStart(4, '0')}`,
            siteId: site.id,
            category: template.category,
            desc: template.desc,
            date: dateStr,
            raisedMonth: monthIndex,
            tech,
            status: 'open',
            closedDate: null,
            closedMonth: null,
            // ---- closed-loop fields (1-6). Additive: `status` keeps its
            // original open/resolved meaning, `stage` carries the detail.
            stage: 'raised',
            dueDate: formatDate(mo.year, mo.month, Math.min(28, day + 14)),
            stationCode: hotReading ? hotReading.code : null,
            photoBefore: null,
            photoAfter: null,
            customerNote: null,
            customerRespondedDate: null,
            approvedBy: null,
            approvedDate: null,
            rejectionNote: null
          };
          recommendations.push(rec);
          openRecs.push(rec);
          visit.recommendationsRaised.push(rec.id);
        }

        // Older open items get closed off as the technician re-inspects.
        for (let i = openRecs.length - 1; i >= 0; i--) {
          const rec = openRecs[i];
          if (monthIndex - rec.raisedMonth < 1) continue;
          if (r() < 0.35) {
            rec.status = 'resolved';
            rec.closedDate = dateStr;
            rec.closedMonth = monthIndex;
            // A historically closed finding went the whole way round the loop:
            // the customer acted, and the technician signed the closure off.
            rec.stage = 'approved';
            rec.customerRespondedDate = dateStr;
            rec.approvedBy = tech;
            rec.approvedDate = dateStr;
            visit.recommendationsClosed.push(rec.id);
            openRecs.splice(i, 1);
          }
        }

        visits.push(visit);
      }
    });
  }

  // ---- closed-loop stage spread (1-6) ----
  // Every finding carries a "before" photo, because the roadmap requires the
  // technician to photograph the problem area when raising it. Photos are held
  // as small descriptors, not image data — the view draws them — so stored
  // data stays light and a real upload slots into the same field shape.
  for (const rec of recommendations) {
    rec.photoBefore = { kind: 'simulated', label: 'Tespit anı', ref: `${rec.id}-before` };

    if (rec.stage === 'approved') {
      rec.photoAfter = { kind: 'simulated', label: 'Aksiyon sonrası', ref: `${rec.id}-after` };
      rec.customerNote = 'Belirtilen aksiyon tamamlandı, alan temizlendi ve kontrol edildi.';
      continue;
    }

    // Open findings are spread across the remaining stages so the demo shows
    // every stage at once. `status` deliberately stays 'open' for all of them,
    // which keeps the existing open/resolved counts unchanged.
    const r = rng(`loop|${rec.id}`);
    const roll = r();
    if (roll < 0.34) {
      rec.stage = 'customer_actioned';
      rec.customerRespondedDate = rec.dueDate;
      rec.customerNote = 'Aksiyon tarafımızca tamamlandı, onayınıza sunulmuştur.';
      rec.photoAfter = { kind: 'simulated', label: 'Aksiyon sonrası', ref: `${rec.id}-after` };
    } else if (roll < 0.44) {
      rec.stage = 'rejected';
      rec.customerRespondedDate = rec.dueDate;
      rec.customerNote = 'Alan temizlendi.';
      rec.photoAfter = { kind: 'simulated', label: 'Aksiyon sonrası', ref: `${rec.id}-after` };
      rec.rejectionNote = 'Gönderilen görselde uygunsuzluk devam ediyor; tekrar aksiyon alınmalı.';
    }
  }

  return { months, visits, recommendations, deviceReplacements: buildDeviceReplacements() };
}

// ---- equipment replacement history (1-2) ----
//
// Roadmap §8: when a device is lost, broken or renewed, a new barcode is
// issued to the *same point number*, and the old device's readings must stay
// attached to that point for measurement and comparison. So the identity that
// history hangs off is the point code, never the barcode.

const REPLACEMENT_REASONS = {
  KA: { code: 'KA', name: 'Kayıp', en: 'Lost' },
  KI: { code: 'KI', name: 'Kırık', en: 'Broken' },
  Y:  { code: 'Y',  name: 'İstasyon Yenilendi', en: 'Renewed' }
};

export const replacementReasons = REPLACEMENT_REASONS;

/** Deterministic barcode for a device generation at a point. */
export function barcodeFor(siteId, code, generation = 1) {
  const n = hash(`${siteId}|${code}|${generation}`) % 100000;
  return `RP-${siteId.toUpperCase()}-${code}-${String(n).padStart(5, '0')}`;
}

// A couple of seeded mid-window replacements, so the "history survives the
// swap" claim is visible on screen before anyone clicks anything.
function buildDeviceReplacements() {
  const months = monthWindow();
  const out = [];
  const seeded = [
    { siteId: 's1', code: 'F-01', monthIndex: 5, reason: 'KI' },
    { siteId: 's2', code: 'R-04', monthIndex: 7, reason: 'KA' }
  ];
  for (const s of seeded) {
    const mo = months[s.monthIndex];
    const r = rng(`swap|${s.siteId}|${s.code}`);
    const day = 6 + Math.floor(r() * 16);
    out.push({
      siteId: s.siteId,
      code: s.code,
      date: formatDate(mo.year, mo.month, day),
      monthIndex: s.monthIndex,
      day,
      reasonCode: s.reason,
      reason: REPLACEMENT_REASONS[s.reason].name,
      oldBarcode: barcodeFor(s.siteId, s.code, 1),
      newBarcode: barcodeFor(s.siteId, s.code, 2),
      generation: 2,
      note: 'Saha ziyaretinde tespit edildi, aynı noktaya yeni cihaz tanımlandı.'
    });
  }
  return out;
}

let cache = null;
const history = () => (cache || (cache = generate()));

// ---------- public API ----------

export const getMonths = () => history().months;
export const getVisits = () => history().visits;
export const getRecommendations = () => history().recommendations;
export const visitsForSite = (siteId) => history().visits.filter((v) => v.siteId === siteId);

/** 12-month pest totals. Pass a siteId to scope to one site. */
export function monthlyPestTotals(siteId) {
  const { months, visits } = history();
  const scoped = siteId ? visits.filter((v) => v.siteId === siteId) : visits;
  const series = { all: [], rodent: [], flying: [], crawler: [] };
  months.forEach((_, i) => {
    const inMonth = scoped.filter((v) => v.monthIndex === i);
    for (const key of Object.keys(series)) {
      series[key].push(inMonth.reduce((s, v) => s + v.totals[key], 0));
    }
  });
  return { labels: months.map((m) => m.label), ...series };
}

export const recommendationsForSite = (siteId) =>
  history().recommendations.filter((r) => !siteId || r.siteId === siteId);

/**
 * Recommendation counts.
 *
 * The first five fields are the original 0b-2 contract and keep their exact
 * meaning — `resolved` still counts only fully closed findings. The closed-loop
 * stage counts below are additive (1-6); note that `actioned` and `rejected`
 * items are still `open`, because the loop has not closed on them yet.
 */
export function recommendationStats(siteId) {
  const recs = recommendationsForSite(siteId);
  const atStage = (s) => recs.filter((r) => r.stage === s).length;
  return {
    total: recs.length,
    open: recs.filter((r) => r.status === 'open').length,
    resolved: recs.filter((r) => r.status === 'resolved').length,
    hygiene: recs.filter((r) => r.category === 'Hijyen').length,
    isolation: recs.filter((r) => r.category !== 'Hijyen').length,
    // closed-loop stages
    raised: atStage('raised'),
    awaitingApproval: atStage('customer_actioned'),
    approved: atStage('approved'),
    rejected: atStage('rejected'),
    // "actioned" = customer responded at least once, whatever happened after
    actioned: recs.filter((r) => r.customerRespondedDate).length,
    withPhotoEvidence: recs.filter((r) => r.photoBefore && r.photoAfter).length
  };
}

// ---- point history across device replacements (1-2) ----

export const deviceReplacements = (siteId, code) =>
  history().deviceReplacements.filter(
    (d) => (!siteId || d.siteId === siteId) && (!code || d.code === code)
  );

/**
 * Every reading ever taken at one point, oldest first, each tagged with the
 * device that was installed at the time. This is the comparison the roadmap
 * asks for: swapping the hardware must not break the point's timeline.
 */
export function readingsForPoint(siteId, code) {
  const swaps = deviceReplacements(siteId, code);
  const visits = visitsForSite(siteId);

  // Walk the window in order and advance the device generation as each
  // replacement date is passed.
  const ordered = visits
    .slice()
    .sort((a, b) => a.monthIndex - b.monthIndex || a.day - b.day);

  const out = [];
  for (const v of ordered) {
    const reading = v.readings.find((x) => x.code === code);
    if (!reading) continue;

    let generation = 1;
    for (const s of swaps) {
      if (v.monthIndex > s.monthIndex || (v.monthIndex === s.monthIndex && v.day >= s.day)) {
        generation = Math.max(generation, s.generation);
      }
    }

    out.push({
      visitId: v.id,
      date: v.date,
      monthIndex: v.monthIndex,
      day: v.day,
      tech: v.tech,
      visitType: v.visitType,
      generation,
      barcode: barcodeFor(siteId, code, generation),
      status: reading.status,
      pestCount: reading.pestCount,
      pestCode: reading.pestCode,
      pestName: reading.pestName
    });
  }
  return out;
}

/** Summary of a point's life: readings and catches per device generation. */
export function pointDeviceSummary(siteId, code) {
  const readings = readingsForPoint(siteId, code);
  const swaps = deviceReplacements(siteId, code);
  const generations = new Map();

  for (const rd of readings) {
    const g = generations.get(rd.generation) || {
      generation: rd.generation,
      barcode: rd.barcode,
      readings: 0,
      totalPests: 0,
      firstDate: rd.date,
      lastDate: rd.date
    };
    g.readings += 1;
    g.totalPests += rd.pestCount;
    g.lastDate = rd.date;
    generations.set(rd.generation, g);
  }

  return {
    code,
    siteId,
    totalReadings: readings.length,
    totalPests: readings.reduce((s, r) => s + r.pestCount, 0),
    generations: [...generations.values()].sort((a, b) => a.generation - b.generation),
    replacements: swaps
  };
}

export function chemicalStats(siteId) {
  const uses = history().visits
    .filter((v) => !siteId || v.siteId === siteId)
    .flatMap((v) => v.chemicals);
  return {
    applications: uses.length,
    totalQuantity: uses.reduce((s, c) => s + c.quantity, 0),
    totalCost: uses.reduce((s, c) => s + c.cost, 0),
    distinctProducts: new Set(uses.map((c) => c.chemicalId)).size,
    lastDate: uses.length ? uses[uses.length - 1].date : '—'
  };
}

export function technicianStats(siteId) {
  const visits = history().visits.filter((v) => !siteId || v.siteId === siteId);
  const byTech = {};
  for (const v of visits) {
    const t = (byTech[v.tech] ||= { tech: v.tech, visits: 0, onSiteMin: 0, travelMin: 0 });
    t.visits++;
    t.onSiteMin += v.onSiteMin;
    t.travelMin += v.travelMin;
  }
  return Object.values(byTech)
    .map((t) => ({ ...t, avgOnSiteMin: Math.round(t.onSiteMin / t.visits), avgTravelMin: Math.round(t.travelMin / t.visits) }))
    .sort((a, b) => b.visits - a.visits);
}

/** Per-site totals over the window, worst first — drives the risk ranking. */
export function siteRanking() {
  return initial.sites
    .map((site) => {
      const visits = visitsForSite(site.id);
      const total = visits.reduce((s, v) => s + v.totals.all, 0);
      const recent = visits.filter((v) => v.monthIndex >= 9).reduce((s, v) => s + v.totals.all, 0);
      const prior = visits.filter((v) => v.monthIndex >= 6 && v.monthIndex < 9).reduce((s, v) => s + v.totals.all, 0);
      return {
        id: site.id,
        name: site.name,
        company: site.company,
        city: site.city,
        score: site.score,
        visits: visits.length,
        totalPests: total,
        recentPests: recent,
        trend: prior === 0 ? 0 : Math.round(((recent - prior) / prior) * 100),
        openRecommendations: recommendationStats(site.id).open
      };
    })
    .sort((a, b) => b.recentPests - a.recentPests);
}
