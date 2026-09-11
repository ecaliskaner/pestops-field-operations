// Real-data bridge for the customer portal.
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

// reco_status is open | in_progress | done | rejected. The portal's question
// is narrower: which of these is the customer still holding?
const CUSTOMER_OWES = new Set(['open', 'rejected']);

function mapRecommendation(row) {
  return {
    id: row.id,
    siteId: row.site_id,
    desc: row.description,
    category: row.category || '',
    assignee: row.assignee || '',
    status: row.status,
    // 'rejected' means it came back for rework, which the portal shows
    // differently from a first-time finding.
    rework: row.status === 'rejected',
    raisedOn: row.raised_on,
    dueOn: row.due_on
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
      .select('id, site_id, description, category, assignee, status, raised_on, due_on')
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
