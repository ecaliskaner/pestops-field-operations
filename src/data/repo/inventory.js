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
  'id, name, active_ingredient, license_no, license_until, target_pests, unit, is_active';

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
    unit: row.unit || 'lt'
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
