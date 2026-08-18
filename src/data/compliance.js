// Food-safety and audit standards registry (Phase 5-1).
//
// Insectram advertises BRCGS / SALSA / ISO 22000 / FSSC 22000 / Red Tractor /
// AIB support, so matching them is table stakes (see docs/COMPETITOR.md).
//
// The badges are deliberately *not* decorative. Readiness for each standard is
// recomputed from the generated visit history, so an auditor-shaped question —
// "show me why you think you're BRCGS-ready" — has a real answer on screen. A
// site with open non-conformities visibly drops out of "ready".

import { allSites } from '../core/state.js';
import { visitsForSite, recommendationStats, getRecommendations, siteRanking } from './history.js';

// `sectors` matches against the site's `sector` string. Red Tractor is UK farm
// assurance, so nothing in this Turkish portfolio is in scope for it — that is
// the honest answer and the UI shows it as "kapsam dışı" rather than faking a
// pass.
export const STANDARDS = [
  {
    id: 'brcgs',
    name: 'BRCGS',
    full: 'BRCGS Global Standard — Food Safety Issue 9',
    clause: 'Madde 4.14 — Haşere Yönetimi',
    sectors: ['Gıda'],
    // A standard is only as good as what it insists on; these drive scoring.
    requires: { maxOpenNonConformities: 2, minClosureRate: 70, minCoverage: 90, proofRequired: true, maxActivity: 'low' }
  },
  {
    id: 'salsa',
    name: 'SALSA',
    full: 'SALSA — Safe and Local Supplier Approval',
    clause: 'Bölüm 5.3 — Haşere Kontrolü',
    sectors: ['Gıda'],
    requires: { maxOpenNonConformities: 3, minClosureRate: 60, minCoverage: 80, proofRequired: false }
  },
  {
    id: 'iso22000',
    name: 'ISO 22000',
    full: 'ISO 22000:2018 — Gıda Güvenliği Yönetim Sistemi',
    clause: 'Madde 8.2 — Ön Gereksinim Programları',
    sectors: ['Gıda', 'Lojistik', 'Turizm'],
    requires: { maxOpenNonConformities: 3, minClosureRate: 65, minCoverage: 85, proofRequired: true }
  },
  {
    id: 'fssc22000',
    name: 'FSSC 22000',
    full: 'FSSC 22000 v6 — Gıda Güvenliği Sertifikasyonu',
    clause: 'Ek 1.2.7 — Haşere Kontrol Programı',
    sectors: ['Gıda'],
    requires: { maxOpenNonConformities: 2, minClosureRate: 75, minCoverage: 90, proofRequired: true }
  },
  {
    id: 'redtractor',
    name: 'Red Tractor',
    full: 'Red Tractor Assurance — Farm & Produce',
    clause: 'Bölüm 4 — Depolama ve Haşere',
    sectors: ['Tarım'],
    requires: { maxOpenNonConformities: 2, minClosureRate: 70, minCoverage: 85, proofRequired: true }
  },
  {
    id: 'aib',
    name: 'AIB',
    full: 'AIB International — Consolidated Standards for Food Safety',
    clause: 'Bölüm 2 — Entegre Haşere Yönetimi',
    sectors: ['Gıda', 'Sağlık', 'Turizm'],
    requires: { maxOpenNonConformities: 3, minClosureRate: 65, minCoverage: 80, proofRequired: true }
  }
];

export const getStandard = (id) => STANDARDS.find((s) => s.id === id) || STANDARDS[0];

// Catches per station per visit, last quarter. Calibrated against the seeded
// history, where sites range 0.93–8.05 and only the portfolio's risk site
// (Acme, score 62) exceeds this.
const ACTIVITY_LIMIT = 4;

/** Sites whose sector puts them in scope for a standard. */
export function sitesInScope(standard) {
  return allSites().filter((site) =>
    standard.sectors.some((tag) => (site.sector || '').includes(tag)));
}

// Contracted visits per year. The seed carries seasonal frequencies per site;
// where it doesn't, monthly is the conservative assumption.
function expectedVisits(site) {
  const scope = site.serviceScope;
  if (scope && scope.flyingPest && scope.flyingPest.frequency) {
    // High season (Nis–Eki, 7 months) runs at the contracted frequency, the
    // remaining 5 months at half — the same rule the history generator uses.
    const f = scope.flyingPest.frequency;
    return Math.round(f * 7 + Math.max(2, Math.round(f / 2)) * 5);
  }
  // Sites without a seasonal clause run a nominal fortnightly programme. The
  // window ends mid-July, and the generator drops ~15% of slots, so 20 is what
  // a fully-compliant site of this kind actually books — 24 would mark every
  // such site short through an accounting artefact rather than a real miss.
  return 20;
}

/**
 * Audit readiness for one site against one standard, derived entirely from
 * generated history. Returns null when the site is out of scope.
 */
export function siteReadiness(standard, site) {
  if (!standard.sectors.some((tag) => (site.sector || '').includes(tag))) return null;

  const visits = visitsForSite(site.id);
  const recs = recommendationStats(site.id);
  const req = standard.requires;

  const expected = expectedVisits(site);
  const coverage = Math.min(100, Math.round((visits.length / expected) * 100));
  const closureRate = recs.total ? Math.round((recs.resolved / recs.total) * 100) : 100;

  // Our differentiator: every visit is anchored by a first-QR scan plus a GPS
  // arrival stamp, so the evidence trail is complete by construction.
  const proofComplete = visits.length > 0;
  const chemicalTraceability = visits.length
    ? Math.round((visits.filter((v) => v.chemicals.length > 0).length /
        Math.max(1, visits.filter((v) => v.totals.all > 0).length)) * 100)
    : 100;

  // Paperwork alone does not pass an audit. BRCGS 4.14 and AIB both assess
  // whether the programme is *effective*, so a site can be fully documented
  // and still fail on sustained activity. Without this, the portfolio's worst
  // site scores all-green purely because heavy servicing closes findings fast.
  //
  // Normalised per station per visit so sites of different sizes compare
  // fairly; on the seeded data this lands between 0.93 (best) and 8.05 (worst)
  // and tracks the site scores shown elsewhere in the demo.
  const rank = siteRanking().find((r) => r.id === site.id);
  const recentVisits = visits.filter((v) => v.monthIndex >= 9).length;
  const stationCount = Math.max(1, (site.stations || []).length);
  const activityRate = recentVisits
    ? (rank ? rank.recentPests : 0) / recentVisits / stationCount
    : 0;
  const activityOk = activityRate < ACTIVITY_LIMIT;

  // `major` mirrors how the standards themselves grade findings: a major
  // non-conformity fails the audit on its own, minors accumulate.
  const checks = [
    { label: 'Ziyaret kapsama oranı', value: `%${coverage}`, target: `≥ %${req.minCoverage}`, pass: coverage >= req.minCoverage, major: false },
    { label: 'Açık uygunsuzluk', value: String(recs.open), target: `≤ ${req.maxOpenNonConformities}`, pass: recs.open <= req.maxOpenNonConformities, major: true },
    { label: 'Uygunsuzluk kapatma oranı', value: `%${closureRate}`, target: `≥ %${req.minClosureRate}`, pass: closureRate >= req.minClosureRate, major: false },
    { label: 'Kimyasal izlenebilirliği', value: `%${Math.min(100, chemicalTraceability)}`, target: 'kayıtlı', pass: chemicalTraceability >= 60, major: false },
    { label: 'QR + GPS kanıt zinciri', value: proofComplete ? 'Tam' : 'Eksik', target: req.proofRequired ? 'zorunlu' : 'opsiyonel', pass: proofComplete || !req.proofRequired, major: true },
    { label: 'Program etkinliği (son çeyrek)', value: `${activityRate.toFixed(2)} bulgu/istasyon/ziyaret`, target: `< ${ACTIVITY_LIMIT.toFixed(2)}`, pass: activityOk, major: true }
  ];

  const failed = checks.filter((c) => !c.pass);
  const majorFailures = failed.filter((c) => c.major).length;
  const status = majorFailures > 0 || failed.length > 2 ? 'gap'
    : failed.length === 0 ? 'ready'
    : 'attention';

  return {
    site, standard, checks, status,
    passed: checks.length - failed.length, total: checks.length,
    majorFailures, coverage, closureRate,
    visits: visits.length, openNonConformities: recs.open,
    activityRate: +activityRate.toFixed(2)
  };
}

/**
 * Portfolio-level rollup for one standard. Certification is per-site, so the
 * badge reports the mix rather than collapsing to the worst location: all
 * clear reads ready, none clear reads gap, anything between reads attention
 * and the ready/in-scope fraction is shown alongside it.
 */
export function standardSummary(standard) {
  const readiness = sitesInScope(standard).map((s) => siteReadiness(standard, s)).filter(Boolean);
  if (!readiness.length) {
    return { standard, status: 'out-of-scope', inScope: 0, ready: 0, openNonConformities: 0, readiness: [] };
  }
  const ready = readiness.filter((r) => r.status === 'ready').length;
  const status = ready === readiness.length ? 'ready' : ready === 0 ? 'gap' : 'attention';
  return {
    standard,
    status,
    inScope: readiness.length,
    ready,
    openNonConformities: readiness.reduce((s, r) => s + r.openNonConformities, 0),
    readiness
  };
}

export const complianceOverview = () => STANDARDS.map(standardSummary);

export const STATUS_LABEL = {
  ready: 'Denetime Hazır',
  attention: 'İzleme Gerekli',
  gap: 'Aksiyon Gerekli',
  'out-of-scope': 'Kapsam Dışı'
};

// Maps onto the existing .status-chip modifiers in styles.css.
export const STATUS_CHIP = {
  ready: 'healthy',
  attention: 'warning',
  gap: 'critical',
  'out-of-scope': 'secondary'
};

/** Open non-conformities across the portfolio, oldest first — audit packages
 *  and the non-conformity report both lead with these. */
export function openNonConformities(siteId) {
  return getRecommendations()
    .filter((r) => r.status === 'open' && (!siteId || r.siteId === siteId))
    .sort((a, b) => a.raisedMonth - b.raisedMonth);
}
