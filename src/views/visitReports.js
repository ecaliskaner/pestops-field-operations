// Visit-report board (task 7-1).
//
// The operational list the office actually works from: every completed visit as
// a numbered report (VR_…), filterable by visit type, date range, client and
// branch, with free-text search and a page-size cap — modelled on the reference
// system's own layout.
//
// Everything is read from the seeded history, so the board is the same 226
// visits the charts, invoices and reports are built from. Clicking a report
// number opens the existing printable service report rather than a second,
// divergent renderer.

import { $, $$, toast } from '../core/dom.js';
import { state, visibleSites } from '../core/state.js';
import { getVisits } from '../data/history.js';
import { visitTypes } from '../data/catalog.js';
import { downloadCSV } from '../ui/export.js';
import { openReport } from './reports.js';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const visitTypeName = (code) => (visitTypes.find((v) => v.code === code) || {}).name || code;

const MONTH_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

// Filter state for this view only — presentation state, so it stays local the
// same way insights.js keeps its chip selection.
const f = {
  visitType: '',
  start: '',
  finish: '',
  company: '',
  siteId: '',
  query: '',
  limit: 100
};

/* -------------------------------------------------------------- date helpers */

// History dates are display strings ("12 Tem 2026"); parse to a comparable
// number so a range filter can work without storing a second field.
function dateKey(dateStr) {
  const m = String(dateStr).match(/^(\d{1,2})\s+(\S+)\s+(\d{4})$/);
  if (!m) return 0;
  const month = MONTH_SHORT.indexOf(m[2]);
  if (month < 0) return 0;
  return Number(m[3]) * 10000 + (month + 1) * 100 + Number(m[1]);
}

// <input type="date"> gives YYYY-MM-DD.
const inputKey = (v) => (v ? Number(String(v).replace(/-/g, '')) : 0);

/* ------------------------------------------------------------------ filtering */

function scopedVisits() {
  const allowed = new Set(visibleSites().map((s) => s.id));
  let list = getVisits().filter((v) => allowed.has(v.siteId));

  // A technician's board is their own work.
  const user = state.currentUser;
  if (user && user.role === 'tech') {
    list = list.filter((v) => (v.team || [v.tech]).includes(user.name));
  }
  return list;
}

function filtered() {
  const from = inputKey(f.start);
  const to = inputKey(f.finish);
  const q = f.query.toLocaleLowerCase('tr');

  return scopedVisits()
    .filter((v) => {
      if (f.visitType && v.visitType !== f.visitType) return false;
      if (f.company && v.company !== f.company) return false;
      if (f.siteId && v.siteId !== f.siteId) return false;
      const k = dateKey(v.date);
      if (from && k < from) return false;
      if (to && k > to) return false;
      if (q) {
        const hay = `${v.reportNo} ${v.company} ${v.siteName} ${v.city} ${v.description} ${v.teamLabel} ${visitTypeName(v.visitType)}`
          .toLocaleLowerCase('tr');
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    // Newest first: the report someone just closed is the one being looked for.
    .sort((a, b) => dateKey(b.date) - dateKey(a.date) || b.arrival.localeCompare(a.arrival));
}

/* ------------------------------------------------------------------ rendering */

export function renderVisitReports() {
  const body = $('#vrTableBody');
  if (!body) return;

  populateFilterOptions();

  const rows = filtered();
  const shown = rows.slice(0, f.limit);

  body.innerHTML = shown.map((v) => `
    <tr>
      <td><button class="text-btn vr-no" data-vr-open="${esc(v.id)}">${esc(v.reportNo)}</button></td>
      <td>${esc(v.date)} ${esc(v.arrival)}</td>
      <td><b>${esc(v.company)}</b></td>
      <td>${esc(v.siteName)}</td>
      <td class="vr-desc">${esc(v.description || '')}</td>
      <td class="vr-team">${esc(v.teamLabel || v.tech)}</td>
      <td><span class="status-chip secondary vr-type">${esc(visitTypeName(v.visitType))}</span></td>
      <td>${v.totals.all > 0
        ? `<b style="color:var(--red)">${v.totals.all}</b>`
        : '<span style="color:var(--green)">—</span>'}</td>
    </tr>`).join('')
    || '<tr><td colspan="8" class="empty" style="text-align:center; padding:18px;">Filtrelerinize uyan ziyaret raporu bulunamadı.</td></tr>';

  const count = $('#vrResultCount');
  if (count) {
    count.textContent = rows.length > shown.length
      ? `${shown.length} / ${rows.length} kayıt gösteriliyor`
      : `${rows.length} kayıt`;
  }
}

// Client and branch selects are driven by what the current user can actually
// see, so a customer's board never lists another company.
function populateFilterOptions() {
  const sites = visibleSites();

  const clientSel = $('#vrFilterClient');
  if (clientSel && !clientSel.dataset.built) {
    const companies = [...new Set(sites.map((s) => s.company))].sort((a, b) => a.localeCompare(b, 'tr'));
    clientSel.innerHTML = '<option value="">Tüm müşteriler</option>'
      + companies.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    clientSel.dataset.built = '1';
  }

  // Branch list narrows to the selected client — the reference system's own
  // behaviour, and it keeps the list usable once there are many sites.
  const branchSel = $('#vrFilterBranch');
  if (branchSel) {
    const pool = f.company ? sites.filter((s) => s.company === f.company) : sites;
    const want = `${f.company}|${pool.length}`;
    if (branchSel.dataset.for !== want) {
      branchSel.innerHTML = '<option value="">Tüm şubeler</option>'
        + pool.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
      branchSel.dataset.for = want;
      branchSel.value = f.siteId;
    }
  }

  const typeSel = $('#vrFilterType');
  if (typeSel && !typeSel.dataset.built) {
    typeSel.innerHTML = '<option value="">Tüm ziyaret tipleri</option>'
      + visitTypes.map((v) => `<option value="${esc(v.code)}">${esc(v.name)}</option>`).join('');
    typeSel.dataset.built = '1';
  }
}

/* ------------------------------------------------------------------ handlers */

// Change/input events are wired once from app.js; this keeps the filter object
// and the DOM in step and repaints.
export function bindVisitReportFilters() {
  const on = (sel, evt, fn) => $(sel)?.addEventListener(evt, (e) => { fn(e.target.value); renderVisitReports(); });

  on('#vrFilterType', 'change', (v) => { f.visitType = v; });
  on('#vrFilterStart', 'change', (v) => { f.start = v; });
  on('#vrFilterFinish', 'change', (v) => { f.finish = v; });
  on('#vrFilterClient', 'change', (v) => { f.company = v; f.siteId = ''; });
  on('#vrFilterBranch', 'change', (v) => { f.siteId = v; });
  on('#vrSearch', 'input', (v) => { f.query = v; });
  on('#vrLimit', 'change', (v) => { f.limit = Number(v) || 100; });
}

export function visitReportClicks(e) {
  const open = e.target.closest('[data-vr-open]');
  if (open) {
    const visit = getVisits().find((v) => v.id === open.dataset.vrOpen);
    if (visit) openReport('visit', { siteId: visit.siteId, visit });
    return true;
  }

  if (e.target.closest('#vrClearFilters')) {
    f.visitType = ''; f.start = ''; f.finish = ''; f.company = ''; f.siteId = ''; f.query = '';
    ['#vrFilterType', '#vrFilterStart', '#vrFilterFinish', '#vrFilterClient', '#vrFilterBranch', '#vrSearch']
      .forEach((sel) => { const el = $(sel); if (el) el.value = ''; });
    const branch = $('#vrFilterBranch');
    if (branch) delete branch.dataset.for;
    renderVisitReports();
    toast('Filtreler temizlendi.');
    return true;
  }

  if (e.target.closest('#vrExportCsv')) {
    const rows = filtered().map((v) => ({
      reportNo: v.reportNo,
      date: v.date,
      time: v.arrival,
      company: v.company,
      siteName: v.siteName,
      city: v.city,
      description: v.description,
      team: v.teamLabel,
      visitType: visitTypeName(v.visitType),
      findings: v.totals.all,
      onSiteMin: v.onSiteMin
    }));
    if (!rows.length) { toast('Dışa aktarılacak kayıt yok.'); return true; }
    downloadCSV('ziyaret_raporlari.csv', rows, [
      { key: 'reportNo', label: 'Ziyaret Raporu' }, { key: 'date', label: 'Tarih' },
      { key: 'time', label: 'Saat' }, { key: 'company', label: 'Müşteri' },
      { key: 'siteName', label: 'Şube' }, { key: 'city', label: 'Şehir' },
      { key: 'description', label: 'Açıklama' }, { key: 'team', label: 'Personel / Ekip' },
      { key: 'visitType', label: 'Ziyaret Tipi' }, { key: 'findings', label: 'Bulgu' },
      { key: 'onSiteMin', label: 'Saha Süresi (dk)' }
    ]);
    return true;
  }

  return false;
}
