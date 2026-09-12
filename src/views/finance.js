// Finance: the invoice ledger, profitability, and the printable documents.
//
// The ledger was browser state. Two seeded invoices, and "Gönder" / "Öde" set a
// field on a local object and called save() — an invoice marked paid was paid
// in one browser and nowhere else. It now reads the invoices table and writes
// through issue_invoice() / set_invoice_status().
//
// Two inventions are worth naming because they printed or displayed as fact:
//
//   The issuer block hardcoded "Repellent Operasyon A.Ş.", a street address and
//   the tax number 9876543210 onto every invoice and delivery note, for every
//   customer of the product. It comes from the organizations row now.
//
//   The profitability panel fell back to `avgMargin = 75; // typical default`
//   for any site with no invoices, and drew it in the same bar, the same colour
//   and the same type as a computed one. A site with nothing to compute from
//   now says so.

import { $, $$, esc, toast } from '../core/dom.js';
import { state, replaceInvoices } from '../core/state.js';
import { getMonths, getVisits, technicianStats } from '../data/history.js';
import {
  billableGroups, groupFor, invoiceDocument, deliveryNoteFor, contractFor
} from '../data/billing.js';
import { fetchInvoices, issueInvoice, setInvoiceStatus } from '../data/repo/billing.js';
import { printElement, downloadCSV } from '../ui/export.js';
import { stackedBarChart, mountChart } from '../ui/charts.js';

const tl = (n) => `₺${Number(n || 0).toLocaleString('tr-TR')}`;
// A null margin is not zero and must never be coloured as if it were a bad one.
const marginColor = (m) => (m === null ? 'var(--muted)' : m < 0 ? 'var(--red)' : m < 50 ? 'var(--amber)' : 'var(--green)');
const marginText = (m) => (m === null ? '—' : `${m}%`);
const money = (n) => (n === null || n === undefined ? '—' : tl(n));

const STATUS_LABEL = {
  draft: 'Taslak', sent: 'Gönderildi', paid: 'Ödendi',
  overdue: 'Gecikmiş', cancelled: 'İptal'
};
const STATUS_CLASS = {
  draft: 'warning', sent: 'blue', paid: 'healthy',
  overdue: 'critical', cancelled: 'secondary'
};

const siteById = (id) => (state.sites || []).find((s) => s.id === id);

export function renderFinance() {
  const tbody = $('#finInvoicesTableBody');
  if (!tbody) return;
  if (!state.invoices) state.invoices = [];

  const activeFilterBtn = $('#financeInvoiceFilter .filter-btn.active');
  const filter = activeFilterBtn ? activeFilterBtn.dataset.invoiceFilter : 'all';

  const invoices = state.invoices;
  const filtered = invoices.filter((inv) => {
    if (filter === 'paid') return inv.status === 'paid';
    if (filter === 'pending') return inv.status === 'sent' || inv.status === 'draft' || inv.status === 'overdue';
    return true;
  });

  // A draft has not been billed to anyone and a cancelled invoice never will
  // be, so neither counts towards revenue.
  const counted = invoices.filter((inv) => inv.status !== 'draft' && inv.status !== 'cancelled');
  const totalRevenue = counted.reduce((sum, inv) => sum + inv.amount, 0);
  const totalCost = counted.reduce((sum, inv) => sum + inv.laborCost + inv.chemicalCost, 0);
  const netMargin = totalRevenue > 0 ? Math.round(((totalRevenue - totalCost) / totalRevenue) * 100) : 0;
  const draftCount = invoices.filter((inv) => inv.status === 'draft').length;
  const paidCount = invoices.filter((inv) => inv.status === 'paid').length;

  $('#finTotalRevenue').textContent = tl(totalRevenue);
  $('#finTotalCost').textContent = tl(totalCost);
  $('#finNetMargin').textContent = totalRevenue > 0 ? `${netMargin}%` : '—';
  $('#finPendingInvoices').textContent = `${draftCount} Taslak / ${paidCount} Ödenmiş`;

  tbody.innerHTML = filtered.map((inv) => {
    const cost = inv.laborCost + inv.chemicalCost;
    let actionBtn;
    if (inv.status === 'draft') {
      actionBtn = `<button class="text-btn send-invoice-btn" data-invoice-id="${esc(inv.dbId)}" style="padding:0; font-size:10px; font-weight:700; color:var(--blue);">Gönder ✈</button>`;
    } else if (inv.status === 'sent' || inv.status === 'overdue') {
      actionBtn = `<button class="text-btn pay-invoice-btn" data-invoice-id="${esc(inv.dbId)}" style="padding:0; font-size:10px; font-weight:700; color:var(--green);">Öde 💸</button>`;
    } else {
      actionBtn = '<span style="color:var(--muted); font-size:10px;">Tamamlandı</span>';
    }
    const viewBtn = `<button class="text-btn view-invoice-btn" data-invoice-id="${esc(inv.code)}" style="padding:0; font-size:10px; font-weight:700; color:var(--violet);">Görüntüle ▤</button>`;

    return `
      <tr>
        <td><b>${esc(inv.code)}</b></td>
        <td><b>${esc(inv.company)}</b><br><small class="text-muted">${esc(inv.name)}</small></td>
        <td><small>${esc(inv.date)}</small></td>
        <td><b>${tl(inv.amount)}</b></td>
        <td><small class="text-muted">${cost ? tl(cost) : '—'}</small></td>
        <td style="font-weight:700; color:${marginColor(cost ? inv.margin : null)};">${cost ? `${inv.margin}%` : '—'}</td>
        <td><span class="status-chip ${STATUS_CLASS[inv.status] || 'secondary'}">${STATUS_LABEL[inv.status] || esc(inv.status)}</span></td>
        <td>${viewBtn} ${actionBtn}</td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="8" class="empty" style="text-align:center;">Eşleşen fatura kaydı bulunmuyor.</td></tr>';

  renderProfitability();
  renderBillableVisits();
  renderTechEfficiency();
}

/* --------------------------------------------------------- profitability */

// Per-site margin, computed only where there is something to compute from.
//
// The old fallback assigned `avgMargin = 75` to any site without invoices and
// drew it as a full green bar next to real ones. A site nobody has invoiced has
// no margin — that is information, and replacing it with a plausible number
// removes the one signal that would prompt someone to go and bill it.
function renderProfitability() {
  const container = $('#finProfitabilityDistribution');
  if (!container) return;

  const sites = state.sites || [];
  if (!sites.length) {
    container.innerHTML = '<p class="text-muted" style="font-size:12px;">Portföyde tesis bulunmuyor.</p>';
    return;
  }

  container.innerHTML = sites.map((s) => {
    const siteInvs = (state.invoices || []).filter(
      (i) => i.siteId === s.id && i.status !== 'draft' && i.status !== 'cancelled'
    );
    const contract = contractFor(s);
    const monthly = contract && typeof contract.monthlyPrice === 'number' ? contract.monthlyPrice : null;

    if (!siteInvs.length) {
      const why = monthly === null ? 'Sözleşme tanımlı değil' : 'Kesilmiş fatura yok';
      return `
        <div style="background:var(--soft); padding:10px; border:1px solid var(--line); border-radius:6px;">
          <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:4px;">
            <b>${esc(s.company)}</b>
            <span style="font-weight:700; color:var(--muted);">— Kâr</span>
          </div>
          <div style="height:6px; background:#e4e4e7; border-radius:3px;"></div>
          <div style="display:flex; justify-content:space-between; font-size:9px; color:var(--muted); margin-top:2px;">
            <span>Aylık Bedel: ${monthly === null ? '—' : tl(monthly)}</span>
            <span>${esc(why)}</span>
          </div>
        </div>`;
    }

    const revenue = siteInvs.reduce((sum, i) => sum + i.amount, 0);
    const cost = siteInvs.reduce((sum, i) => sum + i.laborCost + i.chemicalCost, 0);
    const avgMargin = revenue > 0 ? Math.round(((revenue - cost) / revenue) * 100) : 0;
    const barColor = avgMargin >= 65 ? 'var(--green)' : (avgMargin >= 40 ? 'var(--amber)' : 'var(--red)');

    return `
      <div style="background:var(--soft); padding:10px; border:1px solid var(--line); border-radius:6px;">
        <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:4px;">
          <b>${esc(s.company)}</b>
          <span style="font-weight:700; color:${barColor};">${avgMargin}% Kâr</span>
        </div>
        <div style="height:6px; background:#e4e4e7; border-radius:3px; overflow:hidden;">
          <div style="height:100%; width:${Math.max(0, Math.min(100, avgMargin))}%; background:${barColor}; border-radius:3px;"></div>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:9px; color:var(--muted); margin-top:2px;">
          <span>Aylık Bedel: ${monthly === null ? '—' : tl(monthly)}</span>
          <span>Ort. Maliyet: ${tl(Math.round(cost / siteInvs.length))}</span>
        </div>
      </div>`;
  }).join('');
}

/* ------------------------------ travel-vs-on-site labour cost (task 4-2) */
//
// The same technicianStats() the team view charts, priced from technician_rates.
// On-site hours are productive (billable) labour; travel hours are paid but
// unbillable — the "windshield cost" a route optimiser is trying to shrink.
// A technician with no rate on file is listed with no cost rather than an
// invented one, and left out of the totals.

function techEfficiencyRows() {
  const rates = state.techRates || {};
  return technicianStats().map((t) => {
    const rate = typeof rates[t.tech] === 'number' && rates[t.tech] > 0 ? rates[t.tech] : null;
    const onSiteHrs = t.onSiteMin / 60;
    const travelHrs = t.travelMin / 60;
    const total = t.onSiteMin + t.travelMin;
    return {
      tech: t.tech,
      visits: t.visits,
      rate,
      onSiteHrs: Math.round(onSiteHrs),
      travelHrs: Math.round(travelHrs),
      onSiteCost: rate === null ? null : Math.round(onSiteHrs * rate),
      travelCost: rate === null ? null : Math.round(travelHrs * rate),
      travelPerVisit: rate === null || !t.visits ? null : Math.round((travelHrs * rate) / t.visits),
      util: total ? Math.round((t.onSiteMin / total) * 100) : 0
    };
  });
}

function renderTechEfficiency() {
  const body = $('#finEfficiencyBody');
  if (!body) return;

  const rows = techEfficiencyRows();
  if (!rows.length) {
    body.innerHTML = '<p class="text-muted" style="font-size:12px;">Tamamlanmış ziyaret bulunmadığı için işgücü maliyeti hesaplanamıyor.</p>';
    return;
  }

  const priced = rows.filter((r) => r.rate !== null);
  const missing = rows.filter((r) => r.rate === null);
  const totalTravelCost = priced.reduce((s, r) => s + r.travelCost, 0);
  const totalOnSiteCost = priced.reduce((s, r) => s + r.onSiteCost, 0);
  const totalVisits = priced.reduce((s, r) => s + r.visits, 0);
  const labourTotal = totalTravelCost + totalOnSiteCost;
  const windshieldPct = labourTotal ? Math.round((totalTravelCost / labourTotal) * 100) : 0;

  const tableRows = rows.map((r) => `
    <tr${r.tech === state.selectedTech ? ' class="fin-eff-sel"' : ''}>
      <td><b>${esc(r.tech)}</b><br><small class="text-muted">${r.rate === null ? 'Saatlik ücret tanımlı değil' : `₺${r.rate}/sa · %${r.util} verimli`}</small></td>
      <td>${r.visits}</td>
      <td>${r.onSiteHrs} sa<br><small class="text-muted">${money(r.onSiteCost)}</small></td>
      <td>${r.travelHrs} sa<br><small class="text-muted">${money(r.travelCost)}</small></td>
      <td style="font-weight:700; color:${r.travelPerVisit === null ? 'var(--muted)' : r.util >= 70 ? 'var(--green)' : r.util >= 60 ? 'var(--amber)' : 'var(--red)'};">${money(r.travelPerVisit)}</td>
    </tr>`).join('');

  const missingNote = missing.length
    ? `<p class="text-muted" style="font-size:10px; margin-top:6px;">${esc(missing.map((r) => r.tech).join(', '))} için saatlik ücret tanımlı olmadığından toplamlara dahil edilmedi.</p>`
    : '';

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
    ${missingNote}
    <p class="text-muted" style="font-size:10px; margin-top:8px;">Yol süresi ödenen ama faturalanamayan işgücüdür; rota optimizasyonu bu maliyeti düşürmeyi hedefler. Rakamlar tamamlanmış ziyaretlerin denetim zaman damgalarından türetilir.</p>`;

  if (priced.length) {
    mountChart('#finEfficiencyChart', stackedBarChart({
      labels: priced.map((r) => r.tech.split(' ')[0]),
      series: [
        { name: 'Saha maliyeti', values: priced.map((r) => r.onSiteCost), color: '#10b981' },
        { name: 'Yol maliyeti', values: priced.map((r) => r.travelCost), color: '#ef4444' }
      ],
      height: 220,
      format: (n) => tl(n)
    }));
  }
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
  if (select) {
    const keep = select.value;
    select.innerHTML = months.map((m) => `<option value="${esc(m.key)}">${esc(m.label)} ${esc(m.year)}</option>`).join('');
    if (keep && months.some((m) => m.key === keep)) select.value = keep;
    // Property assignment (not addEventListener) so a re-render never stacks handlers.
    select.onchange = renderBillableVisits;
  }
  const monthKey = (select && select.value) || (months[0] && months[0].key);

  const groups = monthKey ? billableGroups().filter((g) => g.monthKey === monthKey) : [];
  if (!groups.length) {
    body.innerHTML = '<tr><td colspan="8" class="empty" style="text-align:center;">Bu dönemde faturalandırılabilir ziyaret yok.</td></tr>';
    return;
  }

  body.innerHTML = groups.map((g) => {
    const invoiced = (state.invoices || []).find(
      (inv) => inv.siteId === g.siteId && inv.periodStart === g.periodStart && inv.status !== 'cancelled'
    );

    let invoiceCell;
    if (invoiced) {
      invoiceCell = `<span class="status-chip healthy" title="${esc(invoiced.code)}">Kesildi</span>`;
    } else if (!g.billable) {
      // Naming the blocker turns a dead button into a task the operator can do.
      invoiceCell = `<span class="status-chip warning" title="${esc(g.blockers.join(' · '))}">${esc(g.blockers[0] || 'Faturalanamaz')}</span>`;
    } else {
      invoiceCell = `<button class="text-btn gen-invoice-btn" data-site="${esc(g.siteId)}" data-month="${esc(g.monthKey)}" style="padding:0; font-size:10px; font-weight:700; color:var(--blue);">Fatura Oluştur ＋</button>`;
    }

    const costCell = g.costComplete
      ? `<small class="text-muted">${tl(g.cost)}</small>`
      : `<small class="text-muted" title="${esc(g.costMissingFor.join(', '))} için saatlik ücret tanımlı değil">${tl(g.chemicalCost)} + işçilik ?</small>`;

    return `
      <tr>
        <td><b>${esc(g.siteName)}</b><br><small class="text-muted">${esc(g.company)}</small></td>
        <td><b>${g.visitCount}</b></td>
        <td>${g.chemApps}</td>
        <td><b>${money(g.revenue)}</b></td>
        <td>${costCell}</td>
        <td style="font-weight:700; color:${marginColor(g.margin)};">${marginText(g.margin)}</td>
        <td>${invoiceCell}</td>
        <td><button class="text-btn view-irsaliyeler-btn" data-site="${esc(g.siteId)}" data-month="${esc(g.monthKey)}" style="padding:0; font-size:10px; font-weight:700; color:var(--violet);">İrsaliyeler ▸</button></td>
      </tr>
    `;
  }).join('');
}

/* ------------------------------------------------------- document builders */

function docHeader(title, no, dateStr, extra = '') {
  const org = state.organization;
  return `
    <header class="bill-head">
      <div>
        <h2 class="bill-title">${esc(title)}</h2>
        <p class="bill-sub">${esc(org?.name || '')}</p>
      </div>
      <div class="bill-brand">
        <strong>${esc((org?.name || '').toUpperCase())}</strong>
        <div class="bill-no">${esc(no)}</div>
        <div class="bill-date">${esc(dateStr)}</div>
        ${extra}
      </div>
    </header>`;
}

// The issuing party. Everything here used to be a hardcoded string; a company
// that has not filled its details in now prints a gap, which is a prompt to go
// and fill them in rather than a false statement on a tax document.
function partyBlock(party) {
  const org = state.organization;
  const orgLines = org
    ? `<b>${esc(org.name)}</b>
       <div class="bill-party-line">${org.address ? esc(org.address) : '<span style="color:var(--muted);">Adres tanımlanmamış</span>'}</div>
       <div class="bill-party-line">${org.taxOffice || org.taxNo
         ? `${esc(org.taxOffice)} · ${esc(org.taxNo)}`
         : '<span style="color:var(--muted);">Vergi bilgisi tanımlanmamış</span>'}</div>`
    : '<b style="color:var(--muted);">Kurum bilgisi yüklenemedi</b>';

  return `
    <div class="bill-parties">
      <div>
        <p class="overline">DÜZENLEYEN</p>
        ${orgLines}
      </div>
      <div>
        <p class="overline">MÜŞTERİ</p>
        <b>${esc(party.company)}</b>
        <div class="bill-party-line">${esc(party.name || party.siteName)} · ${esc(party.city || '')}</div>
        <div class="bill-party-line">${party.taxOffice || party.taxNo
          ? `${esc(party.taxOffice)} · ${esc(party.taxNo)}`
          : '<span style="color:var(--muted);">Vergi bilgisi tanımlanmamış</span>'}</div>
      </div>
    </div>`;
}

// 4-1 — printable delivery note for one visit's chemicals.
export function buildDeliveryNoteDoc(visit) {
  const note = deliveryNoteFor(visit, siteById(visit.siteId), state.organization);
  const rows = note.lines.map((l) => `
    <tr>
      <td>${l.no}</td>
      <td><b>${esc(l.name)}</b></td>
      <td>${esc(l.quantity)} ${esc(l.unit)}</td>
      <td>${esc(l.area)}</td>
    </tr>`).join('');

  return `
    <div class="bill-doc" id="billingDoc">
      ${docHeader('Sevk İrsaliyesi', note.ref, note.date,
        `<div class="bill-ref">Ziyaret: ${esc(note.visitId)}</div>`)}
      ${partyBlock({ company: note.company, name: note.siteName, city: note.city, taxOffice: note.taxOffice, taxNo: note.taxNo })}
      <p class="overline" style="margin-top:6px;">TESLİM EDİLEN / UYGULANAN ÜRÜNLER</p>
      ${note.hasChemicals ? `
      <table class="bill-table">
        <thead><tr><th>#</th><th>Ürün</th><th>Miktar</th><th>Uygulama Alanı</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>` : '<p class="bill-empty">Bu ziyarette teslim edilen ürün kaydı bulunmuyor.</p>'}
      <div class="bill-signs">
        <div class="bill-sign"><div class="bill-sign-pad"><span>${esc(note.tech)}</span></div><div class="bill-sign-role">Teslim Eden — Teknisyen</div></div>
        <div class="bill-sign"><div class="bill-sign-pad"></div><div class="bill-sign-role">Teslim Alan — Müşteri Yetkilisi</div></div>
      </div>
      <p class="bill-legal">Bu belge 213 Sayılı VUK kapsamındaki sevk irsaliyesinin işletme kopyasıdır. Resmi irsaliye seri ve sıra numarası e-İrsaliye entegratörü tarafından gönderim anında atanır.</p>
    </div>`;
}

// 4-3 — printable consolidated invoice, built from the stored invoice row.
export function buildInvoiceDoc(doc) {
  const rows = doc.lineItems.map((l) => `
    <tr>
      <td><b>${esc(l.date)}</b><br><small class="text-muted">${esc(l.visitId)}</small></td>
      <td>${esc(l.visitTypeName)}<br><small class="text-muted">${esc(l.billType)}</small></td>
      <td>${esc(l.tech)}</td>
      <td>${l.deliveryRef ? `<small>${esc(l.deliveryRef)}</small>` : '<small class="text-muted">—</small>'}</td>
      <td class="num"><small class="text-muted">${money(l.cost)}</small></td>
      <td class="num" style="color:${marginColor(l.margin)}; font-weight:700;">${marginText(l.margin)}</td>
      <td class="num"><b>${money(l.amount)}</b></td>
    </tr>`).join('');

  return `
    <div class="bill-doc" id="billingDoc">
      ${docHeader('Hizmet Faturası', doc.code, doc.date,
        doc.monthLabel ? `<div class="bill-ref">Dönem: ${esc(doc.monthLabel)}</div>` : '')}
      ${partyBlock(doc)}
      <p class="overline" style="margin-top:6px;">HİZMET KALEMLERİ${doc.lineItems.length ? ` · ${doc.lineItems.length} ZİYARET` : ''}</p>
      ${doc.lineItems.length ? `
      <table class="bill-table">
        <thead>
          <tr><th>Tarih</th><th>Hizmet</th><th>Teknisyen</th><th>İrsaliye</th><th class="num">Maliyet</th><th class="num">Marj</th><th class="num">Tutar</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`
      : '<p class="bill-empty">Bu faturanın dönemine ait ziyaret dökümü bulunamadı.</p>'}

      <div class="bill-totals">
        <div class="bill-totals-box">
          <div><span>Ara Toplam</span><b>${tl(doc.subtotal)}</b></div>
          <div><span>KDV (%${Math.round(doc.kdvRate * 100)})</span><b>${tl(doc.kdv)}</b></div>
          <div class="bill-grand"><span>Genel Toplam</span><b>${tl(doc.total)}</b></div>
        </div>
      </div>

      ${doc.deliveryRefs.length ? `<p class="bill-note">Bağlı irsaliyeler: ${doc.deliveryRefs.map(esc).join(', ')}</p>` : ''}
      <p class="bill-legal">Bu fatura, dönem içinde tamamlanan ve her biri tesiste ilk QR okutması ile başlatılan ziyaretlerden derlenmiştir.</p>
      ${doc.einvoiceNo ? `<p class="bill-note">e-Fatura No: ${esc(doc.einvoiceNo)}</p>` : ''}
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

// The document for an invoice in the ledger: stored totals, plus the visits of
// its period for the line items.
function documentFor(invoice) {
  const monthKey = invoice.periodStart ? invoice.periodStart.slice(0, 7) : null;
  const group = monthKey ? groupFor(invoice.siteId, monthKey) : null;
  return invoiceDocument(invoice, group, state.organization);
}

/* --------------------------------------------------------------- handlers */

export function billingClicks(e) {
  // Issue a consolidated invoice for a site+month.
  const gen = e.target.closest('.gen-invoice-btn');
  if (gen) {
    const group = groupFor(gen.dataset.site, gen.dataset.month);
    if (!group) return true;
    if (!group.billable) { toast(group.blockers[0] || 'Bu dönem faturalandırılamaz.'); return true; }

    gen.disabled = true;
    issueInvoice({
      siteId: group.siteId,
      periodStart: group.periodStart,
      periodEnd: group.periodEnd,
      amount: group.revenue,
      // A period whose labour cost is incomplete still bills the right amount;
      // the cost is recorded as what is actually known rather than padded out.
      laborCost: group.laborCost === null ? 0 : group.laborCost,
      chemicalCost: group.chemicalCost,
      description: `${group.monthLabel} · ${group.visitCount} ziyaret konsolide faturası`
    })
      .then(() => refreshInvoices())
      .then(() => {
        const invoice = (state.invoices || []).find(
          (i) => i.siteId === group.siteId && i.periodStart === group.periodStart && i.status !== 'cancelled'
        );
        if (invoice) {
          openBillingDoc(buildInvoiceDoc(documentFor(invoice)), invoice.code,
            `<button class="secondary-btn" data-billing-action="csv-invoice" data-id="${esc(invoice.code)}">⭳ CSV indir</button>`);
          toast(`Fatura ${invoice.code} oluşturuldu (${group.visitCount} ziyaret).`);
        }
      })
      .catch((err) => toast(err.message || 'Fatura oluşturulamadı.'))
      .finally(() => { gen.disabled = false; });
    return true;
  }

  // View an invoice from the ledger.
  const view = e.target.closest('.view-invoice-btn');
  if (view) {
    const invoice = (state.invoices || []).find((i) => i.code === view.dataset.invoiceId);
    if (invoice) {
      openBillingDoc(buildInvoiceDoc(documentFor(invoice)), invoice.code,
        `<button class="secondary-btn" data-billing-action="csv-invoice" data-id="${esc(invoice.code)}">⭳ CSV indir</button>`);
    }
    return true;
  }

  // Delivery notes for a site+month.
  const irsList = e.target.closest('.view-irsaliyeler-btn');
  if (irsList) {
    const group = groupFor(irsList.dataset.site, irsList.dataset.month);
    const withChem = group && group.visits.filter((v) => v.chemicals.length);
    if (!withChem || !withChem.length) { toast('Bu dönemde irsaliye gerektiren kimyasal uygulama yok.'); return true; }
    openDeliveryNotePicker(withChem);
    return true;
  }

  const oneIrs = e.target.closest('.open-irsaliye-btn');
  if (oneIrs) {
    const visit = getVisits().find((v) => v.id === oneIrs.dataset.visit);
    if (visit) openBillingDoc(buildDeliveryNoteDoc(visit), visit.id, '');
    return true;
  }

  const action = e.target.closest('[data-billing-action]');
  if (action) {
    const what = action.dataset.billingAction;
    if (what === 'close') { $('#modal').classList.add('hidden'); return true; }
    if (what === 'print') {
      printElement('#billingDoc', { title: $('#modalContent').dataset.billingTitle || 'belge' });
      return true;
    }
    if (what === 'csv-invoice') {
      const invoice = (state.invoices || []).find((i) => i.code === action.dataset.id);
      if (invoice) exportInvoiceCSV(documentFor(invoice));
      return true;
    }
    return false;
  }
  return false;
}

// A small chooser when a month has several delivery notes.
function openDeliveryNotePicker(visits) {
  const rows = visits.map((v) => `
    <button class="irs-pick-row open-irsaliye-btn" data-visit="${esc(v.id)}">
      <span class="irs-pick-id"><b>${esc(v.id)}</b><small>${esc(v.date)} · ${esc(v.tech)}</small></span>
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

function exportInvoiceCSV(doc) {
  downloadCSV(`${doc.code}.csv`, doc.lineItems, [
    { key: 'date', label: 'Tarih' },
    { key: 'visitId', label: 'Ziyaret' },
    { key: 'visitTypeName', label: 'Hizmet' },
    { key: 'billType', label: 'Fatura Tipi' },
    { key: 'tech', label: 'Teknisyen' },
    { key: 'deliveryRef', label: 'İrsaliye', format: (v) => v || '—' },
    { key: 'laborCost', label: 'İşçilik', format: (v) => (v === null ? 'tanımsız' : v) },
    { key: 'chemicalCost', label: 'Kimyasal' },
    { key: 'cost', label: 'Toplam Maliyet', format: (v) => (v === null ? 'tanımsız' : v) },
    { key: 'margin', label: 'Marj %', format: (v) => (v === null ? 'tanımsız' : v) },
    { key: 'amount', label: 'Tutar', format: (v) => (v === null ? 'tanımsız' : v) }
  ]);
}

/** Re-read the ledger after any write, so the table shows what was stored. */
export async function refreshInvoices() {
  try {
    replaceInvoices(await fetchInvoices());
  } catch (err) {
    console.error('[repellent] faturalar yenilenemedi', err);
  }
  renderFinance();
}

function moveInvoice(button, status, done) {
  button.disabled = true;
  setInvoiceStatus(button.dataset.invoiceId, status)
    .then(() => refreshInvoices())
    .then(() => toast(done))
    .catch((err) => toast(err.message || 'Fatura durumu güncellenemedi.'))
    .finally(() => { button.disabled = false; });
}

export function invoiceActionClicks(e) {
  const send = e.target.closest('.send-invoice-btn');
  if (send) {
    moveInvoice(send, 'sent', 'Fatura müşteriye gönderildi olarak işaretlendi.');
    return true;
  }

  const pay = e.target.closest('.pay-invoice-btn');
  if (pay) {
    moveInvoice(pay, 'paid', 'Fatura ödendi olarak işaretlendi.');
    return true;
  }

  return false;
}

export function invoiceFilterClicks(e) {
  const invFilter = e.target.closest('[data-invoice-filter]');
  if (invFilter) {
    $$('[data-invoice-filter]').forEach((b) => b.classList.toggle('active', b === invFilter));
    renderFinance();
    return true;
  }
  return false;
}
