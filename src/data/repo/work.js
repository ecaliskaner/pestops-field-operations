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
