// Real-data bridge for the sites list: reads/writes Supabase, but returns and
// accepts objects shaped like the legacy seed (src/data/seed.js) so the
// existing render code in src/views/sites.js needs zero changes to consume
// them. This is deliberate scaffolding, not the final architecture — see
// docs/PRODUCTION.md for the rest of the views still on seed data.
//
// Fields the seed carries that Supabase has no equivalent for yet (contact,
// contract, methods, files, chemicalsUsed, recommendations) come back as
// empty/neutral placeholders here. They render as empty sections rather than
// throwing, but are not wired to real tables — that is deeper work
// (site detail, contracts, inventory) than this pass covers.
//
// score/state/issues are deliberately NOT set from health_score/health_state:
// recalculateSiteStats() (core/state.js) already derives all three from
// site.stations on every render, so mapping the stored columns here would
// just be overwritten — and would drift the moment a real inspection changes
// a station's status. Leaving them out keeps a single source of truth.

import { supabase, run } from '../../core/supabase.js';

const SITE_SELECT = `
  id, name, city, address, sector, color,
  lat, lng, geofence_radius_m,
  contact_name, contact_phone, contact_email, service_scope,
  customer:customers(id, name),
  stations(id, code, type, pos_x, pos_y, last_status, last_bait_status, notes, device_barcode)
`;

function mapStation(row) {
  return {
    // The uuid is what writes address: a reading, a device replacement and a
    // QR scan all reference the station row, not its per-site code.
    dbId: row.id,
    code: row.code,
    type: row.type,
    // The barcode physically on the device. Blank until the org records one;
    // it used to be generated from a hash of the site id and point code.
    deviceBarcode: row.device_barcode || '',
    x: row.pos_x === null ? 0 : Number(row.pos_x),
    y: row.pos_y === null ? 0 : Number(row.pos_y),
    checked: row.last_status !== 'unchecked',
    status: row.last_status,
    baitStatus: row.last_bait_status,
    // The schema records pest findings on the inspection, not the station —
    // there is no "currently infested" flag to read on the station row
    // itself, so these render as clean until a real inspection sets them.
    pestType: 'none',
    pestCount: 0,
    notes: row.notes || ''
  };
}

/**
 * Map one Supabase `sites` row (with its embedded customer + stations) onto
 * the shape src/views/sites.js and src/core/state.js expect.
 *
 * @param {object} row
 * @returns {object}
 */
export function mapSiteRow(row) {
  return {
    id: row.id,
    company: row.customer?.name || '',
    // Needed to write the contact record back; the form edits the customer's
    // details, not the site's.
    customerId: row.customer?.id || '',
    name: row.name,
    city: row.city || '',
    // Recomputed from stations on every render — see file header.
    score: 100,
    state: 'healthy',
    issues: 0,
    last: 'Henüz servis yok',
    next: 'Planlanacak',
    color: row.color || '#e8e0f5',
    sector: row.sector || '',
    // Real WGS84 coordinates + the site's own geofence. The Ekip map used to
    // plot a hardcoded table of İstanbul coordinates for the six seeded
    // facilities; it now plots whatever the org actually recorded, and a site
    // with no coordinate yet is simply not on the map.
    lat: row.lat === null || row.lat === undefined ? null : Number(row.lat),
    lng: row.lng === null || row.lng === undefined ? null : Number(row.lng),
    geofenceRadiusM: row.geofence_radius_m || 150,
    address: row.address || '',
    contact: {
      name: row.contact_name || '',
      phone: row.contact_phone || '',
      email: row.contact_email || ''
    },
    serviceScope: row.service_scope && Object.keys(row.service_scope).length ? row.service_scope : null,
    contract: null,
    chemicalsUsed: [],
    methods: [],
    files: [],
    recommendations: [],
    stations: (row.stations || []).map(mapStation)
  };
}

/**
 * Fetch every site the signed-in user can see (RLS scopes this — admin/tech
 * get the org's whole portfolio, a client gets only their own company's
 * sites; supabase/migrations/*_rls.sql is the actual enforcement).
 *
 * @returns {Promise<object[]>}
 */
export async function fetchSites() {
  const rows = await run(supabase.from('sites').select(SITE_SELECT).order('name'));
  return rows.map(mapSiteRow);
}

// "01.01.2026 - 31.12.2026" -> [start, end] as ISO dates, or null if the text
// doesn't parse. The contract form still collects this as free text (matching
// the rest of the app's date style), but the contracts table needs real
// date columns, so the one form on the free-text -> date boundary lives here.
/**
 * Parse `01.01.2026 - 31.12.2026` into two ISO dates, or null.
 *
 * Exported because the facility edit form collects the period the same way
 * the create form does, and two copies of this regex would drift.
 */
export function parseContractPeriod(text) {
  const m = String(text || '').match(
    /(\d{1,2})\.(\d{1,2})\.(\d{4})\s*-\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/
  );
  if (!m) return null;
  const [, d1, mo1, y1, d2, mo2, y2] = m;
  return [`${y1}-${mo1.padStart(2, '0')}-${d1.padStart(2, '0')}`, `${y2}-${mo2.padStart(2, '0')}-${d2.padStart(2, '0')}`];
}

/**
 * Create a new site (+ its customer, if new, + its contract) and return the
 * site mapped to the seed shape.
 *
 * @param {{orgId: string, company: string, siteName: string, city: string,
 *   address: string, sector?: string, contactName: string, contactPhone: string,
 *   contactEmail: string, serviceScope: object, contractPeriod?: string,
 *   taxOffice?: string, taxNo?: string, annualPrice?: number, monthlyPrice?: number,
 *   extraVisitPrice?: number, emergencyCallPrice?: number}} input
 * @returns {Promise<object>}
 */
export async function createSite(input) {
  let customer = await run(
    supabase.from('customers').select('id').eq('org_id', input.orgId).eq('name', input.company).maybeSingle()
  );
  if (!customer) {
    customer = await run(
      supabase.from('customers').insert({ org_id: input.orgId, name: input.company }).select('id').single()
    );
  }

  const row = await run(
    supabase
      .from('sites')
      .insert({
        org_id: input.orgId,
        customer_id: customer.id,
        name: input.siteName,
        city: input.city,
        address: input.address,
        sector: input.sector || null,
        contact_name: input.contactName,
        contact_phone: input.contactPhone,
        contact_email: input.contactEmail,
        service_scope: input.serviceScope,
        // Nothing ever wrote these, which is the actual reason the Ekip map
        // showed no facilities on any real account: a coordinate cannot be
        // invented, so a site with none entered stays off the map honestly —
        // but until now there was no field to enter one at all.
        lat: input.lat ?? null,
        lng: input.lng ?? null
      })
      .select(SITE_SELECT)
      .single()
  );

  const period = parseContractPeriod(input.contractPeriod);
  if (period) {
    // Best-effort: a malformed contract write must not undo the site that
    // was already created — the admin can add the contract again from the
    // site detail screen once that exists, but losing the whole submission
    // over a date typo would be worse.
    await run(
      supabase.from('contracts').insert({
        org_id: input.orgId,
        site_id: row.id,
        period_start: period[0],
        period_end: period[1],
        tax_office: input.taxOffice || null,
        tax_no: input.taxNo || null,
        annual_price: input.annualPrice || null,
        monthly_price: input.monthlyPrice || null,
        extra_visit_price: input.extraVisitPrice || null,
        emergency_call_price: input.emergencyCallPrice || null
      })
    ).catch((err) => console.error('[repellent] sozlesme kaydedilemedi', err));
  }

  return mapSiteRow(row);
}

/**
 * Update a facility's own details and its customer's contact record.
 *
 * The edit form wrote all of this to browser state and called save(), so a
 * corrected phone number or address survived only in the browser it was typed
 * in. Two tables are involved because the form mixes them: the address belongs
 * to the site, the contact to the customer.
 *
 * @param {{siteId: string, customerId?: string, address?: string,
 *   serviceScope?: object, contactName?: string, contactPhone?: string,
 *   contactEmail?: string}} input
 * @returns {Promise<void>}
 */
export async function updateSite(input) {
  const siteRows = await run(
    supabase
      .from('sites')
      .update({
        address: input.address || null,
        // The contracted visit frequencies. `sites.service_scope` is a jsonb
        // column that has existed since the core schema and was written on
        // create but never on edit, so a corrected frequency lived only in the
        // browser that typed it — while data/schedule.js plans visits from it.
        ...(input.serviceScope ? { service_scope: input.serviceScope } : {}),
        // Coordinates are edited the same way: undefined leaves the column
        // alone, an explicit null clears a coordinate the admin typed in error.
        ...(input.lat !== undefined ? { lat: input.lat } : {}),
        ...(input.lng !== undefined ? { lng: input.lng } : {})
      })
      .eq('id', input.siteId)
      .select('id')
  );
  // RLS filters an UPDATE to zero rows without raising; a silent no-op here
  // would show the operator a success toast for a write that never happened.
  if (!siteRows.length) {
    throw new Error('Tesis güncellenemedi — yönetici yetkisi gerekiyor.');
  }

  if (!input.customerId) return;
  await run(
    supabase
      .from('customers')
      .update({
        contact_name: input.contactName || null,
        contact_phone: input.contactPhone || null,
        contact_email: input.contactEmail || null
      })
      .eq('id', input.customerId)
      .select('id')
  );
}
