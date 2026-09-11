// Real-data bridge for work orders (İş Emirleri): reads/writes Supabase, but
// returns and accepts objects shaped like the legacy seed (src/data/seed.js)
// so the existing render code in src/views/work.js needs no changes to
// consume them — the same approach as src/data/repo/sites.js; see that file's
// header for the fuller rationale.
//
// This pass covers the list + create surface only. Completing a visit
// (chemical usage, invoice generation, the technician's own GPS/QR-verified
// arrival and completion) stays on local state — that lifecycle is driven for
// real by the Flutter technician app's RPCs (wo_depart/wo_arrive/wo_scan_qr/
// wo_complete in supabase/migrations/20260905000003_rpc_and_storage.sql), and
// the office "Tamamlandı" button here is a distinct, smaller admin override
// that still needs its own real wiring — tracked as follow-up work, not done
// in this pass.

import { supabase, run } from '../../core/supabase.js';

const WORK_SELECT = `
  id, code, title, description, priority, visit_type, status, due_at, completed_at,
  site:sites(id, name, customer:customers(name)),
  technician:technicians(id, full_name)
`;

// The audit trail the dashboard's activity feed reads. Written only by the
// SECURITY DEFINER RPCs the technician app calls (wo_depart / wo_arrive /
// wo_scan_qr / save_inspection / wo_complete), and append-only by RLS
// construction — there is no update or delete policy on this table for any
// role, admin included.
const EVENT_SELECT = `
  id, event_type, event_time, station_code, distance_m, radius_m,
  work_order:work_orders(
    code,
    site:sites(id, name, customer:customers(name)),
    technician:technicians(full_name)
  )
`;

// "13 Tem, 18:00" — matches the format the seed and the old local-only
// createWorkSubmit() already produced, so nothing downstream needs to change.
function formatDue(iso) {
  if (!iso) return 'Planlanacak';
  const dt = new Date(iso);
  const day = dt.getDate();
  const month = dt.toLocaleDateString('tr-TR', { month: 'short' });
  const time = dt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  return `${day} ${month}, ${time}`;
}

/**
 * Map one Supabase `work_orders` row (with its embedded site/customer/
 * technician) onto the shape src/views/work.js expects.
 *
 * `code` (the human "WO-2048" reference), not the row's uuid `id`, becomes
 * the object's `id` — every existing view keys off it for both display and
 * `data-work="…"` lookups, and it is unique per org just like the uuid.
 *
 * @param {object} row
 * @returns {object}
 */
export function mapWorkOrderRow(row) {
  return {
    id: row.code,
    dbId: row.id,
    siteId: row.site?.id || '',
    title: row.title,
    site: `${row.site?.customer?.name || ''} · ${row.site?.name || ''}`,
    priority: row.priority,
    type: 'Planlı servis',
    visitType: row.visit_type,
    due: formatDue(row.due_at),
    // Raw timestamps alongside the display string: the dashboard filters by
    // real dates (today / this week / this month) and cannot parse "13 Tem".
    dueAt: row.due_at,
    completedAt: row.completed_at,
    // The real lifecycle status (scheduled / on_the_way / arrived_gps /
    // started_by_first_qr / in_progress / completed / cancelled). The audit
    // panel keys off this; `completed` below stays for the list renderers.
    status: row.status,
    tech: row.technician?.full_name || 'Atanmadı',
    description: row.description || '',
    completed: row.status === 'completed'
  };
}

/**
 * Fetch every work order the signed-in user can see (RLS scopes this —
 * admin sees the org's whole board, a technician sees only their own jobs).
 *
 * @returns {Promise<object[]>}
 */
export async function fetchWorkOrders() {
  const rows = await run(
    supabase.from('work_orders').select(WORK_SELECT).order('due_at', { ascending: true, nullsFirst: false })
  );
  return rows.map(mapWorkOrderRow);
}

// How each audit event reads in the office activity feed. `kind` maps onto the
// existing .feed-icon classes ('done' green, 'alert' red, '' blue).
const EVENT_LABELS = {
  departed:           { kind: '',      icon: '→', label: 'Teknisyen yola çıktı' },
  arrived_gps:        { kind: '',      icon: '⌖', label: 'Teknisyen tesise ulaştı' },
  gps_mismatch:       { kind: 'alert', icon: '!', label: 'GPS uyuşmazlığı — tesis sınırı dışında' },
  first_qr_scanned:   { kind: 'done',  icon: '⚑', label: 'İlk QR okutuldu — iş başladı' },
  station_qr_scanned: { kind: '',      icon: '⌗', label: 'İstasyon okutuldu' },
  inspection_saved:   { kind: '',      icon: '✎', label: 'Denetim formu kaydedildi' },
  completed:          { kind: 'done',  icon: '✓', label: 'Servis tamamlandı' }
};

// entered_geofence is written alongside every in-fence arrival_gps as the
// audit counterpart of gps_mismatch. Showing both would double every arrival
// in the feed, so the feed reads arrived_gps and lets entered_geofence stay in
// the trail for the audit view.
const FEED_HIDDEN_EVENTS = new Set(['entered_geofence']);

function mapEventRow(row) {
  const meta = EVENT_LABELS[row.event_type] || { kind: '', icon: '•', label: row.event_type };
  const wo = row.work_order || {};
  const time = new Date(row.event_time);
  return {
    id: row.id,
    kind: meta.kind,
    icon: meta.icon,
    title: row.station_code ? `${meta.label} — ${row.station_code}` : meta.label,
    tech: wo.technician?.full_name || '',
    siteId: wo.site?.id || '',
    where: `${wo.site?.customer?.name || ''} · ${wo.site?.name || ''}`,
    time: time.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    at: row.event_time
  };
}

/**
 * The most recent audit events across the org, newest first — the real source
 * for the dashboard activity feed. A fresh org has none, and an empty feed is
 * the correct answer rather than an error.
 *
 * @param {number} limit
 * @returns {Promise<object[]>}
 */
export async function fetchRecentEvents(limit = 12) {
  const rows = await run(
    supabase
      .from('work_order_events')
      .select(EVENT_SELECT)
      .order('event_time', { ascending: false })
      .limit(limit)
  );
  return rows.filter((r) => !FEED_HIDDEN_EVENTS.has(r.event_type)).map(mapEventRow);
}

function generateCode() {
  return `WO-${Math.floor(2000 + Math.random() * 8000)}`;
}

/**
 * Create a new work order and return it mapped to the seed shape.
 *
 * @param {{orgId: string, siteId: string, technicianId: string, title: string,
 *   description?: string, priority: 'low'|'normal'|'high'|'critical',
 *   visitType: string, dueAt: string, createdBy?: string}} input
 * @returns {Promise<object>}
 */
export async function createWorkOrder(input) {
  const row = await run(
    supabase
      .from('work_orders')
      .insert({
        org_id: input.orgId,
        site_id: input.siteId,
        technician_id: input.technicianId,
        code: generateCode(),
        title: input.title,
        description: input.description || null,
        priority: input.priority,
        visit_type: input.visitType,
        due_at: input.dueAt,
        created_by: input.createdBy || null
      })
      .select(WORK_SELECT)
      .single()
  );
  return mapWorkOrderRow(row);
}

/**
 * Real per-technician field statistics, derived from the work order's own
 * audit timestamps rather than a synthetic history generator:
 *
 *   travel  = departed_at        -> arrived_gps_at
 *   on-site = real_work_started_at -> completed_at
 *
 * real_work_started_at is the column only the first QR scan may write (see
 * the RLS note in 20260905000002_rls.sql), so "on-site time" here is the
 * product's evidentiary claim, not an estimate. A completed job missing a
 * timestamp pair simply does not contribute to that half of the average.
 *
 * @returns {Promise<object[]>} one row per technician with real work
 */
export async function fetchTechnicianStats() {
  const rows = await run(
    supabase
      .from('work_orders')
      .select('technician_id, departed_at, arrived_gps_at, real_work_started_at, completed_at, technician:technicians(full_name)')
      .eq('status', 'completed')
  );

  const minutes = (from, to) => {
    if (!from || !to) return null;
    const ms = new Date(to) - new Date(from);
    return ms > 0 ? Math.round(ms / 60000) : null;
  };

  const byTech = new Map();
  for (const row of rows) {
    if (!row.technician_id) continue;
    const entry = byTech.get(row.technician_id) || {
      technicianId: row.technician_id,
      tech: row.technician?.full_name || '',
      visits: 0, onSiteMin: 0, travelMin: 0, onSiteSamples: 0, travelSamples: 0
    };
    entry.visits += 1;
    const onSite = minutes(row.real_work_started_at, row.completed_at);
    if (onSite !== null) { entry.onSiteMin += onSite; entry.onSiteSamples += 1; }
    const travel = minutes(row.departed_at, row.arrived_gps_at);
    if (travel !== null) { entry.travelMin += travel; entry.travelSamples += 1; }
    byTech.set(row.technician_id, entry);
  }

  return [...byTech.values()].map((e) => ({
    ...e,
    avgOnSiteMin: e.onSiteSamples ? Math.round(e.onSiteMin / e.onSiteSamples) : 0,
    avgTravelMin: e.travelSamples ? Math.round(e.travelMin / e.travelSamples) : 0
  }));
}

// The arrival-related slice of the audit trail, for the Ekip page's geofence
// feed. Kept separate from fetchRecentEvents() so the dashboard feed and this
// one can filter independently.
const GEOFENCE_EVENT_TYPES = ['arrived_gps', 'gps_mismatch'];

/**
 * Recent geofence arrivals and mismatches, newest first.
 *
 * @param {number} limit
 * @returns {Promise<object[]>}
 */
export async function fetchGeofenceEvents(limit = 18) {
  const rows = await run(
    supabase
      .from('work_order_events')
      .select(`
        id, event_type, event_time, distance_m, radius_m,
        work_order:work_orders(
          code,
          site:sites(id, name, customer:customers(name)),
          technician:technicians(full_name)
        )
      `)
      .in('event_type', GEOFENCE_EVENT_TYPES)
      .order('event_time', { ascending: false })
      .limit(limit)
  );
  return rows.map((row) => {
    const wo = row.work_order || {};
    return {
      id: row.id,
      type: row.event_type,
      mismatch: row.event_type === 'gps_mismatch',
      tech: wo.technician?.full_name || '',
      siteId: wo.site?.id || '',
      siteName: wo.site?.name || '',
      company: wo.site?.customer?.name || '',
      distanceM: row.distance_m === null ? null : Number(row.distance_m),
      radiusM: row.radius_m === null ? null : Number(row.radius_m),
      time: new Date(row.event_time).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    };
  });
}

// ---- audit warnings -----------------------------------------------------
//
// The first-QR lock and the GPS trail are the product's differentiator, so
// this is the panel that has to be beyond reproach. It used to be generated:
// a hash of each synthetic visit id decided which visits got a
// "QR outside the fence" or a "GPS arrival with no QR" warning
// (`hashId(v.id) % 47 === 0`), and "short visit" was measured against a
// fabricated per-site average. Accusing a named technician of falsifying an
// arrival on the strength of `id % 47` is the worst thing this codebase did.
//
// All three findings are now derived from the audit trail itself:
//
//   gps_mismatch      a real gps_mismatch event — the phone reported arrival
//                     while its own fix sat outside the site geofence
//   gps_no_qr         arrived_gps_at is set but real_work_started_at is not,
//                     so no first QR was ever scanned at the site
//   short_visit       a completed visit whose real on-site span is well under
//                     that site's own average, computed from its other visits

const SHORT_VISIT_RATIO = 0.8;   // below this fraction of the site's own average
const SHORT_VISIT_MIN_SAMPLES = 3; // an "average" from fewer visits means nothing

const AUDIT_WO_SELECT = `
  id, code, status, arrived_gps_at, real_work_started_at, completed_at,
  site:sites(id, name, customer:customers(name)),
  technician:technicians(full_name)
`;

const shortDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) : '';

function minutesBetween(from, to) {
  if (!from || !to) return null;
  const ms = new Date(to) - new Date(from);
  return ms > 0 ? Math.round(ms / 60000) : null;
}

/**
 * Every audit anomaly the GPS + QR trail actually caught, newest first.
 *
 * @returns {Promise<object[]>}
 */
export async function fetchAuditWarnings() {
  const [orders, mismatches] = await Promise.all([
    run(supabase.from('work_orders').select(AUDIT_WO_SELECT).order('due_at', { ascending: false })),
    run(
      supabase
        .from('work_order_events')
        .select('id, event_time, distance_m, radius_m, work_order:work_orders(code, site:sites(id, name, customer:customers(name)), technician:technicians(full_name))')
        .eq('event_type', 'gps_mismatch')
        .order('event_time', { ascending: false })
        .limit(50)
    )
  ]);

  const label = (wo) => `${wo.site?.customer?.name || ''} · ${wo.site?.name || ''}`;
  const out = [];

  // 1. Arrival reported from outside the site's own geofence.
  for (const ev of mismatches) {
    const wo = ev.work_order || {};
    out.push({
      type: 'gps_mismatch',
      workId: wo.code || '',
      siteId: wo.site?.id || '',
      siteName: label(wo),
      tech: wo.technician?.full_name || '',
      date: shortDate(ev.event_time),
      at: ev.event_time,
      detail: ev.distance_m !== null && ev.radius_m !== null
        ? `Varış bildirildiğinde cihaz konumu tesis sınırının ${ev.distance_m} m dışındaydı (geofence ${ev.radius_m} m).`
        : 'Varış bildirildiğinde cihaz konumu tesis geofence sınırının dışındaydı.'
    });
  }

  // 2. No first QR — the visit never officially started.
  //
  // The arrival is not required for this to matter. A job closed from the
  // office with no GPS arrival *and* no QR has even less evidence behind it
  // than one with an arrival, and the earlier version skipped exactly those.
  for (const wo of orders) {
    if (wo.real_work_started_at) continue;
    const closed = wo.status === 'completed';
    if (!wo.arrived_gps_at && !closed) continue;
    out.push({
      type: 'gps_no_qr',
      workId: wo.code,
      live: !closed && wo.status !== 'cancelled',
      siteId: wo.site?.id || '',
      siteName: label(wo),
      tech: wo.technician?.full_name || '',
      date: shortDate(wo.arrived_gps_at || wo.completed_at),
      at: wo.arrived_gps_at || wo.completed_at,
      detail: closed
        ? 'İş tamamlandı olarak kapatıldı, ancak tesiste hiç ilk QR okutulmamış — servisin gerçekten başladığına dair kanıt yok.'
        : 'Tesise varış işaretlendi, ancak ilk QR taraması kaydı yok.'
    });
  }

  // 3. Visits far shorter than that site's own norm.
  const bySite = new Map();
  for (const wo of orders) {
    const mins = minutesBetween(wo.real_work_started_at, wo.completed_at);
    if (mins === null) continue;
    const siteId = wo.site?.id || '';
    const entry = bySite.get(siteId) || { total: 0, count: 0, rows: [] };
    entry.total += mins;
    entry.count += 1;
    entry.rows.push({ wo, mins });
    bySite.set(siteId, entry);
  }
  for (const entry of bySite.values()) {
    if (entry.count < SHORT_VISIT_MIN_SAMPLES) continue;
    const avg = entry.total / entry.count;
    for (const { wo, mins } of entry.rows) {
      if (mins >= SHORT_VISIT_RATIO * avg) continue;
      out.push({
        type: 'short_visit',
        workId: wo.code,
        siteId: wo.site?.id || '',
        siteName: label(wo),
        tech: wo.technician?.full_name || '',
        date: shortDate(wo.completed_at),
        at: wo.completed_at,
        detail: `Sahada ${mins} dk — bu tesisin ${entry.count} ziyaretlik ortalaması ${Math.round(avg)} dk.`
      });
    }
  }

  return out.sort((a, b) => new Date(b.at) - new Date(a.at));
}

/**
 * Close a work order from the office, without the first QR scan.
 *
 * wo_complete() deliberately refuses this — the first QR is what the product
 * claims as the real start of a visit — so the office path is a separate,
 * admin-only RPC that demands a reason and records itself as a distinct
 * `completed_without_qr` event. fetchAuditWarnings() above then surfaces every
 * work order closed this way, which is the point: the capability exists, but
 * never silently.
 *
 * @param {{workOrderId: string, reason: string}} input
 * @returns {Promise<object>}
 */
export async function completeWorkOrderByOffice(input) {
  const row = await run(
    supabase.rpc('wo_complete_by_office', {
      p_wo: input.workOrderId,
      p_reason: input.reason
    })
  );
  const wo = Array.isArray(row) ? row[0] : row;
  return wo || null;
}

/**
 * Record a station inspection against a work order.
 *
 * A direct insert, which insp_admin_all already permits for the office. The
 * technician app takes the other path — save_inspection() — because it also
 * carries offline idempotency and the QR evidence; this is the office typing
 * up a visit that was recorded on paper.
 *
 * @param {{orgId: string, workOrderId: string, stationId?: string,
 *   stationCode: string, status: string, baitStatus: string, pestType?: string,
 *   activityCount?: number, notes?: string, createdBy?: string}} input
 * @returns {Promise<object>}
 */
export async function recordInspection(input) {
  return run(
    supabase
      .from('inspections')
      .insert({
        org_id: input.orgId,
        work_order_id: input.workOrderId,
        station_id: input.stationId || null,
        station_code: input.stationCode,
        status: input.status,
        bait_status: input.baitStatus,
        pest_type: input.pestType || 'none',
        activity_count: input.activityCount || 0,
        notes: input.notes || null,
        created_by: input.createdBy || null
      })
      .select('id, station_code, status, activity_count')
      .single()
  );
}
