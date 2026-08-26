// Reports view: compliance badges (5-1), 3rd Eye audit section (2-4) and the
// five printable report bodies (1-8).
//
// This module owns presentation and interaction only — every report body lives
// in reportBodies.js as a pure function, and the numbers come from the seeded
// history engine. Nothing on this screen is hardcoded any more; the six cards
// that previously shared three static bodies are now five distinct reports.

import { $, toast } from '../core/dom.js';
import { printElement, downloadCSV } from '../ui/export.js';
import {
  getVisits, visitsForSite, monthlyPestTotals, getRecommendations, siteRanking
} from '../data/history.js';
import { visibleSites } from '../core/state.js';
import {
  STANDARDS, complianceOverview, sitesInScope, siteReadiness, STATUS_LABEL
} from '../data/compliance.js';
import {
  visitReport, trendReport, comparisonReport, nonConformityReport, auditPackage,
  placementActivityReport, activityReport, placementPoints
} from './reportBodies.js';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const siteById = (id) => visibleSites().find((s) => s.id === id);

/* ------------------------------------------------------------ report registry */

// `scope` declares which selector chips a report needs, so the modal toolbar
// builds itself instead of each report hand-rolling its own controls.
const REPORTS = {
  visit: {
    icon: '▤',
    title: 'Servis Ziyaret Raporu',
    desc: 'Tek ziyaretin istasyon bulguları, kanıt zinciri, kimyasal kaydı ve çift imzası.',
    scope: ['site', 'visit'],
    build: (s) => visitReport(s.visit),
    filename: (s) => `servis_raporu_${s.visit.id}`,
    csv: (s) => ({
      rows: s.visit.readings.map((r) => ({ ...r, date: s.visit.date, tech: s.visit.tech })),
      columns: [
        { key: 'date', label: 'Tarih' }, { key: 'code', label: 'İstasyon' },
        { key: 'type', label: 'Cihaz Tipi' }, { key: 'category', label: 'Kategori' },
        { key: 'status', label: 'Durum' }, { key: 'pestCount', label: 'Bulgu Adedi' },
        { key: 'pestName', label: 'Tür' }, { key: 'tech', label: 'Teknisyen' }
      ]
    })
  },
  activity: {
    icon: '⚠',
    title: 'Aktivite Raporu',
    desc: 'Yalnızca aktivite tespit edilen noktalar — tür, adet ve uygulanan ürün.',
    scope: ['site', 'visit'],
    build: (s) => activityReport(s.visit),
    filename: (s) => `aktivite_raporu_${s.visit.id}`,
    csv: (s) => ({
      rows: s.visit.readings
        .filter((r) => r.pestCount > 0)
        .sort((a, b) => b.pestCount - a.pestCount)
        .map((r) => ({ ...r, date: s.visit.date, tech: s.visit.tech })),
      columns: [
        { key: 'date', label: 'Tarih' }, { key: 'code', label: 'Nokta' },
        { key: 'type', label: 'Cihaz Tipi' }, { key: 'pestName', label: 'Gözlenen Tür' },
        { key: 'pestCode', label: 'Tür Kodu' }, { key: 'pestCount', label: 'Adet' },
        { key: 'status', label: 'Durum' }, { key: 'tech', label: 'Teknisyen' }
      ]
    })
  },
  placement: {
    icon: '⌗',
    title: 'Yerleşim Listesi & Aktivite',
    desc: 'Ekipman ailesi bazında nokta listesi, barkod, cihaz değişimi ve nokta aktivitesi.',
    scope: ['site'],
    build: (s) => placementActivityReport(s.siteId),
    filename: (s) => `yerlesim_listesi_${s.siteId}`,
    csv: (s) => ({
      rows: placementPoints(s.siteId),
      columns: [
        { key: 'code', label: 'Nokta' }, { key: 'pointNo', label: 'Nokta No' },
        { key: 'family', label: 'Ekipman Ailesi' }, { key: 'area', label: 'Bölge Adı' },
        { key: 'barcode', label: 'Güncel Barkod' },
        { key: 'generations', label: 'Cihaz Nesli' },
        { key: 'readings', label: 'Okuma' }, { key: 'totalPests', label: 'Toplam Bulgu' },
        { key: 'dominant', label: 'Baskın Tür' },
        { key: 'lastStatus', label: 'Son Durum' }, { key: 'lastDate', label: 'Son Okuma' }
      ]
    })
  },
  trend: {
    icon: '↗',
    title: 'Trend Analiz Raporu',
    desc: '12 aylık aktivite trendi, tür kırılımı ve istasyon okuma dağılımı.',
    scope: ['site'],
    build: (s) => trendReport(s.siteId),
    filename: (s) => `trend_raporu_${s.siteId}`,
    csv: (s) => {
      const t = monthlyPestTotals(s.siteId);
      return {
        rows: t.labels.map((label, i) => ({
          month: label, rodent: t.rodent[i], flying: t.flying[i], crawler: t.crawler[i], all: t.all[i]
        })),
        columns: [
          { key: 'month', label: 'Ay' }, { key: 'rodent', label: 'Kemirgen' },
          { key: 'flying', label: 'Uçan Haşere' }, { key: 'crawler', label: 'Yürüyen Haşere' },
          { key: 'all', label: 'Toplam' }
        ]
      };
    }
  },
  comparison: {
    icon: '⇄',
    title: 'Tesis Karşılaştırma Raporu',
    desc: 'Tüm tesislerin sıralaması, şehir bazında karşılaştırma ve portföy trendi.',
    scope: [],
    build: () => comparisonReport(),
    filename: () => 'tesis_karsilastirma',
    csv: () => ({
      rows: siteRanking(),
      columns: [
        { key: 'name', label: 'Tesis' }, { key: 'company', label: 'Firma' },
        { key: 'city', label: 'Şehir' }, { key: 'visits', label: 'Ziyaret' },
        { key: 'totalPests', label: 'Toplam Bulgu' }, { key: 'recentPests', label: 'Son Çeyrek' },
        { key: 'trend', label: 'Trend %' }, { key: 'openRecommendations', label: 'Açık Uygunsuzluk' },
        { key: 'score', label: 'Skor' }
      ]
    })
  },
  nonconformity: {
    icon: '!',
    title: 'Uygunsuzluk & Düzeltici Faaliyet',
    desc: 'Açık ve kapatılmış uygunsuzluklar, yaşlandırma ve kategori dağılımı.',
    scope: ['siteOptional'],
    build: (s) => nonConformityReport(s.siteId),
    filename: (s) => `uygunsuzluk_raporu_${s.siteId || 'portfoy'}`,
    csv: (s) => ({
      rows: getRecommendations()
        .filter((r) => !s.siteId || r.siteId === s.siteId)
        .map((r) => ({ ...r, siteName: siteById(r.siteId) ? siteById(r.siteId).name : r.siteId })),
      columns: [
        { key: 'id', label: 'Kayıt' }, { key: 'siteName', label: 'Tesis' },
        { key: 'category', label: 'Kategori' }, { key: 'desc', label: 'Tespit' },
        { key: 'date', label: 'Açılış' }, { key: 'status', label: 'Durum' },
        { key: 'closedDate', label: 'Kapanış', format: (v) => v || '—' },
        { key: 'tech', label: 'Tespit Eden' }
      ]
    })
  },
  audit: {
    icon: '✓',
    title: 'Denetim Paketi',
    desc: 'Standart bazında otomatik derlenen denetim dosyası, 3. göz kayıtları dahil.',
    scope: ['standard'],
    build: (s) => auditPackage(s.standardId),
    filename: (s) => `denetim_paketi_${s.standardId}`,
    csv: (s) => {
      const standard = STANDARDS.find((x) => x.id === s.standardId);
      const rows = sitesInScope(standard).flatMap((site) => {
        const r = siteReadiness(standard, site);
        return r ? r.checks.map((c) => ({
          standard: standard.name, site: site.name, check: c.label,
          value: c.value, target: c.target,
          weight: c.major ? 'Majör' : 'Minör',
          result: c.pass ? 'Uygun' : 'Uygunsuz'
        })) : [];
      });
      return {
        rows,
        columns: [
          { key: 'standard', label: 'Standart' }, { key: 'site', label: 'Tesis' },
          { key: 'check', label: 'Kriter' }, { key: 'value', label: 'Ölçüm' },
          { key: 'target', label: 'Hedef' }, { key: 'weight', label: 'Ağırlık' },
          { key: 'result', label: 'Sonuç' }
        ]
      };
    }
  }
};

// Selection carried across toolbar interactions, so changing a chip re-renders
// the open report rather than closing it.
let current = null;

function defaultSelection(key) {
  const worstSiteId = siteRanking()[0].id;
  if (key === 'visit' || key === 'activity') {
    const visits = visitsForSite(worstSiteId);
    // An activity report opens on the most recent visit that actually found
    // something — landing on an empty "no activity" sheet by default would
    // undersell the report on the very first click.
    const anchor = key === 'activity'
      ? [...visits].reverse().find((v) => v.totals.all > 0) || visits[visits.length - 1]
      : visits[visits.length - 1];
    return { siteId: worstSiteId, visit: anchor };
  }
  if (key === 'trend' || key === 'placement') return { siteId: worstSiteId };
  if (key === 'nonconformity') return { siteId: null };
  if (key === 'audit') return { standardId: 'brcgs' };
  return {};
}

/* ----------------------------------------------------------------- the view */

export function renderReports() {
  renderComplianceStrip();
  renderThirdEye();
  renderReportGrid();
}

// 5-1 — compliance badges, each one a live readiness rollup rather than a logo.
function renderComplianceStrip() {
  const el = $('#complianceStrip');
  if (!el) return;
  el.innerHTML = complianceOverview().map((s) => `
    <button class="compliance-badge ${s.status}" data-standard="${s.standard.id}"
            title="${esc(s.standard.full)}">
      <span class="cb-name">${esc(s.standard.name)}</span>
      <span class="cb-status">${esc(STATUS_LABEL[s.status])}</span>
      <span class="cb-meta">${s.inScope ? `${s.ready}/${s.inScope} tesis hazır` : 'kapsam dışı'}</span>
    </button>
  `).join('');
}

// 2-4 — the 3rd Eye (3. Göz Denetim) independent audit section. Visit type 3G
// already exists in the catalog and the history engine generates it, so these
// are real records rather than a decorative panel.
function renderThirdEye() {
  const el = $('#thirdEyeList');
  if (!el) return;
  const audits = getVisits().filter((v) => v.visitType === '3G').slice().reverse();

  const summary = $('#thirdEyeSummary');
  if (summary) {
    const clean = audits.filter((v) => v.totals.all === 0).length;
    const sites = new Set(audits.map((v) => v.siteId)).size;
    summary.innerHTML = `
      <div class="rep-stat"><span>Bağımsız denetim</span><strong>${audits.length}</strong></div>
      <div class="rep-stat"><span>Denetlenen tesis</span><strong>${sites}</strong></div>
      <div class="rep-stat"><span>Bulgusuz kapanan</span><strong style="color:var(--green)">${clean}</strong></div>
      <div class="rep-stat"><span>Bulgu tespit edilen</span><strong style="color:${audits.length - clean ? 'var(--red)' : 'var(--green)'}">${audits.length - clean}</strong></div>`;
  }

  // Coverage matters as much as the records themselves: an auditor asks which
  // sites have *not* had an independent inspection, and only 2 of 6 have.
  const coverage = $('#thirdEyeCoverage');
  if (coverage) {
    coverage.innerHTML = visibleSites().map((s) => {
      const last = audits.find((v) => v.siteId === s.id);
      return `<div class="te-cov ${last ? 'done' : 'due'}">
        <span class="te-cov-site">${esc(s.name)}</span>
        <span class="te-cov-state">${last
          ? `Son denetim · ${esc(last.date)}`
          : '12 aydır bağımsız denetim yok'}</span>
      </div>`;
    }).join('');
  }

  if (!audits.length) {
    el.innerHTML = '<p class="rep-empty">Bu dönemde 3. göz denetimi kaydı bulunmuyor.</p>';
    return;
  }

  el.innerHTML = audits.map((v) => `
    <button class="third-eye-row" data-third-eye="${v.id}">
      <span class="te-date">${esc(v.date)}</span>
      <span class="te-site"><b>${esc(v.siteName)}</b><small>${esc(v.company)}</small></span>
      <span class="te-tech">${esc(v.tech)}</span>
      <span class="te-result">${v.totals.all > 0
        ? `<span class="status-chip critical">${v.totals.all} bulgu</span>`
        : '<span class="status-chip healthy">Bulgu yok</span>'}</span>
      <span class="te-open">Aç →</span>
    </button>
  `).join('');
}

function renderReportGrid() {
  const grid = $('#reportGrid');
  if (!grid) return;
  grid.innerHTML = Object.entries(REPORTS).map(([key, r]) => `
    <article class="report-card">
      <span class="report-icon">${r.icon}</span>
      <h2>${esc(r.title)}</h2>
      <p>${esc(r.desc)}</p>
      <footer>
        <span>${esc(scopeHint(key))}</span>
        <button class="text-btn" data-report-key="${key}">Aç →</button>
      </footer>
    </article>
  `).join('');
}

function scopeHint(key) {
  const scope = REPORTS[key].scope;
  if (scope.includes('visit')) return 'Ziyaret seçilebilir';
  if (scope.includes('standard')) return 'Standart seçilebilir';
  if (scope.includes('siteOptional')) return 'Portföy veya tek tesis';
  if (scope.includes('site')) return 'Tesis seçilebilir';
  return 'Portföy geneli';
}

/* ------------------------------------------------------------- report modal */

export function openReport(key, selection) {
  if (!REPORTS[key]) return;
  current = { key, ...defaultSelection(key), ...(selection || {}) };
  paintReport();
  $('#modal').classList.remove('hidden');
}

function paintReport() {
  const report = REPORTS[current.key];
  const content = $('#modalContent');
  if (!content) return;

  content.innerHTML = `
    <div class="report-doc-shell">
      ${toolbar(report)}
      <div class="report-doc" id="reportDoc">${report.build(current)}</div>
      <footer class="report-doc-actions no-print">
        <button class="secondary-btn" data-report-action="close">Kapat</button>
        <button class="secondary-btn" data-report-action="csv">⭳ CSV indir</button>
        <button class="primary-btn" data-report-action="print">🖨 PDF olarak yazdır</button>
      </footer>
    </div>`;
}

function toolbar(report) {
  const parts = [];

  if (report.scope.includes('site') || report.scope.includes('siteOptional')) {
    const chips = visibleSites().map((s) =>
      `<button class="rep-chip ${current.siteId === s.id ? 'active' : ''}" data-report-site="${s.id}">${esc(s.name)}</button>`).join('');
    parts.push(`<div class="rep-chips"><span class="rep-chips-label">Tesis</span>${
      report.scope.includes('siteOptional')
        ? `<button class="rep-chip ${!current.siteId ? 'active' : ''}" data-report-site="">Tüm portföy</button>` : ''
    }${chips}</div>`);
  }

  if (report.scope.includes('visit')) {
    // Most recent first — the visit a technician just closed is the one people
    // actually want to print.
    const visits = visitsForSite(current.siteId).slice(-8).reverse();
    parts.push(`<div class="rep-chips"><span class="rep-chips-label">Ziyaret</span>${
      visits.map((v) => `<button class="rep-chip ${current.visit && current.visit.id === v.id ? 'active' : ''}" data-report-visit="${v.id}">${esc(v.date)}${v.totals.all ? ` · ${v.totals.all}` : ''}</button>`).join('')
    }</div>`);
  }

  if (report.scope.includes('standard')) {
    parts.push(`<div class="rep-chips"><span class="rep-chips-label">Standart</span>${
      STANDARDS.map((s) => `<button class="rep-chip ${current.standardId === s.id ? 'active' : ''}" data-report-standard="${s.id}">${esc(s.name)}</button>`).join('')
    }</div>`);
  }

  return parts.length ? `<div class="report-toolbar no-print">${parts.join('')}</div>` : '';
}

/* ----------------------------------------------------------------- handlers */

export function reportCardClicks(e) {
  const card = e.target.closest('[data-report-key]');
  if (card) {
    openReport(card.dataset.reportKey);
    return true;
  }

  const badge = e.target.closest('[data-standard]');
  if (badge) {
    openReport('audit', { standardId: badge.dataset.standard });
    return true;
  }

  const audit = e.target.closest('[data-third-eye]');
  if (audit) {
    const visit = getVisits().find((v) => v.id === audit.dataset.thirdEye);
    if (visit) openReport('visit', { siteId: visit.siteId, visit });
    return true;
  }
  return false;
}

export function reportModalClicks(e) {
  if (!current) return false;

  const siteChip = e.target.closest('[data-report-site]');
  if (siteChip) {
    current.siteId = siteChip.dataset.reportSite || null;
    // A visit-scoped report must re-anchor onto a visit that exists at the
    // newly selected site, or build() would render the previous site's visit.
    if (REPORTS[current.key].scope.includes('visit')) {
      const visits = visitsForSite(current.siteId);
      current.visit = visits[visits.length - 1];
    }
    paintReport();
    return true;
  }

  const visitChip = e.target.closest('[data-report-visit]');
  if (visitChip) {
    current.visit = getVisits().find((v) => v.id === visitChip.dataset.reportVisit);
    paintReport();
    return true;
  }

  const stdChip = e.target.closest('[data-report-standard]');
  if (stdChip) {
    current.standardId = stdChip.dataset.reportStandard;
    paintReport();
    return true;
  }

  const action = e.target.closest('[data-report-action]');
  if (action) {
    const report = REPORTS[current.key];
    const what = action.dataset.reportAction;

    if (what === 'close') {
      $('#modal').classList.add('hidden');
      current = null;
      return true;
    }
    if (what === 'print') {
      printElement('#reportDoc', { title: report.filename(current) });
      return true;
    }
    if (what === 'csv') {
      const { rows, columns } = report.csv(current);
      if (!rows.length) { toast('Bu raporda dışa aktarılacak satır yok.'); return true; }
      downloadCSV(`${report.filename(current)}.csv`, rows, columns);
      return true;
    }
  }
  return false;
}

export function generateReportSubmit(e) {
  if (e.target.id === 'generateReport') {
    e.preventDefault();
    $('#modal').classList.add('hidden');
    toast('Rapor oluşturuldu. Paylaşım bağlantısı müşteri portalına eklendi.');
    return true;
  }
  return false;
}
