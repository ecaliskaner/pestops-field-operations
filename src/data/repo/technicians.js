// Real-data bridge for technician rosters used *outside* the Ekip (team) page.
//
// src/views/team.js has its own deep, deliberately-seeded simulation (fixed
// GPS loops, hardcoded names, demo credential cards) and stays on
// src/data/seed.js's techData — wiring that view to real data is a separate,
// larger pass (tracked alongside the Dashboard work in docs/PRODUCTION.md).
//
// This module is narrower: it feeds the "Görevlendirilecek Teknisyen" picker
// in the "Yeni İş Emri" form (src/ui/modal.js) and the work-order list's tech
// column (src/views/work.js), so a real admin assigns a real technician
// instead of one of four hardcoded demo names.

import { supabase, run } from '../../core/supabase.js';

const TECHNICIAN_SELECT = 'id, full_name, initials, phone, email, color, is_active';

function mapTechnicianRow(row) {
  return {
    id: row.id,
    name: row.full_name,
    initials: row.initials || '',
    phone: row.phone || '',
    email: row.email || '',
    color: row.color || '#1769e0'
  };
}

/**
 * Every active technician in the signed-in admin/tech's org (RLS scopes
 * this — a client role has no read policy on technicians at all here).
 *
 * @returns {Promise<object[]>}
 */
export async function fetchTechnicians() {
  const rows = await run(
    supabase.from('technicians').select(TECHNICIAN_SELECT).eq('is_active', true).order('full_name')
  );
  return rows.map(mapTechnicianRow);
}

/**
 * Live technician positions, straight from the `live_positions()` RPC
 * (supabase/migrations/20260905000003_rpc_and_storage.sql).
 *
 * This replaces a poll against /api/mobile/live-positions on the old Node
 * server — an endpoint that does not exist on the Vercel deployment at all,
 * so on production it failed on every 3-second tick and the map fell back to
 * a simulation of technicians gliding along İstanbul motorways. Those
 * technicians were invented. This returns only real device fixes reported by
 * the Flutter app, and returns an empty list when nobody is in the field.
 *
 * @returns {Promise<object[]>}
 */
export async function fetchLivePositions() {
  const rows = await run(supabase.rpc('live_positions'));
  return (rows || []).map((row) => ({
    technicianId: row.technician_id,
    name: row.technician_name,
    lat: Number(row.lat),
    lng: Number(row.lng),
    at: row.at,
    workOrderId: row.work_order_id,
    siteId: row.site_id,
    siteName: row.site_name,
    distanceM: row.distance_m === null ? null : Number(row.distance_m),
    radiusM: row.radius_m === null ? null : Number(row.radius_m),
    // null means the server could not measure it (an offline record), which
    // is not the same claim as "they were outside the fence".
    insideGeofence: row.inside_geofence
  }));
}

/**
 * Compliance documents for every technician in the org (SGK, iş güvenliği,
 * uygulama izni, portör raporu). Previously a hardcoded four-name registry in
 * src/data/credentials.js with invented certificate numbers.
 *
 * @returns {Promise<Record<string, object[]>>} keyed by technician id
 */
export async function fetchTechnicianCredentials() {
  const rows = await run(
    supabase
      .from('technician_credentials')
      .select('id, technician_id, kind, title, reference_no, valid_until, is_valid')
      .order('kind')
  );
  const byTech = {};
  for (const row of rows) {
    (byTech[row.technician_id] ||= []).push({
      id: row.id,
      kind: row.kind,
      title: row.title,
      referenceNo: row.reference_no || '',
      validUntil: row.valid_until,
      isValid: row.is_valid
    });
  }
  return byTech;
}
