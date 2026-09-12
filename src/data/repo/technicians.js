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
      .select('id, technician_id, kind, title, reference_no, valid_until, is_valid, document_path')
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
      isValid: row.is_valid,
      documentPath: row.document_path || ''
    });
  }
  return byTech;
}

const CREDENTIAL_BUCKET = 'credentials';

/**
 * Current hourly rates keyed by technician id.
 *
 * repo/billing.js has a sibling keyed by *name*, because the visit history
 * carries the technician's name rather than their id. This one is for the
 * editing screen, where the row being edited is known by id.
 *
 * @returns {Promise<Record<string, {id: string, hourlyRate: number, validFrom: string}>>}
 */
export async function fetchRatesByTechnician() {
  const rows = await run(
    supabase
      .from('technician_rates')
      .select('technician_id, hourly_rate, valid_from')
      .order('valid_from', { ascending: false })
  );
  const byId = {};
  for (const row of rows) {
    // Ordered newest first, so the first rate seen for a technician is current.
    if (byId[row.technician_id]) continue;
    byId[row.technician_id] = {
      technicianId: row.technician_id,
      hourlyRate: Number(row.hourly_rate),
      validFrom: row.valid_from
    };
  }
  return byId;
}

/**
 * Set a technician's hourly rate.
 *
 * `technician_rates` is keyed by technician_id, so this is an upsert rather
 * than an append: the table holds the current rate, not a history of them.
 * Without a rate on file the technician is left out of every labour cost and
 * margin — deliberately, because an invented rate produces an invented margin —
 * so this screen is what makes those figures complete.
 *
 * @param {{orgId: string, technicianId: string, hourlyRate: number}} input
 * @returns {Promise<object>}
 */
export async function setTechnicianRate(input) {
  if (!(input.hourlyRate > 0)) {
    throw new Error('Saatlik ücret sıfırdan büyük olmalıdır.');
  }
  const rows = await run(
    supabase
      .from('technician_rates')
      .upsert({
        technician_id: input.technicianId,
        org_id: input.orgId,
        hourly_rate: input.hourlyRate,
        valid_from: new Date().toISOString().slice(0, 10)
      }, { onConflict: 'technician_id' })
      .select('technician_id, hourly_rate, valid_from')
  );
  const row = rows[0];
  // `rates_admin_only` filters a non-admin's write to zero rows without
  // raising; a success toast for a write that never happened is worse than the
  // error.
  if (!row) throw new Error('Ücret kaydedilemedi — yönetici yetkisi gerekiyor.');
  return { technicianId: row.technician_id, hourlyRate: Number(row.hourly_rate), validFrom: row.valid_from };
}

/**
 * File a compliance document for a technician.
 *
 * The file goes up first and the row second. A row recorded against a file that
 * failed to upload is the worse failure: it tells an auditor a document exists
 * when it does not, whereas an uploaded file with no row is merely an orphan.
 *
 * @param {{orgId: string, technicianId: string, kind: string, title: string,
 *   referenceNo?: string, validUntil?: string, file?: File}} input
 * @returns {Promise<object>}
 */
export async function saveTechnicianCredential(input) {
  let documentPath = null;

  if (input.file) {
    const name = input.file.name || 'belge.pdf';
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : 'pdf';
    documentPath = `${input.orgId}/${input.technicianId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(CREDENTIAL_BUCKET).upload(documentPath, input.file, {
      contentType: input.file.type || 'application/pdf',
      upsert: false
    });
    if (error) throw new Error(error.message);
  }

  const rows = await run(
    supabase
      .from('technician_credentials')
      .insert({
        org_id: input.orgId,
        technician_id: input.technicianId,
        kind: input.kind,
        title: input.title,
        reference_no: input.referenceNo || null,
        // An empty date input must become NULL: Postgres rejects '' for a date
        // column and names the column rather than the field left blank.
        valid_until: input.validUntil || null,
        document_path: documentPath
      })
      .select('id, technician_id, kind, title, reference_no, valid_until, is_valid, document_path')
  );
  const row = rows[0];
  if (!row) throw new Error('Belge kaydedilemedi — yönetici yetkisi gerekiyor.');
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    referenceNo: row.reference_no || '',
    validUntil: row.valid_until,
    isValid: row.is_valid,
    documentPath: row.document_path || ''
  };
}

/**
 * A short-lived URL for a stored credential. The bucket is private and, unlike
 * MSDS sheets, staff-only: a customer sees the masked metadata row, never the
 * underlying document.
 *
 * @param {string} path
 * @param {number} expiresIn seconds
 * @returns {Promise<string|null>}
 */
export async function signedCredentialUrl(path, expiresIn = 3600) {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(CREDENTIAL_BUCKET).createSignedUrl(path, expiresIn);
  if (error) {
    console.error('[repellent] belge baglantisi alinamadi', error);
    return null;
  }
  return data?.signedUrl || null;
}
