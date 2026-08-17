// Analytics view. Charts come from ui/charts.js (Phase 0c-1); the numbers
// behind them come from the seeded history engine (Phase 0b-1), so everything
// on this screen is reproducible across demo runs.
//
// Phase 2 adds: multi-select pest filtering (2-2), side-by-side location and
// city comparison (2-1), and the recommendation funnel (2-3).

import { $, $$, toast } from '../core/dom.js';
import { state, visibleSites } from '../core/state.js';
import { ui } from '../core/session.js';
import { lineChart, barChart, stackedBarChart, donutChart, mountChart } from '../ui/charts.js';
import { downloadChartSVG, downloadChartPNG } from '../ui/export.js';
import {
  monthlyPestTotals, siteRanking, recommendationStats, chemicalStats,
  getRecommendations, getMonths
} from '../data/history.js';

// Fixed colours per pest type: a series keeps the same colour in every chart on
// the page, so the legend only has to be read once.
const PEST_META = {
  rodent:  { label: 'Kemirgen',        color: '#f59e0b' },
  flying:  { label: 'Uçan haşere',     color: '#2563eb' },
  crawler: { label: 'Yürüyen haşere',  color: '#8b5cf6' }
};
const PEST_KEYS = Object.keys(PEST_META);

const REC_CATEGORY_COLORS = {
  'Hijyen':  '#10b981',
  'Yalıtım': '#2563eb',
  'BRCGS':   '#8b5cf6',
  'AIB':     '#f59e0b'
};

// Selections live here rather than in core/session.js: they are presentation
// state for one view, and nothing outside this module reads them.
const sel = {
  pests: new Set(PEST_KEYS),
  scope: 'site',          // 'site' | 'city'
  sites: null             // lazily seeded with every site id
};

const allSiteIds = () => visibleSites().map(s => s.id);

// Ids we have already offered to the selection, so newly-visible sites default
// to selected exactly once. Without this, switching into the client scope would
// leave their locations deselected (they were never in the set), and toggling a
// site off would not stick (it would be re-added every render).
const offered = new Set();

// Every entry point goes through this, so the selection is seeded no matter
// which renderer or handler runs first.
function siteSet() {
  if (!sel.sites) sel.sites = new Set();
  for (const id of allSiteIds()) {
    if (!offered.has(id)) { offered.add(id); sel.sites.add(id); }
  }
  return sel.sites;
}

function selectedSiteIds() {
  const chosen = siteSet();
  // A site added or removed elsewhere in the demo must not desync the list.
  return allSiteIds().filter(id => chosen.has(id));
}

/* ------------------------------------------------------------- aggregation */

// Sums the per-site monthly series so a city (or the whole portfolio) can be
// charted with the same shape as a single site.
function totalsFor(siteIds) {
  const base = monthlyPestTotals();
  const keys = [...PEST_KEYS, 'all'];
  const out = { labels: base.labels };
  for (const k of keys) out[k] = base.labels.map(() => 0);

  for (const id of siteIds) {
    const t = monthlyPestTotals(id);
    for (const k of keys) t[k].forEach((v, i) => { out[k][i] += v; });
  }
  return out;
}

function citiesOf(siteIds) {
  const groups = new Map();
  for (const site of state.sites) {
    if (!siteIds.includes(site.id)) continue;
    if (!groups.has(site.city)) groups.set(site.city, []);
    groups.get(site.city).push(site.id);
  }
  return [...groups.entries()].map(([city, ids]) => ({ name: city, ids }));
}

// The unit being compared: one entry per site, or one per city.
function comparisonGroups() {
  const ids = selectedSiteIds();
  if (sel.scope === 'city') return citiesOf(ids);
  return ids.map(id => {
    const site = state.sites.find(s => s.id === id);
    return { name: site ? site.name : id, ids: [id] };
  });
}

/* --------------------------------------------------------- recommendations */

// history.js records recommendations as open | resolved. "Approved" is not a
// stored field — it is derived: a resolved item counts as approved once a later
// month of visits has passed without it being reopened, i.e. the technician
// has been back on site since the fix. Nothing is invented here.
function recFunnel(siteIds) {
  const lastIndex = getMonths().length - 1;
  const recs = getRecommendations().filter(r => siteIds.includes(r.siteId));
  const resolved = recs.filter(r => r.status === 'resolved');
  return {
    raised: recs.length,
    actioned: resolved.length,
    approved: resolved.filter(r => r.closedMonth !== null && r.closedMonth < lastIndex).length,
    open: recs.length - resolved.length,
    byCategory: Object.keys(REC_CATEGORY_COLORS).map(cat => ({
      label: cat,
      value: recs.filter(r => r.category === cat).length,
      color: REC_CATEGORY_COLORS[cat]
    }))
  };
}

/* --------------------------------------------------------------- rendering */

const chipRow = (items) => items.map(it =>
  `<button type="button" class="chip-toggle${it.on ? ' active' : ''}" ${it.attr}="${it.value}"${it.color ? ` style="--chip-accent:${it.color}"` : ''}>${it.label}</button>`
).join('');

function renderTrend() {
  const host = $('#trendChart');
  if (!host) return;

  const ids = selectedSiteIds();
  const totals = totalsFor(ids);
  const active = PEST_KEYS.filter(k => sel.pests.has(k));

  mountChart('#trendPestChips', chipRow(PEST_KEYS.map(k => ({
    label: PEST_META[k].label, value: k, attr: 'data-pest-toggle',
    on: sel.pests.has(k), color: PEST_META[k].color
  }))));

  mountChart(host, lineChart({
    labels: totals.labels,
    series: active.map(k => ({ name: PEST_META[k].label, values: totals[k], color: PEST_META[k].color })),
    // A single series reads better as a filled area; several would muddy it.
    area: active.length === 1,
    height: 300
  }));

  const grand = active.reduce((sum, k) => sum + totals[k].reduce((a, b) => a + b, 0), 0);
  const caption = $('#trendCaption');
  if (caption) {
    const scopeLabel = ids.length === allSiteIds().length ? 'tüm portföy' : `${ids.length} tesis`;
    caption.textContent = `Son 12 ay · ${scopeLabel} · ${grand.toLocaleString('tr-TR')} bulgu`;
  }
}

function renderRanking() {
  const host = $('#ranking');
  if (!host) return;
  const visible = new Set(allSiteIds());
  host.innerHTML = siteRanking().filter(s => visible.has(s.id)).slice(0, 5).map((s, i) => `
    <div class="rank-row" data-site-id="${s.id}" style="cursor:pointer;">
      <span>0${i + 1}</span>
      <div><b>${s.name}</b><small>${s.company} · son 3 ayda ${s.recentPests} bulgu · ${s.openRecommendations} açık öneri</small></div>
      <strong class="rank-score">${s.score}</strong>
    </div>
  `).join('');
}

function renderComparison() {
  const host = $('#compareCompositionChart');
  if (!host) return;

  mountChart('#compareScopeChips', chipRow([
    { label: 'Tesis bazında', value: 'site', attr: 'data-compare-scope', on: sel.scope === 'site' },
    { label: 'Şehir bazında', value: 'city', attr: 'data-compare-scope', on: sel.scope === 'city' }
  ]));

  const siteChips = $('#compareSiteChips');
  if (siteChips) {
    siteChips.innerHTML = chipRow(visibleSites().map(s => ({
      label: s.name, value: s.id, attr: 'data-compare-site', on: siteSet().has(s.id)
    })));
  }

  const groups = comparisonGroups();
  const active = PEST_KEYS.filter(k => sel.pests.has(k));
  const perGroup = groups.map(g => totalsFor(g.ids));
  const sum = (arr) => arr.reduce((a, b) => a + b, 0);

  // Composition: one bar per location, split by pest type.
  mountChart(host, stackedBarChart({
    labels: groups.map(g => g.name),
    series: active.map(k => ({
      name: PEST_META[k].label,
      values: perGroup.map(t => sum(t[k])),
      color: PEST_META[k].color
    })),
    height: 300
  }));

  // Trend: one line per location, so locations are compared over time rather
  // than only in total.
  mountChart('#compareTrendChart', lineChart({
    labels: getMonths().map(m => m.label),
    series: groups.map(g => {
      const t = totalsFor(g.ids);
      return { name: g.name, values: t.labels.map((_, i) => active.reduce((s, k) => s + t[k][i], 0)) };
    }),
    area: false,
    height: 300
  }));

  const note = $('#compareNote');
  if (note) {
    const totalAll = sum(perGroup.map(t => active.reduce((s, k) => s + sum(t[k]), 0)));
    note.textContent = groups.length
      ? `${groups.length} ${sel.scope === 'city' ? 'şehir' : 'tesis'} karşılaştırılıyor · toplam ${totalAll.toLocaleString('tr-TR')} bulgu`
      : 'Karşılaştırmak için en az bir tesis seçin.';
  }
}

function renderRecommendations() {
  const ids = selectedSiteIds();
  const f = recFunnel(ids);

  const cards = $('#recFunnelCards');
  if (cards) {
    const pct = (n) => f.raised ? `%${Math.round(n / f.raised * 100)}` : '—';
    cards.innerHTML = [
      { label: 'Açılan öneri', value: f.raised, sub: 'son 12 ay', tone: '' },
      { label: 'Aksiyon alınan', value: f.actioned, sub: pct(f.actioned), tone: 'var(--blue)' },
      { label: 'Teknisyen onaylı', value: f.approved, sub: `${pct(f.approved)} · takip ziyaretinde doğrulandı`, tone: 'var(--green)' },
      { label: 'Hâlâ açık', value: f.open, sub: pct(f.open), tone: 'var(--amber)' }
    ].map(c => `
      <div class="metric-card" style="box-shadow:none; border:1px solid var(--line); background:var(--soft);">
        <div>
          <span>${c.label}</span>
          <strong${c.tone ? ` style="color:${c.tone}"` : ''}>${c.value}</strong>
          <small style="color:var(--muted); font-size:10px;">${c.sub}</small>
        </div>
      </div>
    `).join('');
  }

  const hygiene = f.byCategory.find(c => c.label === 'Hijyen')?.value || 0;
  mountChart('#recCategoryChart', donutChart({
    data: f.byCategory,
    centerValue: String(f.raised),
    centerLabel: 'toplam öneri',
    height: 260
  }));

  const split = $('#recSplitNote');
  if (split) {
    split.textContent = `Hijyen kaynaklı ${hygiene} · Yalıtım & fiziksel ${f.raised - hygiene}`;
  }

  // Open vs resolved per location — shows who is actually closing the loop.
  const groups = comparisonGroups();
  mountChart('#recBySiteChart', barChart({
    labels: groups.map(g => g.name),
    series: [
      { name: 'Aksiyon alınan', values: groups.map(g => recFunnel(g.ids).actioned), color: '#10b981' },
      { name: 'Açık', values: groups.map(g => recFunnel(g.ids).open), color: '#f59e0b' }
    ],
    height: 260
  }));
}

export function renderInsights() {
  renderTrend();
  renderRanking();
  renderComparison();
  renderRecommendations();
}

export function renderAiPredictions() {
  const grid = $('#aiRiskEngineGrid');
  if (!grid) return;

  const predictions = [
    { area: "Hammadde Deposu", risk: "84%", trend: "Yüksek Artış", badge: "critical", desc: "Mevsimsel sıcaklık artışı ve nem oranına bağlı olarak kemirgen geçiş riski yüksek." },
    { area: "Ana Üretim Hattı", risk: "12%", trend: "Kararlı Düşüş", badge: "healthy", desc: "Periyodik temizlik ve kalıcı jel bariyerleri sayesinde risk düzeyi minimal seviyede." },
    { area: "Ambalaj & Sevkiyat", risk: "48%", trend: "Yükselme Eğilimi", badge: "warning", desc: "Rampa kapılarının açık kalma süresinin uzaması uçan haşere riskini artırıyor." },
    { area: "Sosyal Tesisler & Ofisler", risk: "28%", trend: "Kararlı", badge: "secondary", desc: "Mutfak drenaj kanalları çevresinde yürüyen haşere aktivite riski izleniyor." }
  ];

  grid.innerHTML = predictions.map(p => `
    <div class="panel" style="padding:15px; border:1px solid var(--line); box-shadow:none; background:var(--soft);">
      <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:8px;">
        <h3 style="margin:0; font-size:13px; font-weight:700;">📍 ${p.area}</h3>
        <span class="status-chip ${p.badge}" style="font-size:9px; font-weight:700; padding:2px 6px;">${p.trend}</span>
      </div>
      <div style="display:flex; align-items:baseline; gap:6px; margin:10px 0;">
        <strong style="font-size:24px; font-weight:800; color:${p.badge === 'critical' ? 'var(--red)' : p.badge === 'warning' ? 'var(--amber)' : p.badge === 'healthy' ? 'var(--green)' : 'var(--muted)'};">${p.risk}</strong>
        <span style="font-size:10px; color:var(--muted)">Risk Oranı</span>
      </div>
      <p style="margin:0; font-size:11px; line-height:1.45; color:var(--muted);">${p.desc}</p>
    </div>
  `).join('');
}

export function renderClientAnalytics() {
  const canvas = $('#analyticsCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const site = state.sites.find(s => s.id === ui.activeSiteId);
  if (!site) return;

  const activeFilterBtn = $('#analyticsFilterChips .filter-btn.active');
  const filter = activeFilterBtn ? activeFilterBtn.dataset.analyticsFilter : 'all';

  const series = monthlyPestTotals(site.id);
  const key = filter === 'crawling' ? 'crawler' : filter;
  const full = series[key] || series.all;
  const months = series.labels.slice(-6);
  const values = full.slice(-6);

  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  const padding = { top: 30, right: 20, bottom: 40, left: 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const maxVal = Math.max(10, Math.max(...values) + 2);

  ctx.strokeStyle = '#e4e4e7';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#71717a';
  ctx.font = '10px Inter, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  const gridLines = 5;
  for (let i = 0; i <= gridLines; i++) {
    const yVal = Math.round((maxVal / gridLines) * i);
    const y = padding.top + chartHeight - (yVal / maxVal) * chartHeight;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();

    ctx.fillText(yVal, padding.left - 8, y);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const barWidth = Math.round(chartWidth / months.length) - 16;
  const step = chartWidth / months.length;

  months.forEach((m, idx) => {
    const val = values[idx];
    const x = padding.left + idx * step + step / 2;
    const yValHeight = (val / maxVal) * chartHeight;
    const y = padding.top + chartHeight - yValHeight;

    const gradient = ctx.createLinearGradient(x - barWidth/2, y, x - barWidth/2, padding.top + chartHeight);
    gradient.addColorStop(0, '#2563eb');
    gradient.addColorStop(1, '#60a5fa');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    // Support basic rect if roundRect has minor compatibility issues
    if (ctx.roundRect) {
      ctx.roundRect(x - barWidth/2, y, barWidth, yValHeight, [4, 4, 0, 0]);
    } else {
      ctx.rect(x - barWidth/2, y, barWidth, yValHeight);
    }
    ctx.fill();

    ctx.fillStyle = '#09090b';
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.fillText(val, x, y - 14);

    ctx.fillStyle = '#71717a';
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText(m, x, padding.top + chartHeight + 8);
  });

  const recStats = $('#recStatsContainer');
  if (recStats) {
    const live = site.recommendations || [];
    const r = recommendationStats(site.id);
    const open = r.open + live.filter(x => x.status === 'open').length;
    const resolved = r.resolved + live.filter(x => x.status === 'resolved').length;
    recStats.innerHTML = `
      <div class="metric-card" style="box-shadow:none; border:1px solid var(--line); background:var(--soft);"><div><span>Açık Öneri</span><strong>${open}</strong></div></div>
      <div class="metric-card" style="box-shadow:none; border:1px solid var(--line); background:var(--soft);"><div><span>Giderilen Öneri</span><strong>${resolved}</strong></div></div>
      <div class="metric-card" style="box-shadow:none; border:1px solid var(--line); background:var(--soft);"><div><span>Hijyen Odaklı</span><strong>${r.hygiene}</strong></div></div>
      <div class="metric-card" style="box-shadow:none; border:1px solid var(--line); background:var(--soft);"><div><span>Yalıtım & Fiziksel</span><strong>${r.isolation}</strong></div></div>
    `;
  }

  const chemStats = $('#chemStatsContainer');
  if (chemStats) {
    const c = chemicalStats(site.id);
    chemStats.innerHTML = `
      <div class="metric-card" style="box-shadow:none; border:1px solid var(--line); background:var(--soft);"><div><span>Uygulama Sayısı</span><strong>${c.applications}</strong></div></div>
      <div class="metric-card" style="box-shadow:none; border:1px solid var(--line); background:var(--soft);"><div><span>Toplam Sarfiyat</span><strong>${c.totalQuantity.toLocaleString('tr-TR')} ml/gr</strong></div></div>
      <div class="metric-card" style="box-shadow:none; border:1px solid var(--line); background:var(--soft);"><div><span>Aktif Ürün Türü</span><strong>${c.distinctProducts}</strong></div></div>
      <div class="metric-card" style="box-shadow:none; border:1px solid var(--line); background:var(--soft);"><div><span>Son Uygulama</span><strong>${c.lastDate}</strong></div></div>
    `;
  }
}


export function insightsClicks(e) {
    if (e.target.id === 'btnDownloadChart') {
      const canvas = $('#analyticsCanvas');
      if (canvas) {
        const link = document.createElement('a');
        link.download = `${ui.activeSiteId}_trend_analizi.png`;
        link.href = canvas.toDataURL();
        link.click();
        toast('Grafik PNG olarak indirildi.');
      }
      return true;
    }

    // Per-chart SVG / PNG download (2-2).
    const dl = e.target.closest('[data-chart-download]');
    if (dl) {
      const target = dl.dataset.chartTarget;
      const name = dl.dataset.chartName || 'grafik';
      if (dl.dataset.chartDownload === 'svg') downloadChartSVG(target, name);
      else downloadChartPNG(target, name);
      return true;
    }

    // Pest-type multi-select — drives every chart on the page.
    const pest = e.target.closest('[data-pest-toggle]');
    if (pest) {
      const key = pest.dataset.pestToggle;
      if (sel.pests.has(key)) sel.pests.delete(key); else sel.pests.add(key);
      // Charting nothing is not a useful state; keep the last one on.
      if (sel.pests.size === 0) sel.pests.add(key);
      renderInsights();
      return true;
    }

    const scope = e.target.closest('[data-compare-scope]');
    if (scope) {
      sel.scope = scope.dataset.compareScope;
      renderComparison();
      renderRecommendations();
      return true;
    }

    const cmpSite = e.target.closest('[data-compare-site]');
    if (cmpSite) {
      const id = cmpSite.dataset.compareSite;
      const chosen = siteSet();
      if (chosen.has(id)) chosen.delete(id); else chosen.add(id);
      // Comparing nothing is not a useful state; keep the last one on.
      if (chosen.size === 0) chosen.add(id);
      renderInsights();
      return true;
    }

    // Analytics filter chip clicks
    const analyticsFilter = e.target.closest('[data-analytics-filter]');
    if (analyticsFilter) {
      $$('[data-analytics-filter]').forEach(b => b.classList.toggle('active', b === analyticsFilter));
      renderClientAnalytics();
      return true;
    }

    // Invoice status actions
  return false;
}
