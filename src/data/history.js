// Seeded 12-month visit history (Phase 0b-1).
//
// Every value below is derived from a fixed seed, so the generator produces
// byte-identical output every time — no demo-day surprises, and screenshots
// taken today still match the app next week.

import { initial } from './seed.js';
import { allSites } from '../core/state.js';

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

// ---------- calendar ----------

/**
 * The trailing twelve calendar months, ending with the current one.
 *
 * This used to end at WINDOW_END — the seeded dataset's frozen 12 Jul 2026 —
 * so that the generated numbers stayed reproducible. With real data that
 * window sits in the past: a visit completed this month lands outside it and
 * every month-indexed aggregation silently drops it.
 */
export function monthWindow() {
  const now = new Date();
  const out = [];
  let y = now.getFullYear();
  let m = now.getMonth() - (WINDOW_MONTHS - 1);
  while (m < 0) { m += 12; y -= 1; }
  for (let i = 0; i < WINDOW_MONTHS; i++) {
    out.push({ year: y, month: m, label: MONTH_SHORT[m], key: `${y}-${String(m + 1).padStart(2, '0')}` });
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  return out;
}

const formatDate = (y, m, d) => `${String(d).padStart(2, '0')} ${MONTH_SHORT[m]} ${y}`;

// "Now", for the calendar and the planner. This used to be pinned to the
// seeded dataset's frozen 12 Jul 2026 so the generated numbers stayed
// internally consistent; with real data it has to be the actual date, or the
// planner schedules against a day that has already passed.
export const demoToday = () => {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
};
export const monthName = (m) => MONTH_SHORT[m];
export const monthShortNames = MONTH_SHORT;
export const formatDayLabel = formatDate;
const clock = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

// ---------- generation ----------

// Sites with a worse score carry more pest pressure; this keeps generated
// history consistent with the scores already shown elsewhere in the demo.
const pressureOf = (site) => Math.max(0.15, Math.min(1, (100 - site.score) / 45));

// ---- visit crew, description and report number (7-1) ----
//
// A visit is carried out by a *team*, not always one technician, and carries a
// short work description — both of which the office lists on the visit-report
// board. Neither existed on the generated visit.
//
// Assigned in a post-pass from an rng keyed on the visit id, deliberately NOT
// drawn from the main `r()` stream: consuming extra numbers inside the
// generation loop would shift every seeded value downstream and invalidate the
// thresholds calibrated against them (compliance.js ACTIVITY_LIMIT, the
// short-visit rule in views/work.js). Same reason the closed-loop stage spread
// above uses its own `rng('loop|…')`.

const VISIT_DESCRIPTIONS = {
  RZ: ['Monitörler kontrol edilecek', 'İç alan rutin kontrolleri yapılacaktır',
       'Dış alan istasyon kontrolü yapılacaktır', 'Periyodik izleme ve kayıt alınacaktır'],
  TZ: ['Önceki bulgunun takip kontrolü', 'Aksiyon sonrası doğrulama ziyareti'],
  AC: ['Müşteri acil çağrısı — aktivite şikâyeti', 'Acil müdahale talebi'],
  IZ: ['Rezidüel ilaçlama uygulaması', 'Jel uygulama ve bariyer yenileme'],
  ILK: ['Sistem kurulumu ve ilk yerleşim yapılacaktır'],
  ES: ['Sözleşme dışı ek servis talebi'],
  '3G': ['3. göz bağımsız denetim ziyareti'],
  DZ: ['Dezenfeksiyon uygulaması yapılacaktır']
};

const firstName = (name) => String(name).split(' ')[0];

// "Ayşe-Mert (Ayşe Demir, Mert Kaya)" — the office's own crew shorthand. A crew
// of one is just that person's full name; the shorthand only earns its keep when
// there is more than one surname to disambiguate.
export const crewLabel = (team) =>
  team.length === 1 ? team[0] : `${team.map(firstName).join('-')} (${team.join(', ')})`;

function assignCrews(visits) {
  for (const v of visits) {
    const r = rng(`crew|${v.id}`);

    // Most routine work is solo; heavier visits pair up, occasionally a trio.
    const roll = r();
    const size = roll < 0.55 ? 1 : roll < 0.9 ? 2 : 3;
    const extras = TECHS
      .filter((t) => t !== v.tech)
      .map((t) => ({ t, k: r() }))
      .sort((a, b) => a.k - b.k)
      .slice(0, size - 1)
      .map((x) => x.t);

    v.team = [v.tech, ...extras];
    v.teamLabel = crewLabel(v.team);

    const pool = VISIT_DESCRIPTIONS[v.visitType] || VISIT_DESCRIPTIONS.RZ;
    v.description = pool[Math.floor(r() * pool.length) % pool.length];

    // Stable public document number, the id the office quotes on the phone.
    v.reportNo = `VR_${(hash(`vr|${v.id}`) % 9000000) + 1000000}`;
  }
}

// ---- equipment replacement history ----
//
// Roadmap §8: when a device is lost, broken or renewed, a new barcode is
// issued to the *same point number*, and the old device's readings must stay
// attached to that point. So the identity history hangs off is the point code,
// never the barcode.
//
// barcodeFor() used to live here and produced `RP-<SITEID>-<CODE>-<5 digits>`
// from a hash. A barcode is a label physically on a box; deriving one means the
// report prints an identifier no one can scan. Replacements are now
// station_replacements rows, installed by setStationReplacements() below, and
// the reason labels come from src/data/repo/stations.js.



// The synthetic visit generator that used to live above this line has been
// deleted, not merely disconnected: a fabrication engine left callable in a
// shipped file is one import away from coming back.
//
// ---------- the live history store ----------
//
// This used to be `cache || (cache = generate())` — twelve months of
// deterministic synthetic visits for the six seeded facilities. Every report
// body, insights chart, finance margin and productivity figure derives from
// here, so that one line made a customer's printed visit report and audit
// package fabrications end to end: documents that leave the building and get
// filed against a BRCGS or IFS audit.
//
// It now serves whatever src/data/repo/visits.js loaded from the database.
// Until that resolves — and for an org with no completed visits, which is the
// correct state for a new account — it serves an empty history, and every
// derived helper below degrades to zero rather than to invented numbers.
let cache = null;

const emptyHistory = () => ({
  months: monthWindow(),
  visits: [],
  recommendations: [],
  // Device replacement has no table yet, so point timelines render as a
  // single generation. Tracked with the rest of the station history work.
  deviceReplacements: []
});

const history = () => cache || emptyHistory();

/**
 * Install the real visit history. Called once per session from core/auth.js
 * after sign-in.
 *
 * @param {{months: object[], visits: object[], recommendations?: object[]}} data
 */
export function setVisitHistory(data) {
  cache = {
    months: data.months || monthWindow(),
    visits: data.visits || [],
    recommendations: data.recommendations || [],
    // Preserved across a visit-history reload so the two can be installed
    // independently; core/auth.js loads both, but a refresh of one must not
    // silently blank the other.
    deviceReplacements: (cache && cache.deviceReplacements) || []
  };
}

/**
 * Install the real device replacement log (repo/stations.js).
 *
 * The printed report builders are synchronous and read this store; the facility
 * page fetches per point directly, because right after a swap it needs the row
 * that was just written rather than the snapshot taken at sign-in.
 *
 * @param {object[]} rows
 */
export function setStationReplacements(rows) {
  if (!cache) cache = emptyHistory();
  cache.deviceReplacements = rows || [];
}

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

// The loaded replacement rows, optionally narrowed to one point. Rows carry
// `siteId` only when the loader scoped them; a store filled per facility is
// already narrowed, so a missing siteId is not treated as a mismatch.
export const deviceReplacements = (siteId, code) =>
  history().deviceReplacements.filter(
    (d) => (!siteId || !d.siteId || d.siteId === siteId) && (!code || d.code === code)
  );

/**
 * Every reading ever taken at one point, oldest first, each tagged with the
 * device that was installed at the time. This is the comparison the roadmap
 * asks for: swapping the hardware must not break the point's timeline.
 */
export function readingsForPoint(siteId, code) {
  const swaps = deviceReplacements(siteId, code);
  const visits = visitsForSite(siteId);

  const ordered = visits
    .slice()
    .sort((a, b) => a.monthIndex - b.monthIndex || a.day - b.day);

  // The barcode before the first recorded replacement. Blank when the org has
  // never recorded one — the old code derived it from a hash, which printed an
  // identifier nobody could scan.
  const originalBarcode = swaps.length ? swaps[0].oldBarcode : '';

  const out = [];
  for (const v of ordered) {
    const reading = v.readings.find((x) => x.code === code);
    if (!reading) continue;

    // Walk forward through the replacements: each one the visit date has
    // passed advances the generation and moves the barcode.
    let generation = 1;
    let barcode = originalBarcode;
    for (const swap of swaps) {
      if (v.completedAt && swap.replacedOn && new Date(v.completedAt) >= new Date(swap.replacedOn)) {
        generation += 1;
        barcode = swap.newBarcode;
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
      barcode,
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

/**
 * Per-site totals over the window, worst first — drives the risk ranking.
 *
 * Reads the live portfolio, not the seed: a facility added through the UI has
 * no history yet and so ranks last with zeros, which is the honest answer.
 * Generation above still walks `initial.sites`, so the seeded numbers are
 * untouched by this.
 */
export function siteRanking() {
  return allSites()
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
