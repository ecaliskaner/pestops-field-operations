// Service planner: turns each site's contracted scope into a dated visit plan
// (task 7-2).
//
// Roadmap §1: the contract fixes *what* is inspected and *how often* — "Dış alan
// kemirgen kontrolü ayda 2, iç alan kemirgen kontrolü ayda 4, yürüyen haşere
// kontrolü ayda 4, uçan haşere kontrolü (nisan – ekim arası ayda 4, kasım mart
// arası ayda 2), depo zararlıları kontrolü ayda 4" — and Repellent's authorised
// person then defines "yıllık ziyaret planını (hangi tarihlerde ve saat
// dilimlerinde firmaya hizmet verileceğini)". So a calendar entry's task list is
// not decorative: it is derived from the site's own `serviceScope`.
//
// Pure computation — no DOM, no state mutation. Deterministic from a seeded PRNG
// keyed on site + month, so the same month always plans identically.

import { initial } from './seed.js';
import { getVisits, demoToday, crewLabel, monthShortNames } from './history.js';

/* ------------------------------------------------------------ scope → tasks */

// Contract scope keys, in the order the roadmap lists them.
const SCOPE_TASKS = [
  ['outdoorRodent', 'Dış alan kemirgen kontrolü'],
  ['indoorRodent', 'İç alan kemirgen kontrolü'],
  ['crawlingPest', 'Yürüyen haşere kontrolü'],
  ['flyingPest', 'Uçan haşere kontrolü'],
  ['storagePest', 'Depo zararlıları kontrolü']
];

// Flying-pest cover is seasonal per the contract clause: full frequency through
// the warm months, halved (floor 2) over winter. Same rule the history
// generator applies, so plan and history agree.
const HIGH_SEASON = (month) => month >= 3 && month <= 9;

function scopeFrequency(scope, key, month) {
  const entry = scope && scope[key];
  if (!entry || !entry.frequency) return 0;
  const f = entry.frequency;
  if (key === 'flyingPest' && !HIGH_SEASON(month)) return Math.max(2, Math.round(f / 2));
  return f;
}

// Visits a site needs in a month: the busiest scope sets the attendance rate.
// Sites without a contracted scope fall back to fortnightly, matching the
// assumption compliance.js already makes.
export function visitsPerMonth(site, month) {
  const freqs = SCOPE_TASKS.map(([key]) => scopeFrequency(site.serviceScope, key, month));
  const max = Math.max(0, ...freqs);
  return max || 2;
}

// Which scopes fall due on visit `i` of `n`. A scope contracted at 2/month on a
// site attended 4 times spreads across alternating visits rather than being
// crammed into the first two.
function tasksForVisit(site, month, i, n) {
  const out = [];
  for (const [key, label] of SCOPE_TASKS) {
    const f = scopeFrequency(site.serviceScope, key, month);
    if (!f) continue;
    if (Math.floor(((i + 1) * f) / n) > Math.floor((i * f) / n)) out.push(label);
  }
  // A site with no contracted scope still gets a general inspection.
  return out.length ? out : ['Genel istasyon kontrolü'];
}

/* ------------------------------------------------------- deterministic rng */

function hash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seedStr) {
  let a = (hash(seedStr) ^ 0x5ca1ab1e) >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Time slots the office offers; the customer confirms one of these (§1).
const SLOTS = ['09:00', '10:30', '13:30', '15:00', '16:30'];

const TECHS = ['Ayşe Demir', 'Mert Kaya', 'Ece Yılmaz', 'Can Öztürk'];
const PRIMARY_TECH = {
  s1: 'Ayşe Demir', s2: 'Mert Kaya', s3: 'Ece Yılmaz',
  s4: 'Can Öztürk', s5: 'Mert Kaya', s6: 'Ece Yılmaz',
  s7: 'Ece Yılmaz', s8: 'Can Öztürk'
};

const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();

/* --------------------------------------------------------- the plan itself */

/**
 * The planned visits for one site in one month, derived from its contract.
 * Each entry carries the crew, a confirmed time slot and the task list.
 */
export function plannedVisitsForSite(site, year, month) {
  const n = visitsPerMonth(site, month);
  const total = daysInMonth(year, month);
  const r = rng(`plan|${site.id}|${year}-${month}`);
  const spacing = Math.max(1, Math.floor((total - 3) / n));

  const out = [];
  for (let i = 0; i < n; i++) {
    let day = 2 + i * spacing + Math.floor(r() * Math.max(1, spacing - 1));
    if (day > total) day = total;

    // Sunday is not a service day; nudge to the Monday.
    const dow = new Date(year, month, day).getDay();
    if (dow === 0) day = Math.min(total, day + 1);

    const primary = PRIMARY_TECH[site.id] || TECHS[0];
    const roll = r();
    const size = roll < 0.6 ? 1 : roll < 0.92 ? 2 : 3;
    const extras = TECHS.filter((t) => t !== primary)
      .map((t) => ({ t, k: r() }))
      .sort((a, b) => a.k - b.k)
      .slice(0, size - 1)
      .map((x) => x.t);
    const team = [primary, ...extras];

    const tasks = tasksForVisit(site, month, i, n);

    out.push({
      kind: 'planned',
      id: `PL-${site.id}-${year}${String(month + 1).padStart(2, '0')}-${i + 1}`,
      siteId: site.id,
      company: site.company,
      siteName: site.name,
      city: site.city,
      year,
      month,
      day,
      date: `${String(day).padStart(2, '0')} ${monthShortNames[month]} ${year}`,
      time: SLOTS[Math.floor(r() * SLOTS.length) % SLOTS.length],
      team,
      teamLabel: crewLabel(team),
      visitType: 'RZ',
      tasks,
      // The customer confirms the slot (§1); most of the plan is confirmed, the
      // tail of the month is still provisional.
      confirmed: r() < 0.75
    });
  }
  return out.sort((a, b) => a.day - b.day);
}

/** Planned visits across every site (or one company) for a month. */
export function plannedVisits(year, month, filterFn) {
  const sites = filterFn ? initial.sites.filter(filterFn) : initial.sites;
  return sites.flatMap((s) => plannedVisitsForSite(s, year, month));
}

/**
 * Everything the calendar shows for one month: visits already carried out come
 * from the real history, days after "today" come from the plan. That split is
 * what makes the board read as an operational calendar rather than a mock-up.
 */
export function monthEntries(year, month, filterFn) {
  const today = demoToday();
  const isPast = (day) =>
    year < today.year ||
    (year === today.year && month < today.month) ||
    (year === today.year && month === today.month && day <= today.day);

  const completed = getVisits()
    .filter((v) => v.year === year && v.calendarMonth === month)
    .filter((v) => !filterFn || filterFn({ id: v.siteId, company: v.company }))
    .map((v) => ({
      kind: 'completed',
      id: v.id,
      reportNo: v.reportNo,
      siteId: v.siteId,
      company: v.company,
      siteName: v.siteName,
      city: v.city,
      year: v.year,
      month: v.calendarMonth,
      day: v.day,
      date: v.date,
      time: v.arrival,
      team: v.team,
      teamLabel: v.teamLabel,
      visitType: v.visitType,
      description: v.description,
      tasks: [],
      findings: v.totals.all,
      visitId: v.id
    }));

  // Only plan the part of the month that has not happened yet, so a month never
  // shows a planned visit next to the real one that fulfilled it.
  const planned = plannedVisits(year, month, filterFn).filter((p) => !isPast(p.day));

  return [...completed, ...planned].sort((a, b) => a.day - b.day || String(a.time).localeCompare(String(b.time)));
}

/** Month entries grouped by day-of-month, for grid rendering. */
export function entriesByDay(year, month, filterFn) {
  const map = new Map();
  for (const e of monthEntries(year, month, filterFn)) {
    if (!map.has(e.day)) map.set(e.day, []);
    map.get(e.day).push(e);
  }
  return map;
}

/** A technician's own upcoming assignments, for their notification feed. */
export function assignmentsFor(tech, year, month) {
  return plannedVisits(year, month).filter((p) => p.team.includes(tech));
}

export { daysInMonth };
