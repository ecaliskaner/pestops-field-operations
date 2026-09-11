// Real visit history — the primitive the whole reporting layer is built on.
//
// data/history.js used to generate this: twelve months of deterministic
// synthetic visits, readings, chemical applications and findings for the six
// seeded facilities. Every report body, every insights chart, the finance
// margins and the technician productivity numbers derive from it, which meant
// a customer's printed visit report and audit package were fabrications end
// to end — documents that leave the building and get filed against a BRCGS or
// IFS audit.
//
// This builds the same structure from what actually happened:
//
//   visit     a completed work order
//   readings  its inspections (one row per station scanned)
//   chemicals its chemical_usages
//   timings   the work order's own audit timestamps
//
// The shape deliberately matches the generator's output field for field, so
// the derived helpers in data/history.js and the report builders keep working
// unchanged. See src/data/repo/sites.js for the same bridge pattern.

import { supabase, run } from '../../core/supabase.js';
import { monthWindow } from '../history.js';

const MONTH_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
  'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

const WINDOW_MONTHS = 12;

// The station_type enum, collapsed onto the three pest categories the reports
// and charts group by.
const STATION_CATEGORY = {
  rodent: 'rodent',
  crawler: 'crawling',
  flying: 'flying',
  insect_light_trap: 'flying',
  other: 'crawling'
};

const VISIT_SELECT = `
  id, code, visit_type, status,
  departed_at, arrived_gps_at, real_work_started_at, completed_at,
  site:sites(id, name, city, customer:customers(name)),
  technician:technicians(full_name)
`;

const INSPECTION_SELECT = `
  id, work_order_id, station_code, status, bait_status, pest_type, activity_count, notes,
  station:stations(type)
`;

const CHEMICAL_USE_SELECT = `
  id, work_order_id, quantity, unit, area_desc, applied_at,
  chemical:chemicals(id, name, unit, unit_cost)
`;

const pad = (n) => String(n).padStart(2, '0');
const formatDate = (y, m, d) => `${pad(d)} ${MONTH_SHORT[m]} ${y}`;
const clock = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';

function minutesBetween(from, to) {
  if (!from || !to) return 0;
  const ms = new Date(to) - new Date(from);
  return ms > 0 ? Math.round(ms / 60000) : 0;
}

// The month window is defined once, in data/history.js, and re-exported here
// so a caller assembling visits does not need to know where it lives. Two
// copies of this calculation would drift the moment one of them changed.
export { monthWindow };

// One station inspection, in the generator's reading shape.
function mapReading(row) {
  const type = row.station?.type || 'other';
  const hasPest = row.pest_type && row.pest_type !== 'none';
  return {
    code: row.station_code,
    type,
    category: STATION_CATEGORY[type] || 'crawling',
    status: row.status,
    baitStatus: row.bait_status,
    pestCount: Number(row.activity_count) || 0,
    // The schema stores the species as free text on the inspection; there is
    // no code/name pair to split, so both carry the same recorded value.
    pestCode: hasPest ? row.pest_type : '0',
    pestName: hasPest ? row.pest_type : 'Aktivite Yok',
    notes: row.notes || ''
  };
}

function mapChemicalUse(row, dateStr, tech) {
  const qty = Number(row.quantity) || 0;
  const unitCost = Number(row.chemical?.unit_cost) || 0;
  return {
    chemicalId: row.chemical?.id || '',
    name: row.chemical?.name || '',
    quantity: qty,
    unit: row.unit || row.chemical?.unit || '',
    area: row.area_desc || '',
    date: dateStr,
    tech,
    cost: Math.round(qty * unitCost)
  };
}

function totalsOf(readings) {
  const sum = (cat) => readings
    .filter((x) => x.category === cat)
    .reduce((s, x) => s + x.pestCount, 0);
  return {
    all: readings.reduce((s, x) => s + x.pestCount, 0),
    rodent: sum('rodent'),
    flying: sum('flying'),
    crawler: sum('crawling')
  };
}

/**
 * Every completed visit the signed-in user can see, with its readings and
 * chemical applications, plus the month window the reports index against.
 *
 * RLS scopes all three queries: an admin gets the org, a technician their own
 * jobs, a customer their own sites. A fresh org has no completed visits, and
 * an empty history is the correct answer — the reports render their empty
 * states rather than inventing a year of service.
 *
 * @returns {Promise<{months: object[], visits: object[]}>}
 */
export async function fetchVisitHistory() {
  const months = monthWindow();

  const orders = await run(
    supabase
      .from('work_orders')
      .select(VISIT_SELECT)
      .eq('status', 'completed')
      .order('completed_at', { ascending: true })
  );

  if (!orders.length) return { months, visits: [] };

  const ids = orders.map((o) => o.id);
  // Fetched in bulk rather than per visit: one round trip each instead of one
  // per completed job, which on a year of history is hundreds of requests.
  const [inspections, chemicalUses] = await Promise.all([
    run(supabase.from('inspections').select(INSPECTION_SELECT).in('work_order_id', ids)),
    run(supabase.from('chemical_usages').select(CHEMICAL_USE_SELECT).in('work_order_id', ids))
  ]);

  const readingsByWo = new Map();
  for (const row of inspections) {
    if (!readingsByWo.has(row.work_order_id)) readingsByWo.set(row.work_order_id, []);
    readingsByWo.get(row.work_order_id).push(mapReading(row));
  }
  const chemsByWo = new Map();
  for (const row of chemicalUses) {
    if (!chemsByWo.has(row.work_order_id)) chemsByWo.set(row.work_order_id, []);
    chemsByWo.get(row.work_order_id).push(row);
  }

  const monthIndexOf = (key) => months.findIndex((m) => m.key === key);

  const visits = orders.map((wo) => {
    const done = new Date(wo.completed_at);
    const y = done.getFullYear();
    const mo = done.getMonth();
    const day = done.getDate();
    const dateStr = formatDate(y, mo, day);
    const tech = wo.technician?.full_name || '';
    const readings = readingsByWo.get(wo.id) || [];

    return {
      id: wo.code,
      dbId: wo.id,
      siteId: wo.site?.id || '',
      company: wo.site?.customer?.name || '',
      siteName: wo.site?.name || '',
      city: wo.site?.city || '',
      monthKey: `${y}-${pad(mo + 1)}`,
      // -1 for anything older than the twelve-month window. The month-indexed
      // aggregations match on the index, so an out-of-window visit is simply
      // never counted rather than landing in the wrong bucket.
      monthIndex: monthIndexOf(`${y}-${pad(mo + 1)}`),
      calendarMonth: mo,
      year: y,
      date: dateStr,
      day,
      visitType: wo.visit_type,
      tech,
      arrival: clock(wo.arrived_gps_at || wo.real_work_started_at),
      departure: clock(wo.completed_at),
      travelMin: minutesBetween(wo.departed_at, wo.arrived_gps_at),
      // The evidentiary span: first QR to completion. Only the QR scan RPC may
      // write real_work_started_at, so this is the audited on-site time.
      onSiteMin: minutesBetween(wo.real_work_started_at, wo.completed_at),
      readings,
      totals: totalsOf(readings),
      chemicals: (chemsByWo.get(wo.id) || []).map((row) => mapChemicalUse(row, dateStr, tech)),
      // Findings are loaded separately (repo/customer.js) and linked back by
      // work order there; the report bodies read them from that list.
      recommendationsRaised: [],
      recommendationsClosed: []
    };
  });

  return { months, visits };
}
