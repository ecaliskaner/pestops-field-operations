// Real stock and the org's own licensed chemical list.
//
// Two separate fabrications used to sit here. `state.inventory` was a seeded
// array of five products with invented lot numbers and prices, and the
// chemical picker offered `chemicalDatabase` from data/catalog.js — a static
// reference list shipped with the app.
//
// That second one matters more than it looks. A pest control operator's
// product list is not a catalogue: each entry carries a Biyosidal ruhsat
// number and an expiry, and applying a product whose licence has lapsed is a
// regulatory problem, not a data problem. So the picker has to offer what
// *this* company is actually licensed to apply, and nothing else.

import { supabase, run } from '../../core/supabase.js';

const CHEMICAL_SELECT =
  'id, name, active_ingredient, license_no, license_until, target_pests, unit, is_active, msds_path';

const STOCK_SELECT = `
  id, chemical_id, lot_no, qty, unit, min_qty, unit_cost, expires_on,
  chemical:chemicals(id, name, license_no, license_until)
`;

const num = (v) => (v === null || v === undefined ? 0 : Number(v));

/**
 * The org's licensed products, for the application picker.
 *
 * @returns {Promise<object[]>}
 */
export async function fetchChemicals() {
  const rows = await run(
    supabase.from('chemicals').select(CHEMICAL_SELECT).eq('is_active', true).order('name')
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    activeIngredient: row.active_ingredient || '',
    licenseNo: row.license_no || '',
    licenseUntil: row.license_until,
    // A product whose licence has expired must not be offered as if it were
    // usable; the picker greys these out rather than hiding them, so the
    // operator can see *why* something they expected is unavailable.
    licenseExpired: !!row.license_until && new Date(row.license_until) < new Date(),
    targetPests: row.target_pests || [],
    unit: row.unit || 'lt',
    msdsPath: row.msds_path || ''
  }));
}

/**
 * Stock on hand, mapped onto the shape src/views/inventory.js already renders.
 *
 * @returns {Promise<object[]>}
 */
export async function fetchInventory() {
  const rows = await run(
    supabase.from('inventory_items').select(STOCK_SELECT).order('created_at')
  );
  return rows.map((row) => ({
    id: row.id,
    chemicalId: row.chemical_id,
    name: row.chemical?.name || '',
    lotNo: row.lot_no || '',
    qty: num(row.qty),
    unit: row.unit || '',
    minQty: num(row.min_qty),
    unitCost: num(row.unit_cost),
    expiresOn: row.expires_on,
    licenseNo: row.chemical?.license_no || '',
    licenseUntil: row.chemical?.license_until || null
  }));
}

/**
 * Recent stock movements, newest first.
 *
 * @param {number} limit
 * @returns {Promise<object[]>}
 */
export async function fetchStockTransactions(limit = 20) {
  const rows = await run(
    supabase
      .from('inventory_transactions')
      .select('id, item_id, type, qty, unit, occurred_at, notes, item:inventory_items(chemical_id, chemical:chemicals(name))')
      .order('occurred_at', { ascending: false })
      .limit(limit)
  );
  return rows.map((row) => ({
    id: row.id,
    itemId: row.item_id,
    chemicalId: row.item?.chemical_id || '',
    name: row.item?.chemical?.name || '',
    type: row.type,
    qty: num(row.qty),
    unit: row.unit || '',
    at: row.occurred_at,
    notes: row.notes || ''
  }));
}

/**
 * Record a chemical application against a work order.
 *
 * Goes through record_chemical_usage(), which writes the usage, the stock
 * movement and the balance in one transaction — see the migration header for
 * why three separate calls would be worse than the local-only behaviour it
 * replaces.
 *
 * @param {{workOrderId: string, chemicalId: string, quantity: number,
 *   unit: string, area?: string, notes?: string}} input
 * @returns {Promise<object>}
 */
export async function recordChemicalUsage(input) {
  const row = await run(
    supabase.rpc('record_chemical_usage', {
      p_work_order: input.workOrderId,
      p_chemical: input.chemicalId,
      p_quantity: input.quantity,
      p_unit: input.unit,
      p_area: input.area || '',
      p_notes: input.notes || ''
    })
  );
  return Array.isArray(row) ? row[0] : row;
}

/**
 * Take stock in against an existing item.
 *
 * @param {{itemId: string, qty: number, notes?: string}} input
 * @returns {Promise<object>}
 */
export async function restockInventory(input) {
  const row = await run(
    supabase.rpc('restock_inventory', {
      p_item: input.itemId,
      p_qty: input.qty,
      p_notes: input.notes || ''
    })
  );
  return Array.isArray(row) ? row[0] : row;
}

/**
 * Take stock in, creating the lot if it is new.
 *
 * A refill under a lot number the org does not hold yet is a *new* stock item,
 * not a top-up of an existing one — lots carry their own expiry and cost, and
 * merging them would lose both. The new row is created at zero and the
 * quantity then goes through restock_inventory(), so the balance and the stock
 * movement always come from the same atomic write rather than from two.
 *
 * @param {{orgId: string, chemicalId: string, lotNo: string, qty: number,
 *   unit: string, unitCost?: number, minQty?: number, expiresOn?: string,
 *   notes?: string}} input
 * @returns {Promise<object>}
 */
export async function addStock(input) {
  const existing = await run(
    supabase
      .from('inventory_items')
      .select('id')
      .eq('chemical_id', input.chemicalId)
      .eq('lot_no', input.lotNo)
      .maybeSingle()
  );

  let itemId = existing?.id;
  if (!itemId) {
    const created = await run(
      supabase
        .from('inventory_items')
        .insert({
          org_id: input.orgId,
          chemical_id: input.chemicalId,
          lot_no: input.lotNo,
          qty: 0,
          unit: input.unit,
          min_qty: input.minQty || 0,
          unit_cost: input.unitCost === undefined ? null : input.unitCost,
          expires_on: input.expiresOn || null
        })
        .select('id')
        .single()
    );
    itemId = created.id;
  }

  return restockInventory({ itemId, qty: input.qty, notes: input.notes });
}

/**
 * Chemical applications recorded against one work order.
 *
 * The task panel needs these for a job still in progress, which the completed-
 * visit history (repo/visits.js) does not cover.
 *
 * @param {string} workOrderId
 * @returns {Promise<object[]>}
 */
export async function fetchUsageForWorkOrder(workOrderId) {
  const rows = await run(
    supabase
      .from('chemical_usages')
      .select('id, quantity, unit, area_desc, applied_at, notes, chemical:chemicals(id, name)')
      .eq('work_order_id', workOrderId)
      .order('applied_at', { ascending: false })
  );
  return rows.map((row) => ({
    id: row.id,
    chemicalId: row.chemical?.id || '',
    name: row.chemical?.name || '',
    quantity: num(row.quantity),
    unit: row.unit || '',
    area: row.area_desc || '',
    notes: row.notes || '',
    at: row.applied_at
  }));
}

/**
 * Register a product the org is licensed to apply.
 *
 * No RPC here: `chem_admin_write` already restricts this to an admin of the
 * owning org, so a plain insert is checked by the same policy an RPC would
 * have had to re-implement. The guard the RPCs exist for — several writes that
 * must succeed or fail together — does not apply to a single row.
 *
 * @param {{orgId: string, name: string, activeIngredient?: string,
 *   licenseNo?: string, licenseUntil?: string, targetPests?: string[],
 *   unit?: string}} input
 * @returns {Promise<object>}
 */
export async function createChemical(input) {
  const row = await run(
    supabase
      .from('chemicals')
      .insert({
        org_id: input.orgId,
        name: input.name,
        active_ingredient: input.activeIngredient || null,
        license_no: input.licenseNo || null,
        // An empty date input must become NULL, not ''. Postgres rejects ''
        // for a date column, and the error it returns names the column rather
        // than the field the operator left blank.
        license_until: input.licenseUntil || null,
        target_pests: input.targetPests && input.targetPests.length ? input.targetPests : null,
        unit: input.unit || 'lt'
      })
      .select(CHEMICAL_SELECT)
      .single()
  );
  return row;
}

/**
 * Retire a product from the picker without deleting it.
 *
 * Deleting is wrong: `chemical_usages` references the product, and those rows
 * are the biyosidal record of what was applied on a customer's premises. The
 * flag takes it out of circulation and leaves the history intact.
 *
 * @param {string} chemicalId
 * @returns {Promise<void>}
 */
export async function deactivateChemical(chemicalId) {
  await run(supabase.from('chemicals').update({ is_active: false }).eq('id', chemicalId));
}

/**
 * Chemical applications recorded at one facility, newest first.
 *
 * The facility page used to read `site.chemicalsUsed`, a per-site array that
 * only ever held seeded rows. Applications are recorded against a work order,
 * and the work order carries the site, so the facility's own record is a
 * query — not a second copy that has to be kept in step.
 *
 * @param {string} siteId
 * @returns {Promise<object[]>}
 */
export async function fetchUsageForSite(siteId) {
  const rows = await run(
    supabase
      .from('chemical_usages')
      .select(`
        id, quantity, unit, area_desc, applied_at, notes,
        chemical:chemicals(id, name, active_ingredient, license_no),
        technician:technicians(full_name),
        work_order:work_orders(code)
      `)
      .eq('site_id', siteId)
      .order('applied_at', { ascending: false })
  );
  return rows.map((row) => ({
    id: row.id,
    chemicalId: row.chemical?.id || '',
    name: row.chemical?.name || '',
    activeIngredient: row.chemical?.active_ingredient || '',
    licenseNo: row.chemical?.license_no || '',
    quantity: num(row.quantity),
    unit: row.unit || '',
    area: row.area_desc || '',
    notes: row.notes || '',
    tech: row.technician?.full_name || '',
    workOrderCode: row.work_order?.code || '',
    at: row.applied_at
  }));
}

const MSDS_BUCKET = 'msds';

/**
 * Attach a safety data sheet to a product.
 *
 * `chemicals.msds_path` existed from the start with no bucket behind it, so the
 * facility document library had nothing to show and said so. Uploading and
 * recording the path are two calls; the upload goes first, because a path
 * recorded against a file that failed to upload is worse than a file with no
 * path — the first lies to an auditor, the second is merely an orphan.
 *
 * @param {{orgId: string, chemicalId: string, file: File}} input
 * @returns {Promise<string>} the stored path
 */
export async function uploadMsds(input) {
  const name = input.file.name || 'msds.pdf';
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : 'pdf';
  const path = `${input.orgId}/${input.chemicalId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from(MSDS_BUCKET).upload(path, input.file, {
    contentType: input.file.type || 'application/pdf',
    upsert: false
  });
  if (error) throw new Error(error.message);

  await run(
    supabase.from('chemicals').update({ msds_path: path }).eq('id', input.chemicalId)
  );
  return path;
}

/**
 * A short-lived URL for a stored safety data sheet. The bucket is private, so
 * a link cannot address the object directly.
 *
 * @param {string} path
 * @param {number} expiresIn seconds
 * @returns {Promise<string|null>}
 */
export async function signedMsdsUrl(path, expiresIn = 3600) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(MSDS_BUCKET).createSignedUrl(path, expiresIn);
  if (error) {
    console.error('[repellent] MSDS baglantisi alinamadi', error);
    return null;
  }
  return data?.signedUrl || null;
}
