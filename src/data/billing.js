// Turning completed visits into billable periods and printable documents.
//
// Pure computation — no DOM, no writes. finance.js renders what this returns
// and repo/billing.js is what actually issues an invoice.
//
// Three inventions used to live here and are gone:
//
//   contractFor()      gave any site without a contract a made-up monthly price
//                      (2500 + stations * 350) "so every location is billable".
//                      Invented revenue produces an invented margin, and the
//                      margin is what a pricing decision gets made on.
//   syntheticTaxNo()   generated a ten-digit VKN from a hash of the site id, so
//                      a site with no contract would still print a tax number on
//                      its delivery note. A sevk irsaliyesi is a document under
//                      VUK 213.
//   invoiceNo()        assigned the invoice number client-side. Two admins
//                      issuing at once would have produced the same number for
//                      different documents; issue_invoice() assigns it now.
//
// What replaces them is the refusal. A site with no contract is not billable
// and says so; a visit whose technician has no rate on file makes the period's
// cost incomplete, and an incomplete cost shows no margin rather than a
// flattering one. Understating cost overstates margin, which is the direction
// that actually loses money.

import { getVisits } from './history.js';
import { state } from '../core/state.js';
import { visitTypes } from './catalog.js';

// Visit types the monthly contract already covers. Emergency call-outs (AC) and
// extra services (ES) are billed on top at their own contracted price.
const COVERED = new Set(['RZ', 'IZ', 'TZ', '3G', 'DZ', 'ILK']);
const visitTypeName = (code) => (visitTypes.find((v) => v.code === code) || {}).name || code;

const MONTH_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const monthLabel = (key) => {
  const [y, m] = key.split('-');
  return `${MONTH_SHORT[Number(m) - 1]} ${y}`;
};

const pad = (n) => String(n).padStart(2, '0');

/** First and last calendar day of a `YYYY-MM` key, as ISO dates. */
export function monthBounds(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(last)}` };
}

/**
 * The site's current contract, or null.
 *
 * Null is a real answer and the caller must handle it: without a contracted
 * price there is no revenue figure that is not made up.
 */
export function contractFor(site) {
  return (site && site.contract) || null;
}

const siteById = (id) => (state.sites || []).find((s) => s.id === id);

// Technician hourly rates come from technician_rates (repo/billing.js). A name
// with no rate returns null, not an average — see the header.
const rateFor = (tech) => {
  const rates = state.techRates || {};
  const r = rates[tech];
  return typeof r === 'number' && r > 0 ? r : null;
};

/**
 * Cost, revenue and margin for a single completed visit.
 *
 * `share` is the visit's slice of the monthly contract fee, so a month of
 * routine visits sums back to one monthly contract price; emergency and extra
 * visits bill their own contracted fee on top.
 *
 * Returns `laborCost: null` when the technician has no rate on file, and the
 * caller propagates that as an incomplete cost.
 */
export function visitBilling(visit, share, contract) {
  const chemicalCost = visit.chemicals.reduce((s, c) => s + (c.cost || 0), 0);
  const rate = rateFor(visit.tech);
  // Labour = on-site time at full rate + travel at 60%. Windshield time is real
  // cost but not fully billable productivity.
  const laborCost = rate === null
    ? null
    : Math.round(((visit.onSiteMin + visit.travelMin * 0.6) / 60) * rate);
  const cost = laborCost === null ? null : laborCost + chemicalCost;

  let revenue;
  let billType;
  if (visit.visitType === 'AC') {
    revenue = contract ? contract.emergencyCallPrice : null;
    billType = 'Acil Çağrı';
  } else if (visit.visitType === 'ES') {
    revenue = contract ? contract.extraVisitPrice : null;
    billType = 'Ek Servis';
  } else {
    revenue = share === null ? null : Math.round(share);
    billType = 'Sözleşme Kapsamı';
  }
  if (typeof revenue !== 'number') revenue = null;

  const margin = revenue !== null && revenue > 0 && cost !== null
    ? Math.round(((revenue - cost) / revenue) * 1000) / 10
    : null;

  return { chemicalCost, laborCost, cost, revenue, margin, billType, rateMissing: rate === null };
}

/* ------------------------------------------------------------------ grouping */

/** Completed visits grouped by site + month — the unit an invoice is cut from. */
export function billableGroups() {
  const groups = new Map();
  for (const visit of getVisits()) {
    const gkey = `${visit.siteId}|${visit.monthKey}`;
    if (!groups.has(gkey)) {
      groups.set(gkey, {
        siteId: visit.siteId, company: visit.company, siteName: visit.siteName,
        city: visit.city, monthKey: visit.monthKey,
        monthLabel: monthLabel(visit.monthKey), visits: []
      });
    }
    groups.get(gkey).visits.push(visit);
  }
  return [...groups.values()].map(summariseGroup)
    .sort((a, b) => (b.monthKey.localeCompare(a.monthKey)) || String(a.siteId).localeCompare(String(b.siteId)));
}

function summariseGroup(group) {
  const site = siteById(group.siteId);
  const contract = contractFor(site);
  const covered = group.visits.filter((v) => COVERED.has(v.visitType)).length;
  const share = contract && typeof contract.monthlyPrice === 'number'
    ? contract.monthlyPrice / Math.max(1, covered)
    : null;

  const lines = group.visits.map((visit) => ({ visit, ...visitBilling(visit, share, contract) }));

  // A single missing part makes the whole sum unknown; adding up what is
  // present would silently report a smaller number as if it were the total.
  const sumOrNull = (pick) => lines.reduce(
    (acc, l) => (acc === null || pick(l) === null ? null : acc + pick(l)), 0
  );

  const revenue = sumOrNull((l) => l.revenue);
  const laborCost = sumOrNull((l) => l.laborCost);
  const chemicalCost = lines.reduce((s, l) => s + l.chemicalCost, 0);
  const cost = laborCost === null ? null : laborCost + chemicalCost;
  const chemApps = group.visits.reduce((s, v) => s + v.chemicals.length, 0);

  // Why a period cannot be invoiced, in the order the operator should fix it.
  const blockers = [];
  if (!contract) blockers.push('Sözleşme tanımlı değil');
  else if (typeof contract.monthlyPrice !== 'number') blockers.push('Sözleşmede aylık bedel yok');
  if (revenue === null && contract) blockers.push('Ziyaret tipi için sözleşme bedeli tanımlı değil');

  const costMissingFor = [...new Set(lines.filter((l) => l.rateMissing).map((l) => l.visit.tech))];
  const bounds = monthBounds(group.monthKey);

  return {
    ...group, lines, contract,
    periodStart: bounds.start,
    periodEnd: bounds.end,
    visitCount: group.visits.length,
    chemApps,
    revenue, cost, chemicalCost, laborCost,
    margin: revenue !== null && revenue > 0 && cost !== null
      ? Math.round(((revenue - cost) / revenue) * 1000) / 10
      : null,
    billable: blockers.length === 0 && revenue !== null && revenue > 0,
    blockers,
    // An incomplete cost is shown as incomplete. The margin is suppressed
    // rather than computed against a labour cost that is missing a technician.
    costComplete: cost !== null,
    costMissingFor,
    date: group.visits[group.visits.length - 1].date
  };
}

export function groupFor(siteId, monthKey) {
  return billableGroups().find((g) => g.siteId === siteId && g.monthKey === monthKey) || null;
}

/* -------------------------------------------------------- document assembly */

const KDV_RATE = 0.20;

/**
 * The printable view-model for an invoice that has been issued.
 *
 * Takes the stored invoice (repo/billing.js) and the group it was cut from, so
 * the totals on the document are the ones the database holds and the line items
 * are the visits behind them. Where the two could disagree the stored figure
 * wins: it is what the customer was actually billed.
 */
export function invoiceDocument(invoice, group, organization) {
  const lineItems = (group ? group.lines : []).map((l) => ({
    visitId: l.visit.id,
    date: l.visit.date,
    visitType: l.visit.visitType,
    visitTypeName: visitTypeName(l.visit.visitType),
    tech: l.visit.tech,
    billType: l.billType,
    chemicals: l.visit.chemicals.length,
    deliveryRef: l.visit.chemicals.length ? l.visit.id : null,
    laborCost: l.laborCost,
    chemicalCost: l.chemicalCost,
    cost: l.cost,
    amount: l.revenue,
    margin: l.margin
  }));

  const subtotal = invoice.amount;
  const rate = invoice.taxRate ? invoice.taxRate / 100 : KDV_RATE;
  const kdv = Math.round(subtotal * rate);

  return {
    ...invoice,
    organization,
    monthLabel: group ? group.monthLabel : '',
    lineItems,
    subtotal,
    kdvRate: rate,
    kdv,
    total: subtotal + kdv,
    deliveryRefs: lineItems.filter((l) => l.deliveryRef).map((l) => l.deliveryRef)
  };
}

/**
 * Delivery-note view-model for a single visit's chemical usage.
 *
 * The serial used to be generated here as `IRS-2026-000046`, from the digits of
 * the visit id. A sevk irsaliyesi serial comes from a registered series, not
 * from the client — so the document is referenced by the work order code, which
 * is a real org-unique identifier, and the GİB serial is left to the e-İrsaliye
 * integrator in the same way invoices already leave `einvoice_no` to it.
 */
export function deliveryNoteFor(visit, site, organization) {
  const contract = contractFor(site);
  return {
    ref: visit.id,
    date: visit.date,
    visitId: visit.id,
    tech: visit.tech,
    company: visit.company,
    siteName: visit.siteName,
    city: visit.city,
    organization,
    // Straight off the contract; blank when the operator has not filled it in.
    taxOffice: (contract && contract.taxOffice) || '',
    taxNo: (contract && contract.taxNo) || '',
    lines: visit.chemicals.map((c, i) => ({
      no: i + 1,
      name: c.name,
      quantity: c.quantity,
      unit: c.unit,
      area: c.area,
      chemicalId: c.chemicalId
    })),
    hasChemicals: visit.chemicals.length > 0
  };
}
