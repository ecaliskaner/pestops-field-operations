// Real-data bridge for the customer portal and the facility detail page.
//
// The portal is the highest-stakes surface in the product: an operator seeing
// an invented number is bad, a *customer* seeing an invented visit to their
// own facility is unrecoverable. Everything here therefore reads the real
// tables under the client's own RLS policies (reco_client_read,
// contracts_client_read), and returns empty rather than a placeholder.
//
// Note what is *not* here: the next visit and the last service are derived in
// the view from `state.work`, which already holds the client's real work
// orders (wo_client_read scopes them to their own company's sites). Querying
// them again would be a second source of truth for the same rows.

import { supabase, run } from '../../core/supabase.js';

const PHOTO_BUCKET = 'recommendation-photos';

const RECOMMENDATION_SELECT = `
  id, site_id, description, category, assignee, status, raised_on, due_on,
  station_code, customer_note, customer_responded_at,
  photo_before_path, photo_after_path,
  approved_by, approved_at, rejection_note,
  technician:technicians(full_name)
`;

// reco_status is open | in_progress | done | rejected. The portal's question
// is narrower: which of these is the customer still holding?
const CUSTOMER_OWES = new Set(['open', 'rejected']);

const trDate = (d) =>
  d ? new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

// The four-stage loop the UI draws is derived from the evidence rather than
// stored, so it can never contradict it. See the migration header in
// 20260911000002_recommendation_action_loop.sql.
function stageOf(row) {
  if (row.status === 'done') return 'approved';
  if (row.status === 'rejected') return 'rejected';
  if (row.customer_responded_at) return 'customer_actioned';
  return 'raised';
}

function mapRecommendation(row) {
  return {
    id: row.id,
    siteId: row.site_id,
    desc: row.description,
    category: row.category || '',
    assignee: row.assignee || '',
    status: row.status,
    stage: stageOf(row),
    // 'rejected' means it came back for rework, which the portal shows
    // differently from a first-time finding.
    rework: row.status === 'rejected',
    raisedOn: row.raised_on,
    dueOn: row.due_on,
    date: trDate(row.raised_on),
    dueDate: trDate(row.due_on),
    stationCode: row.station_code || null,
    tech: row.technician?.full_name || '',
    customerNote: row.customer_note || null,
    customerRespondedDate: trDate(row.customer_responded_at),
    photoBeforePath: row.photo_before_path || null,
    photoAfterPath: row.photo_after_path || null,
    approvedById: row.approved_by || null,
    approvedDate: trDate(row.approved_at),
    rejectionNote: row.rejection_note || null
  };
}

/**
 * Every finding raised against the sites this user can see, newest first.
 * RLS decides the scope: a client gets only their own company's sites.
 *
 * @returns {Promise<object[]>}
 */
export async function fetchRecommendations() {
  const rows = await run(
    supabase
      .from('recommendations')
      .select(RECOMMENDATION_SELECT)
      .order('raised_on', { ascending: false })
  );
  return rows.map(mapRecommendation);
}

/** Findings the customer still owes an action on. */
export const customerOwes = (recs) => recs.filter((r) => CUSTOMER_OWES.has(r.status));

/** Findings still open in any sense — the count shown per site. */
export const stillOpen = (recs) => recs.filter((r) => r.status !== 'done');

/**
 * The current contract for each site the user can see, keyed by site id.
 * Used for the call-out / extra-visit prices quoted in the request dialog —
 * quoting a price the contract does not contain would be worse than quoting
 * none, so a site with no contract simply gets no price line.
 *
 * @returns {Promise<Record<string, object>>}
 */
export async function fetchContracts() {
  const rows = await run(
    supabase
      .from('contracts')
      .select('id, site_id, period_start, period_end, monthly_price, annual_price, extra_visit_price, emergency_call_price')
      .order('period_start', { ascending: false })
  );
  const bySite = {};
  for (const row of rows) {
    // Ordered newest first, so the first contract seen for a site is current.
    if (bySite[row.site_id]) continue;
    bySite[row.site_id] = {
      id: row.id,
      siteId: row.site_id,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      monthlyPrice: row.monthly_price === null ? null : Number(row.monthly_price),
      annualPrice: row.annual_price === null ? null : Number(row.annual_price),
      extraVisitPrice: row.extra_visit_price === null ? null : Number(row.extra_visit_price),
      emergencyCallPrice: row.emergency_call_price === null ? null : Number(row.emergency_call_price)
    };
  }
  return bySite;
}

/**
 * Raise a service request as the signed-in customer.
 *
 * Goes through the request_service() RPC rather than a direct insert: RLS
 * gives a client no INSERT path on work_orders at all (deliberately — a
 * customer must not be able to forge arbitrary work orders), so the RPC is
 * what validates site ownership and fixes every field that matters. See
 * supabase/migrations/20260911000001_customer_service_requests.sql.
 *
 * @param {{siteId: string, kind: string, note: string, window: string}} input
 * @returns {Promise<{code: string, id: string}>}
 */
export async function requestService(input) {
  const row = await run(
    supabase.rpc('request_service', {
      p_site: input.siteId,
      p_kind: input.kind,
      p_note: input.note,
      p_window: input.window
    })
  );
  // The RPC returns a work_orders row; the portal only needs its human code.
  const wo = Array.isArray(row) ? row[0] : row;
  return { code: wo?.code || '', id: wo?.id || '' };
}

/* ------------------------------------------------- the closed action loop */

/**
 * Upload an evidence photo for a finding.
 *
 * The path is <org_id>/<site_id>/<rec_id>/<timestamp>, which is exactly what
 * the bucket's policies match on: the first segment scopes it to the org and
 * the second lets a client write only under their own sites.
 *
 * @param {{orgId: string, siteId: string, recId: string, blob: Blob, ext?: string}} input
 * @returns {Promise<string>} the stored path
 */
export async function uploadRecommendationPhoto(input) {
  const ext = input.ext || 'jpg';
  const path = `${input.orgId}/${input.siteId}/${input.recId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, input.blob, {
    contentType: input.blob.type || 'image/jpeg',
    upsert: false
  });
  if (error) throw new Error(error.message);
  return path;
}

/**
 * A short-lived URL for a stored photo. The bucket is private, so an <img>
 * cannot address the object directly.
 *
 * @param {string} path
 * @param {number} expiresIn seconds
 * @returns {Promise<string|null>}
 */
export async function signedPhotoUrl(path, expiresIn = 3600) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, expiresIn);
  if (error) {
    console.error('[repellent] fotograf baglantisi alinamadi', error);
    return null;
  }
  return data?.signedUrl || null;
}

/**
 * The customer's step: record what they did, with evidence.
 *
 * Goes through the RPC because a client has only reco_client_read. The RPC
 * lets them attach a note and a photo and move the finding to "awaiting our
 * approval" — and nothing else. In particular they can never set status to
 * 'done'; closing the loop is the operator's call.
 *
 * @param {{recId: string, note: string, photoPath?: string}} input
 * @returns {Promise<object|null>}
 */
export async function respondToRecommendation(input) {
  const row = await run(
    supabase.rpc('respond_to_recommendation', {
      p_rec: input.recId,
      p_note: input.note,
      p_photo_path: input.photoPath || ''
    })
  );
  const rec = Array.isArray(row) ? row[0] : row;
  return rec ? mapRecommendation(rec) : null;
}

/**
 * The operator's step: approve the action and close the finding.
 *
 * A direct update, which reco_admin_all already permits — no RPC needed,
 * because there the policy itself is the authorization.
 *
 * @param {{recId: string, approverId: string}} input
 * @returns {Promise<object>}
 */
export async function approveRecommendation(input) {
  const now = new Date().toISOString();
  const row = await run(
    supabase
      .from('recommendations')
      .update({
        status: 'done',
        approved_by: input.approverId || null,
        approved_at: now,
        closed_at: now,
        rejection_note: null
      })
      .eq('id', input.recId)
      .select(RECOMMENDATION_SELECT)
      .single()
  );
  return mapRecommendation(row);
}

/**
 * The operator's other step: send it back for rework, with a reason.
 *
 * @param {{recId: string, note: string}} input
 * @returns {Promise<object>}
 */
export async function rejectRecommendation(input) {
  const row = await run(
    supabase
      .from('recommendations')
      .update({
        status: 'rejected',
        rejection_note: input.note,
        approved_by: null,
        approved_at: null,
        closed_at: null
      })
      .eq('id', input.recId)
      .select(RECOMMENDATION_SELECT)
      .single()
  );
  return mapRecommendation(row);
}
