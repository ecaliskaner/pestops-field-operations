// Finance view: invoice ledger + profitability (existing), plus auto-irsaliye
// and invoice-from-completed-visits (Phase 4-1 / 4-3).
//
// The billing figures are computed deterministically in data/billing.js from
// the seeded visit history, so document numbers and totals repeat exactly on a
// demo re-run. This module renders them and wires the print / CSV actions;
// documents print through printElement() from ui/export.js.

import { $, esc } from '../core/dom.js';
import { state } from '../core/state.js';
import { $$, toast } from '../core/dom.js';
import { save } from '../core/state.js';
import { getMonths, getVisits, technicianStats } from '../data/history.js';
import {
  billableGroups, groupFor, invoiceFromGroup, irsaliyeFromVisit, irsaliyeNo
} from '../data/billing.js';
import { printElement, downloadCSV } from '../ui/export.js';
import { stackedBarChart, mountChart } from '../ui/charts.js';

const tl = (n) => `₺${Number(n || 0).toLocaleString('tr-TR')}`;
const marginColor = (m) => (m < 0 ? 'var(--red)' : m < 50 ? 'var(--amber)' : 'var(--green)');

export function renderFinance() {
  const tbody = $('#finInvoicesTableBody');
  if (!tbody) return;
  if (!state.invoices) state.invoices = [];

  // Custom filter checking
  const activeFilterBtn = $('#financeInvoiceFilter .filter-btn.active');
  const filter = activeFilterBtn ? activeFilterBtn.dataset.invoiceFilter : 'all';

  const filteredInvoices = state.invoices.filter(inv => {
    if (filter === 'paid') return inv.status === 'paid';
    if (filter === 'pending') return inv.status === 'sent' || inv.status === 'draft';
    return true;
  });

  // Calculate metrics
  const totalRevenue = state.invoices.filter(inv => inv.status !== 'draft').reduce((sum, inv) => sum + inv.amount, 0);
  const totalCost = state.invoices.filter(inv => inv.status !== 'draft').reduce((sum, inv) => sum + (inv.laborCost + inv.chemicalCost), 0);
  const netMargin = totalRevenue > 0 ? Math.round(((totalRevenue - totalCost) / totalRevenue) * 100) : 0;
  const draftCount = state.invoices.filter(inv => inv.status === 'draft').length;
  const paidCount = state.invoices.filter(inv => inv.status === 'paid').length;

  $('#finTotalRevenue').textContent = `₺${totalRevenue.toLocaleString('tr-TR')}`;
  $('#finTotalCost').textContent = `₺${totalCost.toLocaleString('tr-TR')}`;
  $('#finNetMargin').textContent = `${netMargin}%`;
  $('#finPendingInvoices').textContent = `${draftCount} Taslak / ${paidCount} Ödenmiş`;

  // Draw Invoice Rows
  tbody.innerHTML = filteredInvoices.map(inv => {
    const isPaid = inv.status === 'paid';
    const isDraft = inv.status === 'draft';
    const statusClass = isPaid ? 'healthy' : (isDraft ? 'warning' : 'blue');
    const statusText = isPaid ? 'Ödendi' : (isDraft ? 'Taslak' : 'Gönderildi');

    let actionBtn = '';
    if (isDraft) {
      actionBtn = `<button class="text-btn send-invoice-btn" data-invoice-id="${inv.id}" style="padding:0; font-size:10px; font-weight:700; color:var(--blue);">Gönder ✈</button>`;
    } else if (inv.status === 'sent') {
      actionBtn = `<button class="text-btn pay-invoice-btn" data-invoice-id="${inv.id}" style="padding:0; font-size:10px; font-weight:700; color:var(--green);">Öde 💸</button>`;
    } else {
      actionBtn = `<span style="color:var(--muted); font-size:10px;">Tamamlandı</span>`;
    }
    // Generated invoices carry line items, so offer a view/print action too.
    if (inv.generated) {
      actionBtn = `<button class="text-btn view-invoice-btn" data-invoice-id="${inv.id}" style="padding:0; font-size:10px; font-weight:700; color:var(--violet);">Görüntüle ▤</button> ${actionBtn}`;
    }

    return `
      <tr>
        <td><b>${inv.id}</b></td>
        <td><b>${inv.company}</b><br><small class="text-muted">${inv.name}</small></td>
        <td><small>${inv.date}</small></td>
        <td><b>₺${inv.amount.toLocaleString('tr-TR')}</b></td>
        <td><small class="text-muted">₺${(inv.laborCost + inv.chemicalCost).toLocaleString('tr-TR')}</small></td>
        <td style="font-weight:700; color:${inv.margin < 50 ? 'var(--red)' : 'var(--green)'};">${inv.margin}%</td>
        <td><span class="status-chip ${statusClass}">${statusText}</span></td>
        <td>${actionBtn}</td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="8" class="empty" style="text-align:center;">Eşleşen fatura kaydı bulunmuyor.</td></tr>';

  // Draw Profitability Margin Bar lists for each site
  const marginContainer = $('#finProfitabilityDistribution');
  if (marginContainer) {
    marginContainer.innerHTML = state.sites.map(s => {
      // Calculate avg margin for this site
      const siteInvs = state.invoices.filter(i => i.siteId === s.id);
      let avgMargin = 0;
      let costText = 'Hizmet maliyeti yok';
      if (siteInvs.length > 0) {
        const sumMargin = siteInvs.reduce((sum, i) => sum + i.margin, 0);
        avgMargin = Math.round(sumMargin / siteInvs.length);
        const sumCost = siteInvs.reduce((sum, i) => sum + (i.laborCost + i.chemicalCost), 0);
        costText = `Ort. Maliyet: ₺${Math.round(sumCost / siteInvs.length)}`;
      } else {
        // Fallback calculations using monthlyPrice
        if (s.contract) {
          avgMargin = 75; // typical default
          costText = `Ort. Maliyet: ₺${Math.round(s.contract.monthlyPrice * 0.25)}`;
        }
      }

      const barColor = avgMargin >= 65 ? 'var(--green)' : (avgMargin >= 40 ? 'var(--amber)' : 'var(--red)');

      return `
        <div style="background:var(--soft); padding:10px; border:1px solid var(--line); border-radius:6px;">
          <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:4px;">
            <b>${s.company}</b>
            <span style="font-weight:700; color:${barColor};">${avgMargin}% Kâr</span>
          </div>
          <div style="height:6px; background:#e4e4e7; border-radius:3px; overflow:hidden;">
            <div style="height:100%; width:${Math.max(0, avgMargin)}%; background:${barColor}; border-radius:3px;"></div>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:9px; color:var(--muted); margin-top:2px;">
            <span>Aylık Fatura: ₺${s.contract ? s.contract.monthlyPrice.toLocaleString('tr-TR') : '—'}</span>
            <span>${costText}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  renderBillableVisits();
  renderTechEfficiency();
}

/* ------------------------------ travel-vs-on-site labour cost (task 4-2) */
//
// The same technicianStats() the team view charts, priced. On-site hours are
// productive (billable) labour; travel hours are paid but unbillable — the
// "windshield cost" a route optimiser is trying to shrink. Rates come from the
// seed (state.techRates, ₺/hour); everything is derived from the fixed history,
// so the figures repeat exactly on a demo re-run.

function techEfficiencyRows() {
  const rates = state.techRates || {};
  return technicianStats().map((t) => {
    const rate = rates[t.tech] || 150;
    const onSiteHrs = t.onSiteMin / 60;
    const travelHrs = t.travelMin / 60;
    const util = Math.round((t.onSiteMin / (t.onSiteMin + t.travelMin)) * 100);
    return {
      tech: t.tech,
      visits: t.visits,
      rate,
      onSiteHrs: Math.round(onSiteHrs),
      travelHrs: Math.round(travelHrs),
      onSiteCost: Math.round(onSiteHrs * rate),
      travelCost: Math.round(travelHrs * rate),
      travelPerVisit: Math.round((travelHrs * rate) / t.visits),
      util
    };
  });
}

function renderTechEfficiency() {
  const body = $('#finEfficiencyBody');
  if (!body) return;

  const rows = techEfficiencyRows();
  const totalTravelCost = rows.reduce((s, r) => s + r.travelCost, 0);
  const totalOnSiteCost = rows.reduce((s, r) => s + r.onSiteCost, 0);
  const totalVisits = rows.reduce((s, r) => s + r.visits, 0);
  const labourTotal = totalTravelCost + totalOnSiteCost;
  const windshieldPct = labourTotal ? Math.round((totalTravelCost / labourTotal) * 100) : 0;

  const tableRows = rows.map((r) => `
    <tr${r.tech === state.selectedTech ? ' class="fin-eff-sel"' : ''}>
      <td><b>${esc(r.tech)}</b><br><small class="text-muted">₺${r.rate}/sa · %${r.util} verimli</small></td>
      <td>${r.visits}</td>
      <td>${r.onSiteHrs} sa<br><small class="text-muted">${tl(r.onSiteCost)}</small></td>
      <td>${r.travelHrs} sa<br><small class="text-muted">${tl(r.travelCost)}</small></td>
      <td style="font-weight:700; color:${r.util >= 70 ? 'var(--green)' : r.util >= 60 ? 'var(--amber)' : 'var(--red)'};">${tl(r.travelPerVisit)}</td>
    </tr>`).join('');

  body.innerHTML = `
    <div class="fin-eff-metrics">
      <div class="fin-eff-metric"><span>Yol (windshield) maliyeti</span><strong style="color:var(--red);">${tl(totalTravelCost)}</strong><small>işgücü bütçesinin %${esc(windshieldPct)}'i</small></div>
      <div class="fin-eff-metric"><span>Saha işgücü maliyeti</span><strong style="color:var(--green);">${tl(totalOnSiteCost)}</strong><small>faturalanabilir üretim</small></div>
      <div class="fin-eff-metric"><span>Ziyaret başı yol maliyeti</span><strong>${tl(totalVisits ? Math.round(totalTravelCost / totalVisits) : 0)}</strong><small>${esc(totalVisits)} ziyaret ortalaması</small></div>
    </div>
    <div class="fin-eff-chart-wrap"><div id="finEfficiencyChart" class="fin-eff-chart"></div></div>
    <div class="table-panel" style="border:1px solid var(--line); border-radius:8px; overflow:auto; margin-top:12px;">
      <table>
        <thead><tr><th>Teknisyen</th><th>Ziyaret</th><th>Saha (üretken)</th><th>Yol (windshield)</th><th>Yol/ziyaret</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
    <p class="text-muted" style="font-size:10px; margin-top:8px;">Yol süresi ödenen ama faturalanamayan işgücüdür; rota optimizasyonu bu maliyeti düşürmeyi hedefler. Rakamlar 12 aylık gerçek ziyaret geçmişinden türetilir.</p>`;

  mountChart('#finEfficiencyChart', stackedBarChart({
    labels: rows.map((r) => r.tech.split(' ')[0]),
    series: [
      { name: 'Saha maliyeti', values: rows.map((r) => r.onSiteCost), color: '#10b981' },
      { name: 'Yol maliyeti', values: rows.map((r) => r.travelCost), color: '#ef4444' }
    ],
    height: 220,
    format: (n) => tl(n)
  }));
}

/* -------------------------------------------- billable visits panel (4-1/4-3) */

// Months that actually have visits, newest first, for the period selector.
function billableMonths() {
  const keys = new Set(billableGroups().map((g) => g.monthKey));
  return getMonths().filter((m) => keys.has(m.key)).reverse();
}

function renderBillableVisits() {
  const body = $('#billableGroupsBody');
  if (!body) return;

  const select = $('#billingMonth');
  const months = billableMonths();
  if (select && !select.options.length) {
    select.innerHTML = months.map((m) => `<option value="${m.key}">${m.label} ${m.year}</option>`).join('');
  }
  const monthKey = (select && select.value) || (months[0] && months[0].key);
  // Property assignment (not addEventListener) so a re-render never stacks handlers.
  if (select) select.onchange = renderBillableVisits;

  const groups = billableGroups().filter((g) => g.monthKey === monthKey);
  if (!groups.length) {
    body.innerHTML = '<tr><td colspan="8" class="empty" style="text-align:center;">Bu dönemde faturalandırılabilir ziyaret yok.</td></tr>';
    return;
  }

  body.innerHTML = groups.map((g) => {
    const invoiced = (state.invoices || []).some((inv) => inv.id === g.invoiceNo);
    const invoiceCell = invoiced
      ? `<span class="status-chip healthy" title="${esc(g.invoiceNo)}">Kesildi</span>`
      : `<button class="text-btn gen-invoice-btn" data-site="${g.siteId}" data-month="${g.monthKey}" style="padding:0; font-size:10px; font-weight:700; color:var(--blue);">Fatura Oluştur ＋</button>`;
    return `
      <tr>
        <td><b>${esc(g.siteName)}</b><br><small class="text-muted">${esc(g.company)}${g.synthetic ? ' · sim. sözleşme' : ''}</small></td>
        <td><b>${g.visitCount}</b></td>
        <td>${g.chemApps}</td>
        <td><b>${tl(g.revenue)}</b></td>
        <td><small class="text-muted">${tl(g.cost)}</small></td>
        <td style="font-weight:700; color:${marginColor(g.margin)};">${g.margin}%</td>
        <td>${invoiceCell}</td>
        <td><button class="text-btn view-irsaliyeler-btn" data-site="${g.siteId}" data-month="${g.monthKey}" style="padding:0; font-size:10px; font-weight:700; color:var(--violet);">İrsaliyeler ▸</button></td>
      </tr>
    `;
  }).join('');
}

/* ------------------------------------------------------- document builders */

function docHeader(title, no, dateStr, extra = '') {
  return `
    <header class="bill-head">
      <div>
        <h2 class="bill-title">${esc(title)}</h2>
        <p class="bill-sub">Repellent Enterprise Operations · Zararlı Yönetimi Hizmetleri</p>
      </div>
      <div class="bill-brand">
        <strong>REPELLENT</strong>
        <div class="bill-no">${esc(no)}</div>
        <div class="bill-date">${esc(dateStr)}</div>
        ${extra}
      </div>
    </header>`;
}

function partyBlock(party) {
  return `
    <div class="bill-parties">
      <div>
        <p class="overline">DÜZENLEYEN</p>
        <b>Repellent Operasyon A.Ş.</b>
        <div class="bill-party-line">Esentepe Mah. Kore Şehitleri Cad. No:12, İstanbul</div>
        <div class="bill-party-line">Mecidiyeköy VD · 9876543210</div>
      </div>
      <div>
        <p class="overline">MÜŞTERİ</p>
        <b>${esc(party.company)}</b>
        <div class="bill-party-line">${esc(party.name || party.siteName)} · ${esc(party.city || '')}</div>
        <div class="bill-party-line">${esc(party.taxOffice || (party.contract && party.contract.taxOffice) || '—')} · ${esc(party.taxNo || (party.contract && party.contract.taxNo) || '—')}</div>
      </div>
    </div>`;
}

// 4-1 — printable delivery note (sevk irsaliyesi) for one visit's chemicals.
export function buildIrsaliyeDoc(visit) {
  const irs = irsaliyeFromVisit(visit);
  const rows = irs.lines.map((l) => `
    <tr>
      <td>${l.no}</td>
      <td><b>${esc(l.name)}</b><br><small class="text-muted">${esc(l.chemicalId)}</small></td>
      <td>${l.quantity} ${esc(l.unit)}</td>
      <td>${esc(l.area)}</td>
    </tr>`).join('');

  const syntheticNote = irs.synthetic
    ? '<p class="bill-note">Vergi bilgileri demo amaçlı simüle edilmiştir.</p>' : '';

  return `
    <div class="bill-doc" id="billingDoc">
      ${docHeader('Sevk İrsaliyesi', irs.no, irs.date,
        `<div class="bill-ref">Ziyaret: ${esc(irs.visitId)}</div>`)}
      ${partyBlock({ company: irs.company, name: irs.siteName, city: irs.city, taxOffice: irs.taxOffice, taxNo: irs.taxNo })}
      <p class="overline" style="margin-top:6px;">TESLİM EDİLEN / UYGULANAN ÜRÜNLER</p>
      ${irs.hasChemicals ? `
      <table class="bill-table">
        <thead><tr><th>#</th><th>Ürün</th><th>Miktar</th><th>Uygulama Alanı</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>` : '<p class="bill-empty">Bu ziyarette teslim edilen ürün kaydı bulunmuyor.</p>'}
      <div class="bill-signs">
        <div class="bill-sign"><div class="bill-sign-pad"><span>${esc(irs.tech)}</span></div><div class="bill-sign-role">Teslim Eden — Teknisyen</div></div>
        <div class="bill-sign"><div class="bill-sign-pad"></div><div class="bill-sign-role">Teslim Alan — Müşteri Yetkilisi</div></div>
      </div>
      <p class="bill-legal">Bu sevk irsaliyesi 213 Sayılı VUK kapsamında düzenlenmiştir. Malın fiili sevk tarihi belge tarihi ile aynıdır.</p>
      ${syntheticNote}
    </div>`;
}

// 4-3 — printable consolidated invoice from a site+month's completed visits.
export function buildInvoiceDoc(inv) {
  const rows = inv.lineItems.map((l) => `
    <tr>
      <td><b>${esc(l.date)}</b><br><small class="text-muted">${esc(l.visitId)}</small></td>
      <td>${esc(l.visitTypeName)}<br><small class="text-muted">${esc(l.billType)}</small></td>
      <td>${esc(l.tech)}</td>
      <td>${l.irsaliyeNo ? `<small>${esc(l.irsaliyeNo)}</small>` : '<small class="text-muted">—</small>'}</td>
      <td class="num"><small class="text-muted">${tl(l.cost)}</small></td>
      <td class="num" style="color:${marginColor(l.margin)}; font-weight:700;">${l.margin}%</td>
      <td class="num"><b>${tl(l.amount)}</b></td>
    </tr>`).join('');

  const syntheticNote = inv.synthetic
    ? '<p class="bill-note">Sözleşme ve vergi bilgileri demo amaçlı simüle edilmiştir.</p>' : '';

  return `
    <div class="bill-doc" id="billingDoc">
      ${docHeader('Hizmet Faturası', inv.id, inv.date,
        `<div class="bill-ref">Dönem: ${esc(inv.monthLabel)}</div>`)}
      ${partyBlock(inv)}
      <p class="overline" style="margin-top:6px;">HİZMET KALEMLERİ · ${inv.lineItems.length} ZİYARET</p>
      <table class="bill-table">
        <thead>
          <tr><th>Tarih</th><th>Hizmet</th><th>Teknisyen</th><th>İrsaliye</th><th class="num">Maliyet</th><th class="num">Marj</th><th class="num">Tutar</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="bill-totals">
        <div class="bill-totals-box">
          <div><span>Ara Toplam</span><b>${tl(inv.subtotal)}</b></div>
          <div><span>KDV (%${Math.round(inv.kdvRate * 100)})</span><b>${tl(inv.kdv)}</b></div>
          <div class="bill-grand"><span>Genel Toplam</span><b>${tl(inv.total)}</b></div>
          <div class="bill-margin-line"><span>Konsolide Kâr Marjı</span><b style="color:${marginColor(inv.margin)};">${inv.margin}%</b></div>
        </div>
      </div>

      ${inv.irsaliyeRefs.length ? `<p class="bill-note">Bağlı irsaliyeler: ${inv.irsaliyeRefs.map(esc).join(', ')}</p>` : ''}
      <p class="bill-legal">Bu fatura, dönem içinde tamamlanan ve her biri tesiste ilk QR okutması ile başlatılıp çift dijital imza ile kapatılan ziyaretlerden otomatik derlenmiştir.</p>
      ${syntheticNote}
    </div>`;
}

/* -------------------------------------------------------------- doc modal */

function openBillingDoc(html, title, actions) {
  const content = $('#modalContent');
  const modalEl = $('#modal');
  if (!content || !modalEl) return;
  content.innerHTML = `
    <div class="bill-doc-shell">
      ${html}
      <footer class="bill-doc-actions no-print">
        <button class="secondary-btn" data-billing-action="close">Kapat</button>
        ${actions}
        <button class="primary-btn" data-billing-action="print">🖨 PDF olarak yazdır</button>
      </footer>
    </div>`;
  content.dataset.billingTitle = title;
  modalEl.classList.remove('hidden');
}

/* --------------------------------------------------------------- handlers */

export function billingClicks(e) {
  // Generate a consolidated invoice from a site+month group.
  const gen = e.target.closest('.gen-invoice-btn');
  if (gen) {
    const group = groupFor(gen.dataset.site, gen.dataset.month);
    if (!group) return true;
    const invoice = invoiceFromGroup(group);
    if (!state.invoices) state.invoices = [];
    if (!state.invoices.some((i) => i.id === invoice.id)) {
      // Newest first, above the two seed invoices.
      state.invoices.unshift(invoice);
      save();
    }
    renderFinance();
    openBillingDoc(buildInvoiceDoc(invoice), invoice.id,
      `<button class="secondary-btn" data-billing-action="csv-invoice" data-id="${invoice.id}">⭳ CSV indir</button>`);
    toast(`Fatura ${invoice.id} oluşturuldu (${invoice.lineItems.length} ziyaret).`);
    return true;
  }

  // View an already-generated invoice from the ledger.
  const view = e.target.closest('.view-invoice-btn');
  if (view) {
    const invoice = (state.invoices || []).find((i) => i.id === view.dataset.invoiceId);
    if (invoice && invoice.lineItems) {
      openBillingDoc(buildInvoiceDoc(invoice), invoice.id,
        `<button class="secondary-btn" data-billing-action="csv-invoice" data-id="${invoice.id}">⭳ CSV indir</button>`);
    }
    return true;
  }

  // Show the delivery notes (irsaliye) for a site+month.
  const irsList = e.target.closest('.view-irsaliyeler-btn');
  if (irsList) {
    const group = groupFor(irsList.dataset.site, irsList.dataset.month);
    const withChem = group && group.visits.filter((v) => v.chemicals.length);
    if (!withChem || !withChem.length) { toast('Bu dönemde irsaliye gerektiren kimyasal uygulama yok.'); return true; }
    openIrsaliyePicker(withChem);
    return true;
  }

  // Open a single irsaliye from the picker.
  const oneIrs = e.target.closest('.open-irsaliye-btn');
  if (oneIrs) {
    const visit = getVisits().find((v) => v.id === oneIrs.dataset.visit);
    if (visit) openBillingDoc(buildIrsaliyeDoc(visit), irsaliyeNo(visit), '');
    return true;
  }

  // Modal actions.
  const action = e.target.closest('[data-billing-action]');
  if (action) {
    const what = action.dataset.billingAction;
    if (what === 'close') { $('#modal').classList.add('hidden'); return true; }
    if (what === 'print') {
      printElement('#billingDoc', { title: $('#modalContent').dataset.billingTitle || 'belge' });
      return true;
    }
    if (what === 'csv-invoice') {
      const invoice = (state.invoices || []).find((i) => i.id === action.dataset.id);
      if (invoice) exportInvoiceCSV(invoice);
      return true;
    }
    return false;
  }
  return false;
}

// A small chooser when a month has several delivery notes.
function openIrsaliyePicker(visits) {
  const rows = visits.map((v) => `
    <button class="irs-pick-row open-irsaliye-btn" data-visit="${v.id}">
      <span class="irs-pick-id"><b>${esc(irsaliyeNo(v))}</b><small>${esc(v.date)} · ${esc(v.tech)}</small></span>
      <span class="status-chip blue">${v.chemicals.length} ürün</span>
      <span class="irs-pick-open">Aç →</span>
    </button>`).join('');
  const content = $('#modalContent');
  content.innerHTML = `
    <div class="bill-doc-shell">
      <h2 style="margin:0 0 4px; font-size:16px;">Sevk İrsaliyeleri</h2>
      <p class="text-muted" style="font-size:11px; margin-bottom:12px;">${esc(visits[0].company)} · ${esc(visits.length)} irsaliye</p>
      <div class="irs-pick-list">${rows}</div>
      <footer class="bill-doc-actions no-print" style="margin-top:14px;">
        <button class="secondary-btn" data-billing-action="close">Kapat</button>
      </footer>
    </div>`;
  $('#modal').classList.remove('hidden');
}

function exportInvoiceCSV(invoice) {
  downloadCSV(`${invoice.id}.csv`, invoice.lineItems, [
    { key: 'date', label: 'Tarih' },
    { key: 'visitId', label: 'Ziyaret' },
    { key: 'visitTypeName', label: 'Hizmet' },
    { key: 'billType', label: 'Fatura Tipi' },
    { key: 'tech', label: 'Teknisyen' },
    { key: 'irsaliyeNo', label: 'İrsaliye', format: (v) => v || '—' },
    { key: 'laborCost', label: 'İşçilik' },
    { key: 'chemicalCost', label: 'Kimyasal' },
    { key: 'cost', label: 'Toplam Maliyet' },
    { key: 'margin', label: 'Marj %' },
    { key: 'amount', label: 'Tutar' }
  ]);
}

export function invoiceActionClicks(e) {
    const sendInvoiceBtn = e.target.closest('.send-invoice-btn');
    if (sendInvoiceBtn) {
      const invId = sendInvoiceBtn.dataset.invoiceId;
      const inv = state.invoices.find(i => i.id === invId);
      if (inv) {
        inv.status = 'sent';
        save();
        renderFinance();
        toast(`Fatura ${invId} müşteriye başarıyla gönderildi.`);
      }
      return true;
    }

    const payInvoiceBtn = e.target.closest('.pay-invoice-btn');
    if (payInvoiceBtn) {
      const invId = payInvoiceBtn.dataset.invoiceId;
      const inv = state.invoices.find(i => i.id === invId);
      if (inv) {
        inv.status = 'paid';
        save();
        renderFinance();
        toast(`Fatura ${invId} ödendi olarak işaretlendi.`);
      }
      return true;
    }

    // Delete mobile chemical usage
  return false;
}

export function invoiceFilterClicks(e) {
    const invFilter = e.target.closest('[data-invoice-filter]');
    if (invFilter) {
      $$('[data-invoice-filter]').forEach(b => b.classList.toggle('active', b === invFilter));
      renderFinance();
      return true;
    }

    // File download trigger toast
  return false;
}
