// The real invoice ledger, the issuer's own identity, and technician rates.
//
// seed.js shipped two invoices (INV-1001, INV-1002) with invented amounts,
// costs and margins, and data/billing.js generated more on demand from
// synthetic contracts. "Gönder" and "Öde" set a field on the local object and
// called save(), so an invoice marked paid was paid in one browser and nowhere
// else.
//
// The issuer block is the part worth naming separately. Every printed invoice
// and delivery note carried a hardcoded "Repellent Operasyon A.Ş." with a
// street address and a tax number, and sites without a contract were given a
// deterministically generated ten-digit VKN so they would still print. A sevk
// irsaliyesi is a document under VUK 213; a fabricated tax number on one is not
// a placeholder. The issuer now comes from the organizations row, and a company
// that has not filled its tax details in prints a gap instead of an invention.

import { supabase, run } from '../../core/supabase.js';

const INVOICE_SELECT = `
  id, code, description, issued_on, due_on, period_start, period_end,
  amount, tax_rate, labor_cost, chemical_cost, status, paid_at,
  einvoice_no, customer:customers(id, name, tax_office, tax_no),
  site:sites(id, name, city)
`;

const num = (v) => (v === null || v === undefined ? 0 : Number(v));

const DAY_FMT = { day: '2-digit', month: 'short', year: 'numeric' };
const trDate = (iso) => (iso ? new Date(iso).toLocaleDateString('tr-TR', DAY_FMT) : '');

function mapInvoice(row) {
  const amount = num(row.amount);
  const laborCost = num(row.labor_cost);
  const chemicalCost = num(row.chemical_cost);
  const cost = laborCost + chemicalCost;
  return {
    // `id` stays the human code because the ledger, the filter buttons and the
    // printable document all key off it; the uuid rides along for writes.
    id: row.code,
    dbId: row.id,
    code: row.code,
    siteId: row.site?.id || '',
    company: row.customer?.name || '',
    name: row.site?.name || '',
    city: row.site?.city || '',
    taxOffice: row.customer?.tax_office || '',
    taxNo: row.customer?.tax_no || '',
    date: trDate(row.issued_on),
    issuedOn: row.issued_on,
    dueOn: row.due_on,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    amount,
    taxRate: num(row.tax_rate),
    laborCost,
    chemicalCost,
    // Derived, never stored: a margin field that can disagree with the amount
    // and the costs beside it is worse than no margin field.
    margin: amount > 0 ? Math.round(((amount - cost) / amount) * 1000) / 10 : 0,
    status: row.status,
    paidAt: row.paid_at,
    einvoiceNo: row.einvoice_no || '',
    description: row.description || ''
  };
}

/**
 * The invoice ledger, newest first.
 *
 * RLS decides the scope: an admin sees the org's invoices, a customer sees
 * their own and only once issued (drafts are internal). A technician sees none.
 *
 * @returns {Promise<object[]>}
 */
export async function fetchInvoices() {
  const rows = await run(
    supabase.from('invoices').select(INVOICE_SELECT).order('issued_on', { ascending: false })
  );
  return rows.map(mapInvoice);
}

/**
 * The signed-in user's own organization — the issuing party on every document.
 *
 * @returns {Promise<object|null>}
 */
export async function fetchOrganization() {
  const rows = await run(
    supabase
      .from('organizations')
      .select('id, name, tax_office, tax_no, address, phone, email, logo_url')
      .limit(1)
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    taxOffice: row.tax_office || '',
    taxNo: row.tax_no || '',
    address: row.address || '',
    phone: row.phone || '',
    email: row.email || '',
    logoUrl: row.logo_url || ''
  };
}

/**
 * Hourly rates by technician name, for the labour side of a visit's cost.
 *
 * Keyed by name because the visit history carries the technician's name, not
 * their id. A technician with no rate on file is left out rather than given a
 * portfolio average: an invented rate produces an invented margin, and the
 * margin is the number someone makes a pricing decision on.
 *
 * @returns {Promise<Record<string, number>>}
 */
export async function fetchTechnicianRates() {
  const rows = await run(
    supabase
      .from('technician_rates')
      .select('hourly_rate, valid_from, technician:technicians(full_name)')
      .order('valid_from', { ascending: false })
  );
  const byName = {};
  for (const row of rows) {
    const name = row.technician?.full_name;
    // Ordered newest first, so the first rate seen for a technician is current.
    if (!name || byName[name] !== undefined) continue;
    byName[name] = Number(row.hourly_rate);
  }
  return byName;
}

/**
 * Cut an invoice for one site and one period.
 *
 * Goes through issue_invoice(), which assigns the code, reads the customer off
 * the site and refuses a period that is already billed. None of those three can
 * be passed in — see the migration header.
 *
 * @param {{siteId: string, periodStart: string, periodEnd: string,
 *   amount: number, laborCost: number, chemicalCost: number,
 *   description?: string, dueDays?: number}} input
 * @returns {Promise<object>}
 */
export async function issueInvoice(input) {
  const row = await run(
    supabase.rpc('issue_invoice', {
      p_site: input.siteId,
      p_period_start: input.periodStart,
      p_period_end: input.periodEnd,
      p_amount: input.amount,
      p_labor_cost: input.laborCost,
      p_chemical_cost: input.chemicalCost,
      p_description: input.description || '',
      p_due_days: input.dueDays === undefined ? 30 : input.dueDays
    })
  );
  return Array.isArray(row) ? row[0] : row;
}

/**
 * Move an invoice through its lifecycle.
 *
 * The RPC enforces which transitions exist; `paid` is terminal, so nothing can
 * walk a settled invoice back to draft to be re-edited.
 *
 * @param {string} invoiceId uuid, not the human code
 * @param {'sent'|'paid'|'overdue'|'cancelled'} status
 * @returns {Promise<object>}
 */
export async function setInvoiceStatus(invoiceId, status) {
  const row = await run(
    supabase.rpc('set_invoice_status', { p_invoice: invoiceId, p_status: status })
  );
  return Array.isArray(row) ? row[0] : row;
}

/**
 * Update the issuing organization's own details.
 *
 * These print on every invoice and delivery note, so until now they could only
 * be set by someone with database access — which meant in practice they were
 * never set, and finance.js printed a hardcoded company instead.
 *
 * `org_admin_write` is an UPDATE-only policy scoped to the caller's own org, so
 * there is no id to pass and no way to edit another company's row.
 *
 * @param {{name: string, taxOffice?: string, taxNo?: string, address?: string,
 *   phone?: string, email?: string}} input
 * @returns {Promise<object>}
 */
export async function updateOrganization(input) {
  const rows = await run(
    supabase
      .from('organizations')
      .update({
        name: input.name,
        tax_office: input.taxOffice || null,
        tax_no: input.taxNo || null,
        address: input.address || null,
        phone: input.phone || null,
        email: input.email || null
      })
      .eq('id', input.id)
      .select('id, name, tax_office, tax_no, address, phone, email, logo_url')
  );
  const row = rows[0];
  // An update filtered out by RLS affects zero rows and does NOT raise — the
  // caller must be told nothing was written rather than shown a success toast.
  if (!row) throw new Error('Kurum bilgisi güncellenemedi — yönetici yetkisi gerekiyor.');
  return {
    id: row.id,
    name: row.name,
    taxOffice: row.tax_office || '',
    taxNo: row.tax_no || '',
    address: row.address || '',
    phone: row.phone || '',
    email: row.email || '',
    logoUrl: row.logo_url || ''
  };
}
