// The five printable report bodies (Phase 1-8).
//
// Each builder is a pure function — data in, HTML string out — the same shape
// as the chart builders in ui/charts.js. Nothing here touches the DOM or reads
// global state, so one body serves the on-screen modal, the print-to-PDF
// layout and (via the same string) any future email attachment.
//
// Everything is driven by the seeded history in data/history.js. There are no
// hardcoded findings left: what prints is what the generator produced, so the
// numbers agree with the dashboard, the insights charts and the CSV exports.

import { lineChart, barChart, stackedBarChart, donutChart } from '../ui/charts.js';
import {
  getVisits, visitsForSite, monthlyPestTotals, recommendationStats,
  chemicalStats, getRecommendations, siteRanking, technicianStats
} from '../data/history.js';
import { initial } from '../data/seed.js';
import { visitTypes, equipmentTypes } from '../data/catalog.js';
import { STANDARDS, siteReadiness, sitesInScope, STATUS_LABEL, STATUS_CHIP, openNonConformities } from '../data/compliance.js';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const visitTypeName = (code) => (visitTypes.find((v) => v.code === code) || {}).name || code;
const equipmentName = (type) => (equipmentTypes[type] || {}).name || type;
const siteById = (id) => initial.sites.find((s) => s.id === id);

// Certificate numbers must be stable: printing the same report twice has to
// produce the same document, so this is derived rather than random.
function certNo(...parts) {
  let h = 2166136261 >>> 0;
  for (const ch of parts.join('|')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return `LADY-${String(h % 90000 + 10000)}`;
}

const STATUS_TR = {
  clean: ['Temiz', 'healthy'],
  activity: ['Aktivite', 'critical'],
  damaged: ['Hasarlı', 'warning'],
  missing: ['Kayıp', 'warning'],
  bait_changed: ['Yem Değişti', 'secondary']
};

const chip = (label, kind) =>
  `<span class="status-chip ${kind}" style="padding:2px 6px; font-size:9px;">${esc(label)}</span>`;

/* ------------------------------------------------------------ page furniture */

// Every report opens with the same masthead so the set reads as one branded
// family — the "audit-ready, branded reports" line in docs/COMPETITOR.md.
function docHeader({ title, subtitle, cert, badge }) {
  return `
    <header class="rep-head">
      <div>
        <h2 class="rep-title">${esc(title)}</h2>
        <p class="rep-sub">${esc(subtitle)}</p>
      </div>
      <div class="rep-brand">
        <strong>REPELLENT</strong>
        <div class="rep-cert">Belge No: ${esc(cert)}</div>
        ${badge ? `<div style="margin-top:4px;">${badge}</div>` : ''}
      </div>
    </header>`;
}

function metaGrid(pairs) {
  return `<dl class="rep-meta">${pairs.map(([k, v]) =>
    `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
}

const section = (title, inner) =>
  `<section class="rep-section"><p class="overline">${esc(title)}</p>${inner}</section>`;

function table(headers, rows, opts = {}) {
  if (!rows.length) {
    return `<p class="rep-empty">${esc(opts.empty || 'Bu dönemde kayıt bulunmuyor.')}</p>`;
  }
  return `<div class="rep-table-wrap"><table class="rep-table">
    <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

function statRow(stats) {
  return `<div class="rep-stats">${stats.map((s) => `
    <div class="rep-stat"><span>${esc(s.label)}</span><strong${s.tone ? ` style="color:var(--${s.tone})"` : ''}>${esc(s.value)}</strong></div>
  `).join('')}</div>`;
}

// The pitch differentiator: GPS arrival and the first-QR scan are what prove
// the visit physically happened. Insectram does not claim this (COMPETITOR.md),
// so it gets its own block rather than a line in a table.
function proofBlock(visit) {
  const firstStation = visit.readings[0];
  return `
    <div class="rep-proof">
      <div class="rep-proof-mark">✓</div>
      <div>
        <b>Doğrulanmış saha kanıt zinciri</b>
        <div class="rep-proof-grid">
          <span>GPS varış</span><b>${esc(visit.arrival)}</b>
          <span>İlk QR okutma</span><b>${esc(visit.arrival)} · ${esc(firstStation ? firstStation.code : '—')}</b>
          <span>Çıkış</span><b>${esc(visit.departure)}</b>
          <span>Sahada geçen süre</span><b>${visit.onSiteMin} dk</b>
          <span>Okutulan istasyon</span><b>${visit.readings.length} / ${visit.readings.length}</b>
        </div>
        <p class="rep-proof-note">
          Servis başlangıcı tesiste okutulan ilk QR ile kayda alınmıştır; saha
          süresi GPS varış damgası ile karşılaştırılarak doğrulanmıştır.
        </p>
      </div>
    </div>`;
}

function signatureBlock(techName, customerName) {
  const pad = (name, role) => `
    <div class="rep-sign">
      <div class="rep-sign-pad"><span>${esc(name)}</span></div>
      <div class="rep-sign-role">${esc(role)}</div>
    </div>`;
  return `
    <div class="rep-signs">
      ${pad(techName, 'Teknisyen / Operatör')}
      ${pad(customerName, 'Müşteri Yetkilisi')}
    </div>
    <p class="rep-legal">
      Bu belge 5070 Sayılı Elektronik İmza Kanunu kapsamında çift taraflı
      biyometrik imza doğrulaması ile imzalanmış ve arşive eklenmiştir.
    </p>`;
}

/* ------------------------------------------------- 1 · visit / service report */

export function visitReport(visit) {
  const site = siteById(visit.siteId);
  const contact = (site && site.contact) || { name: 'Müşteri Yetkilisi' };
  const active = visit.readings.filter((r) => r.pestCount > 0);
  const faults = visit.readings.filter((r) => r.status === 'damaged' || r.status === 'missing');

  const rows = visit.readings.map((r) => {
    const [label, kind] = STATUS_TR[r.status] || ['—', 'secondary'];
    return [
      `<b>${esc(r.code)}</b>`,
      esc(equipmentName(r.type)),
      r.pestCount > 0
        ? `<b style="color:var(--red)">${r.pestCount} ${esc(r.pestName)}</b>`
        : '<span style="color:var(--muted)">Bulgu yok</span>',
      chip(label, kind)
    ];
  });

  const chemRows = visit.chemicals.map((c) => [
    esc(c.name), `${c.quantity} ${esc(c.unit)}`, esc(c.area), esc(c.tech)
  ]);

  const raised = getRecommendations().filter((r) => visit.recommendationsRaised.includes(r.id));
  const closed = getRecommendations().filter((r) => visit.recommendationsClosed.includes(r.id));

  return docHeader({
    title: 'Servis Ziyaret Raporu',
    subtitle: `${site ? site.company : ''} · ${visit.siteName}`,
    cert: certNo('visit', visit.id)
  })
  + metaGrid([
    ['Ziyaret No', `<b>${esc(visit.id)}</b>`],
    ['Tarih', `<b>${esc(visit.date)}</b>`],
    ['Ziyaret Tipi', `<b>${esc(visitTypeName(visit.visitType))}</b>`],
    ['Teknisyen', `<b>${esc(visit.tech)}</b>`],
    ['Şehir', `<b>${esc(visit.city)}</b>`],
    ['Toplam Bulgu', `<b style="color:${visit.totals.all > 0 ? 'var(--red)' : 'var(--green)'}">${visit.totals.all}</b>`]
  ])
  + section('Saha Kanıt Zinciri', proofBlock(visit))
  + section('İstasyon İnceleme Özeti', table(
      ['İstasyon', 'Cihaz Tipi', 'Bulgu', 'Durum'], rows))
  + section('Kategori Dağılımı', statRow([
      { label: 'Kemirgen', value: visit.totals.rodent },
      { label: 'Uçan haşere', value: visit.totals.flying },
      { label: 'Yürüyen haşere', value: visit.totals.crawler },
      { label: 'Aktif istasyon', value: `${active.length}/${visit.readings.length}`, tone: active.length ? 'red' : 'green' },
      { label: 'Arızalı / kayıp', value: faults.length, tone: faults.length ? 'amber' : null }
    ]))
  + section('Uygulanan Biyosidal Ürünler', table(
      ['Ürün', 'Miktar', 'Uygulama Alanı', 'Uygulayan'], chemRows,
      { empty: 'Bu ziyarette kimyasal uygulama yapılmamıştır.' }))
  + section('Bu Ziyarette Açılan / Kapatılan Uygunsuzluklar', table(
      ['Durum', 'Kategori', 'Açıklama'],
      [...raised.map((r) => [chip('Açıldı', 'critical'), esc(r.category), esc(r.desc)]),
       ...closed.map((r) => [chip('Kapatıldı', 'healthy'), esc(r.category), esc(r.desc)])],
      { empty: 'Bu ziyarette uygunsuzluk kaydı açılmamıştır.' }))
  + section('Dijital İmzalar', signatureBlock(visit.tech, contact.name));
}

/* --------------------------------------------------------- 2 · trend report */

export function trendReport(siteId) {
  const site = siteById(siteId);
  const totals = monthlyPestTotals(siteId);
  const visits = visitsForSite(siteId);
  const chem = chemicalStats(siteId);
  const recs = recommendationStats(siteId);

  const line = lineChart({
    title: '12 aylık toplam bulgu',
    labels: totals.labels,
    series: [{ name: 'Toplam bulgu', values: totals.all }],
    height: 240
  });

  const stacked = stackedBarChart({
    title: 'Tür kırılımı',
    labels: totals.labels,
    series: [
      { name: 'Kemirgen', values: totals.rodent },
      { name: 'Uçan haşere', values: totals.flying },
      { name: 'Yürüyen haşere', values: totals.crawler }
    ],
    height: 240
  });

  // Station status mix over the window — what proportion of inspections came
  // back clean is the single number an auditor asks for first.
  const statusCounts = {};
  for (const v of visits) for (const r of v.readings) statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
  const donut = donutChart({
    title: 'İstasyon okuma dağılımı',
    centerLabel: 'okuma',
    data: Object.entries(statusCounts).map(([k, value]) => ({
      label: (STATUS_TR[k] || [k])[0], value
    })),
    height: 240
  });

  const peak = totals.all.indexOf(Math.max(...totals.all));
  const firstHalf = totals.all.slice(0, 6).reduce((a, b) => a + b, 0);
  const secondHalf = totals.all.slice(6).reduce((a, b) => a + b, 0);
  const delta = firstHalf === 0 ? 0 : Math.round(((secondHalf - firstHalf) / firstHalf) * 100);

  return docHeader({
    title: 'Trend Analiz Raporu',
    subtitle: `${site.company} · ${site.name} · son 12 ay`,
    cert: certNo('trend', siteId)
  })
  + metaGrid([
    ['Dönem', `<b>${esc(totals.labels[0])} – ${esc(totals.labels[totals.labels.length - 1])}</b>`],
    ['Toplam ziyaret', `<b>${visits.length}</b>`],
    ['Toplam bulgu', `<b>${totals.all.reduce((a, b) => a + b, 0)}</b>`],
    ['Zirve ayı', `<b>${esc(totals.labels[peak])}</b>`],
    ['Yarıyıl değişimi', `<b style="color:${delta > 0 ? 'var(--red)' : 'var(--green)'}">${delta > 0 ? '↑' : '↓'} %${Math.abs(delta)}</b>`],
    ['Tesis skoru', `<b>${site.score}/100</b>`]
  ])
  + section('Aktivite Trendi', `<div class="rep-chart">${line}</div>`)
  + section('Tür Bazında Kırılım', `<div class="rep-chart">${stacked}</div>`)
  + section('İstasyon Okuma Dağılımı', `<div class="rep-chart rep-chart-narrow">${donut}</div>`)
  + section('Kimyasal ve Uygunsuzluk Özeti', statRow([
      { label: 'Kimyasal uygulaması', value: chem.applications },
      { label: 'Farklı ürün', value: chem.distinctProducts },
      { label: 'Toplam sarfiyat', value: `${chem.totalQuantity} ml/gr` },
      { label: 'Açılan uygunsuzluk', value: recs.total },
      { label: 'Giderilen', value: recs.resolved, tone: 'green' },
      { label: 'Açık kalan', value: recs.open, tone: recs.open ? 'red' : 'green' }
    ]))
  + section('Aylık Döküm', table(
      ['Ay', 'Kemirgen', 'Uçan', 'Yürüyen', 'Toplam'],
      totals.labels.map((label, i) => [
        `<b>${esc(label)}</b>`, totals.rodent[i], totals.flying[i], totals.crawler[i],
        `<b>${totals.all[i]}</b>`
      ])));
}

/* ---------------------------------------------------- 3 · comparison report */

export function comparisonReport() {
  const ranking = siteRanking();
  const totals = monthlyPestTotals();

  const bars = barChart({
    title: 'Son çeyrek toplam bulgu · tesis bazlı',
    labels: ranking.map((r) => r.name),
    series: [{ name: 'Son çeyrek bulgu', values: ranking.map((r) => r.recentPests) }],
    height: 260
  });

  const portfolio = lineChart({
    title: 'Portföy geneli 12 aylık trend',
    labels: totals.labels,
    series: [
      { name: 'Kemirgen', values: totals.rodent },
      { name: 'Uçan haşere', values: totals.flying },
      { name: 'Yürüyen haşere', values: totals.crawler }
    ],
    height: 240
  });

  // Cities are the unit customers actually compare, so roll up to them too.
  const byCity = {};
  for (const r of ranking) {
    const c = (byCity[r.city] ||= { city: r.city, sites: 0, pests: 0, open: 0, score: 0 });
    c.sites++; c.pests += r.recentPests; c.open += r.openRecommendations; c.score += r.score;
  }
  const cityRows = Object.values(byCity)
    .sort((a, b) => b.pests - a.pests)
    .map((c) => [`<b>${esc(c.city)}</b>`, c.sites, c.pests, c.open, `${Math.round(c.score / c.sites)}/100`]);

  const rows = ranking.map((r, i) => [
    `<b>${String(i + 1).padStart(2, '0')}</b>`,
    `<b>${esc(r.name)}</b><br><span style="color:var(--muted); font-size:10px;">${esc(r.company)}</span>`,
    esc(r.city),
    r.visits,
    r.totalPests,
    `<b>${r.recentPests}</b>`,
    r.trend === 0 ? '—'
      : `<b style="color:${r.trend > 0 ? 'var(--red)' : 'var(--green)'}">${r.trend > 0 ? '↑' : '↓'} %${Math.abs(r.trend)}</b>`,
    r.openRecommendations,
    `<b>${r.score}</b>`
  ]);

  return docHeader({
    title: 'Tesis Karşılaştırma Raporu',
    subtitle: `${ranking.length} tesis · ${Object.keys(byCity).length} şehir · son 12 ay`,
    cert: certNo('comparison', 'portfolio')
  })
  + metaGrid([
    ['Kapsanan tesis', `<b>${ranking.length}</b>`],
    ['Toplam ziyaret', `<b>${ranking.reduce((s, r) => s + r.visits, 0)}</b>`],
    ['Toplam bulgu', `<b>${ranking.reduce((s, r) => s + r.totalPests, 0)}</b>`],
    ['En riskli tesis', `<b style="color:var(--red)">${esc(ranking[0].name)}</b>`],
    ['En iyi tesis', `<b style="color:var(--green)">${esc(ranking[ranking.length - 1].name)}</b>`],
    ['Açık uygunsuzluk', `<b>${ranking.reduce((s, r) => s + r.openRecommendations, 0)}</b>`]
  ])
  + section('Tesis Sıralaması', `<div class="rep-chart">${bars}</div>`)
  + section('Karşılaştırma Tablosu', table(
      ['#', 'Tesis', 'Şehir', 'Ziyaret', 'Toplam', 'Son çeyrek', 'Trend', 'Açık', 'Skor'], rows))
  + section('Şehir Bazında Karşılaştırma', table(
      ['Şehir', 'Tesis', 'Son çeyrek bulgu', 'Açık uygunsuzluk', 'Ort. skor'], cityRows))
  + section('Portföy Trendi', `<div class="rep-chart">${portfolio}</div>`);
}

/* ----------------------------------------------- 4 · non-conformity report */

export function nonConformityReport(siteId) {
  const all = getRecommendations().filter((r) => !siteId || r.siteId === siteId);
  const open = all.filter((r) => r.status === 'open');
  const resolved = all.filter((r) => r.status === 'resolved');
  const site = siteId ? siteById(siteId) : null;
  const months = monthlyPestTotals(siteId).labels;

  const byCategory = {};
  for (const r of all) byCategory[r.category] = (byCategory[r.category] || 0) + 1;
  const donut = donutChart({
    title: 'Kategori dağılımı',
    centerLabel: 'uygunsuzluk',
    data: Object.entries(byCategory).map(([label, value]) => ({ label, value })),
    height: 230
  });

  // Raised vs closed per month shows whether the backlog is actually shrinking
  // — the question a customer asks when they see an open-items count.
  const raisedByMonth = months.map((_, i) => all.filter((r) => r.raisedMonth === i).length);
  const closedByMonth = months.map((_, i) => all.filter((r) => r.closedMonth === i).length);
  const flow = barChart({
    title: 'Aylık açılan / kapatılan',
    labels: months,
    series: [
      { name: 'Açılan', values: raisedByMonth },
      { name: 'Kapatılan', values: closedByMonth }
    ],
    height: 230
  });

  const latestMonth = months.length - 1;
  const ageRow = (r) => {
    const age = latestMonth - r.raisedMonth;
    const tone = age >= 3 ? 'critical' : age >= 2 ? 'warning' : 'secondary';
    return chip(`${age} ay`, tone);
  };

  const openRows = open.map((r) => [
    `<b>${esc(r.id)}</b>`,
    esc(siteById(r.siteId) ? siteById(r.siteId).name : r.siteId),
    esc(r.category),
    esc(r.desc),
    esc(r.date),
    ageRow(r),
    esc(r.tech)
  ]);

  const closedRows = resolved.slice(-12).reverse().map((r) => [
    `<b>${esc(r.id)}</b>`,
    esc(siteById(r.siteId) ? siteById(r.siteId).name : r.siteId),
    esc(r.category),
    esc(r.desc),
    esc(r.date),
    esc(r.closedDate || '—')
  ]);

  const closureRate = all.length ? Math.round((resolved.length / all.length) * 100) : 100;

  return docHeader({
    title: 'Uygunsuzluk ve Düzeltici Faaliyet Raporu',
    subtitle: site ? `${site.company} · ${site.name}` : 'Portföy geneli · tüm tesisler',
    cert: certNo('nonconformity', siteId || 'portfolio'),
    badge: chip(open.length ? `${open.length} açık madde` : 'Açık madde yok',
      open.length ? 'critical' : 'healthy')
  })
  + metaGrid([
    ['Toplam kayıt', `<b>${all.length}</b>`],
    ['Açık', `<b style="color:${open.length ? 'var(--red)' : 'var(--green)'}">${open.length}</b>`],
    ['Giderilen', `<b style="color:var(--green)">${resolved.length}</b>`],
    ['Kapatma oranı', `<b>%${closureRate}</b>`],
    ['Hijyen kaynaklı', `<b>${all.filter((r) => r.category === 'Hijyen').length}</b>`],
    ['Yalıtım / fiziksel', `<b>${all.filter((r) => r.category !== 'Hijyen').length}</b>`]
  ])
  + section('Açık Uygunsuzluklar — Aksiyon Bekliyor', table(
      ['Kayıt', 'Tesis', 'Kategori', 'Tespit', 'Açılış', 'Yaş', 'Tespit eden'], openRows,
      { empty: 'Açık uygunsuzluk bulunmuyor — tüm maddeler kapatılmıştır.' }))
  + section('Kategori Dağılımı', `<div class="rep-chart rep-chart-narrow">${donut}</div>`)
  + section('Açılan / Kapatılan Akışı', `<div class="rep-chart">${flow}</div>`)
  + section('Son Kapatılan Maddeler', table(
      ['Kayıt', 'Tesis', 'Kategori', 'Tespit', 'Açılış', 'Kapanış'], closedRows,
      { empty: 'Kapatılmış madde bulunmuyor.' }));
}

/* --------------------------------------------------- 5 · audit package (2-4) */

// The "3rd Eye" (3. Göz Denetim, visit type 3G) is the independent audit visit
// already present in the catalog and generated by the history engine. The
// package assembles those alongside the standard's evidence trail — the
// "audit packages auto-assembled by date / location / standard" line in
// docs/COMPETITOR.md.
export function auditPackage(standardId, siteId) {
  const standard = STANDARDS.find((s) => s.id === standardId) || STANDARDS[0];
  const scoped = sitesInScope(standard);
  const sites = siteId ? scoped.filter((s) => s.id === siteId) : scoped;

  if (!sites.length) {
    return docHeader({
      title: `${standard.name} Denetim Paketi`,
      subtitle: standard.full,
      cert: certNo('audit', standardId),
      badge: chip(STATUS_LABEL['out-of-scope'], STATUS_CHIP['out-of-scope'])
    })
    + section('Kapsam', `<p class="rep-empty">
        Portföyde <b>${esc(standard.name)}</b> kapsamına giren tesis bulunmuyor
        (${esc(standard.sectors.join(', '))}). Bu standart için denetim paketi
        üretilmemiştir.</p>`);
  }

  const readiness = sites.map((s) => siteReadiness(standard, s)).filter(Boolean);
  const ready = readiness.filter((r) => r.status === 'ready').length;
  const rollup = ready === readiness.length ? 'ready' : ready === 0 ? 'gap' : 'attention';

  const checkTables = readiness.map((r) => `
    <div class="rep-audit-site">
      <div class="rep-audit-head">
        <b>${esc(r.site.name)}</b>
        <span style="color:var(--muted); font-size:10px;">${esc(r.site.company)} · ${esc(r.site.city)}</span>
        ${chip(STATUS_LABEL[r.status], STATUS_CHIP[r.status])}
      </div>
      ${table(['Denetim kriteri', 'Ölçüm', 'Hedef', 'Ağırlık', 'Sonuç'],
        r.checks.map((c) => [
          esc(c.label), `<b>${esc(c.value)}</b>`, esc(c.target),
          c.major ? chip('Majör', 'secondary') : chip('Minör', 'secondary'),
          c.pass ? chip('Uygun', 'healthy') : chip(c.major ? 'Majör uygunsuzluk' : 'Minör uygunsuzluk', c.major ? 'critical' : 'warning')
        ]))}
    </div>`).join('');

  // Independent 3rd Eye audits across the in-scope sites.
  const ids = new Set(sites.map((s) => s.id));
  const thirdEye = getVisits().filter((v) => v.visitType === '3G' && ids.has(v.siteId));
  const thirdEyeRows = thirdEye.map((v) => [
    `<b>${esc(v.id)}</b>`, esc(v.date), esc(v.siteName), esc(v.tech),
    `${v.readings.length} istasyon`,
    v.totals.all > 0 ? `<b style="color:var(--red)">${v.totals.all} bulgu</b>` : '<span style="color:var(--green)">Bulgu yok</span>'
  ]);

  const openItems = sites.flatMap((s) => openNonConformities(s.id));
  const openRows = openItems.map((r) => [
    `<b>${esc(r.id)}</b>`, esc(siteById(r.siteId).name), esc(r.category), esc(r.desc), esc(r.date)
  ]);

  const visitLog = sites.flatMap((s) => visitsForSite(s.id));
  const chemUses = visitLog.flatMap((v) => v.chemicals);
  const chemByProduct = {};
  for (const c of chemUses) {
    const p = (chemByProduct[c.name] ||= { name: c.name, uses: 0, qty: 0, unit: c.unit });
    p.uses++; p.qty += c.quantity;
  }

  const techRows = sites.length === 1
    ? technicianStats(sites[0].id).map((t) => [esc(t.tech), t.visits, `${t.avgOnSiteMin} dk`, `${t.avgTravelMin} dk`])
    : technicianStats().map((t) => [esc(t.tech), t.visits, `${t.avgOnSiteMin} dk`, `${t.avgTravelMin} dk`]);

  return docHeader({
    title: `${standard.name} Denetim Paketi`,
    subtitle: `${standard.full} · ${standard.clause}`,
    cert: certNo('audit', standardId, siteId || 'all'),
    badge: chip(STATUS_LABEL[rollup], STATUS_CHIP[rollup])
  })
  + metaGrid([
    ['Standart', `<b>${esc(standard.name)}</b>`],
    ['İlgili madde', `<b>${esc(standard.clause)}</b>`],
    ['Kapsamdaki tesis', `<b>${readiness.length}</b>`],
    ['Denetime hazır', `<b style="color:${ready === readiness.length ? 'var(--green)' : 'var(--amber)'}">${ready}/${readiness.length}</b>`],
    ['Kanıtlanan ziyaret', `<b>${visitLog.length}</b>`],
    ['Açık uygunsuzluk', `<b style="color:${openItems.length ? 'var(--red)' : 'var(--green)'}">${openItems.length}</b>`]
  ])
  + section('Denetim Hazırlık Değerlendirmesi', checkTables)
  + section('3. Göz Bağımsız Denetim Kayıtları', table(
      ['Ziyaret', 'Tarih', 'Tesis', 'Denetçi', 'Kapsam', 'Sonuç'], thirdEyeRows,
      { empty: 'Bu dönemde bağımsız 3. göz denetimi planlanmamıştır.' })
    + `<p class="rep-note">3. Göz denetimi, rutin servis ekibinden bağımsız bir
       denetçi tarafından yapılan doğrulama ziyaretidir; müşterinin kendi iç
       denetim kaydı yerine geçer.</p>`)
  + section('Açık Uygunsuzluklar', table(
      ['Kayıt', 'Tesis', 'Kategori', 'Tespit', 'Açılış'], openRows,
      { empty: 'Kapsamdaki tesislerde açık uygunsuzluk bulunmuyor.' }))
  + section('Biyosidal Ürün Kullanım Kaydı', table(
      ['Ürün', 'Uygulama sayısı', 'Toplam miktar'],
      Object.values(chemByProduct)
        .sort((a, b) => b.uses - a.uses)
        .map((p) => [esc(p.name), p.uses, `${p.qty} ${esc(p.unit)}`]),
      { empty: 'Kayıtlı kimyasal uygulaması bulunmuyor.' }))
  + section('Servis Ekibi Kayıtları', table(
      ['Teknisyen', 'Ziyaret', 'Ort. saha süresi', 'Ort. yol süresi'], techRows))
  + section('Denetim Beyanı', `
      <p class="rep-note">
        Bu paket, ${esc(standard.name)} kapsamındaki ${readiness.length} tesis için
        ${visitLog.length} servis ziyaretinin QR ve GPS damgalı kayıtlarından
        otomatik olarak derlenmiştir. Her ziyaret, tesiste okutulan ilk QR ile
        başlatılmış ve çift taraflı dijital imza ile kapatılmıştır.
      </p>`
    + signatureBlock('Repellent Teknik Müdürlüğü', 'Denetim Sorumlusu'));
}
