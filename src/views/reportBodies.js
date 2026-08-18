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
  chemicalStats, getRecommendations, siteRanking, technicianStats,
  pointDeviceSummary, readingsForPoint, deviceReplacements, barcodeFor
} from '../data/history.js';
import { allSites } from '../core/state.js';
import {
  visitTypes, equipmentTypes, getStationArea, placementSummary
} from '../data/catalog.js';
import { STANDARDS, siteReadiness, sitesInScope, STATUS_LABEL, STATUS_CHIP, openNonConformities } from '../data/compliance.js';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const visitTypeName = (code) => (visitTypes.find((v) => v.code === code) || {}).name || code;
const equipmentName = (type) => (equipmentTypes[type] || {}).name || type;
// Live portfolio, so a facility created in the app resolves here too — it just
// renders with empty history until it has been serviced.
const siteById = (id) => allSites().find((s) => s.id === id);

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
        <strong>LADYBUG</strong>
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

/* ------------------------------- 6 · placement-list activity report (§3–4, §10) */

// The roadmap's "yerleşim listesi": every monitoring point at a facility, laid
// out per device family (bait boxes, detectors, fly units and trap types each
// get their own sheet in §4), with the activity recorded against it after
// service — "Bu oluşan listelerde daha sonra servis verildikten sonra girilecek
// veriler ile oluşan listelerdir" (§3).
//
// The point number is the permanent identity, not the barcode (§8), so the
// activity totals below span every device that has ever occupied the point and
// the replacement log states where the hardware changed.
// One row per monitoring point, enriched with its whole-window reading history.
// Exported so the CSV export builds from exactly the same numbers the printed
// sheet shows, rather than re-deriving them and drifting.
export function placementPoints(siteId) {
  const site = siteById(siteId);
  const stations = (site && site.stations) || [];

  return stations.map((st) => {
    const summary = pointDeviceSummary(siteId, st.code);
    const readings = readingsForPoint(siteId, st.code);
    const placement = st.placement || {};

    // Dominant species at this point over the window — what the point is
    // actually catching, which is the reason the list carries activity at all.
    const bySpecies = {};
    for (const r of readings) {
      if (r.pestCount > 0) bySpecies[r.pestName] = (bySpecies[r.pestName] || 0) + r.pestCount;
    }
    const dominant = Object.entries(bySpecies).sort((a, b) => b[1] - a[1])[0];
    const last = readings[readings.length - 1];

    return {
      station: st,
      code: st.code,
      family: equipmentName(st.type),
      area: placement.areaName || getStationArea(st.x, st.y),
      pointNo: placement.pointNo || st.code.replace(/^\D+/, ''),
      specs: placementSummary(st),
      barcode: summary.generations.length
        ? summary.generations[summary.generations.length - 1].barcode
        : barcodeFor(siteId, st.code, 1),
      generations: summary.generations.length || 1,
      readings: summary.totalReadings,
      totalPests: summary.totalPests,
      dominant: dominant ? `${dominant[0]} (${dominant[1]})` : '—',
      lastStatus: last ? last.status : st.status,
      lastDate: last ? last.date : '—'
    };
  });
}

export function placementActivityReport(siteId) {
  const site = siteById(siteId);
  const points = placementPoints(siteId);

  // Group into the per-family placement sheets the roadmap defines.
  const families = new Map();
  for (const p of points) {
    if (!families.has(p.family)) families.set(p.family, []);
    families.get(p.family).push(p);
  }

  const familySections = [...families.entries()].map(([family, rows]) => {
    const pests = rows.reduce((s, r) => s + r.totalPests, 0);
    return `
      <div class="rep-audit-site">
        <div class="rep-audit-head">
          <b>${esc(family)}</b>
          <span style="color:var(--muted); font-size:10px;">${rows.length} nokta · ${rows.reduce((s, r) => s + r.readings, 0)} okuma</span>
          ${chip(pests ? `${pests} bulgu` : 'Bulgu yok', pests ? 'critical' : 'healthy')}
        </div>
        ${table(['Nokta', 'Bölge Adı', 'Güncel Barkod', 'Okuma', 'Toplam Bulgu', 'Baskın Tür', 'Son Durum'],
          rows.map((r) => {
            const [label, kind] = STATUS_TR[r.lastStatus] || ['—', 'secondary'];
            return [
              `<b>${esc(r.code)}</b>${r.specs ? `<br><span style="color:var(--muted); font-size:10px;">${esc(r.specs)}</span>` : ''}`,
              esc(r.area),
              `<span style="font-family:ui-monospace,monospace; font-size:10px;">${esc(r.barcode)}</span>${r.generations > 1 ? `<br><span style="color:var(--amber); font-size:10px;">${r.generations}. cihaz</span>` : ''}`,
              r.readings,
              r.totalPests > 0 ? `<b style="color:var(--red)">${r.totalPests}</b>` : '<span style="color:var(--muted)">0</span>',
              esc(r.dominant),
              `${chip(label, kind)}<br><span style="color:var(--muted); font-size:10px;">${esc(r.lastDate)}</span>`
            ];
          }))}
      </div>`;
  }).join('');

  // Activity per point — the heat ranking a facility manager reads first.
  const ranked = points.slice().sort((a, b) => b.totalPests - a.totalPests).slice(0, 10);
  const bars = barChart({
    title: 'Nokta bazında toplam bulgu · en yoğun 10 nokta',
    labels: ranked.map((r) => r.code),
    series: [{ name: 'Toplam bulgu', values: ranked.map((r) => r.totalPests) }],
    height: 250
  });

  // §8: a swapped device keeps the point's number and its history.
  const swaps = deviceReplacements(siteId);
  const swapRows = swaps.map((s) => [
    `<b>${esc(s.code)}</b>`,
    esc(s.date),
    chip(esc(s.reason), s.reasonCode === 'KA' ? 'critical' : 'warning'),
    `<span style="font-family:ui-monospace,monospace; font-size:10px;">${esc(s.oldBarcode)}</span>`,
    `<span style="font-family:ui-monospace,monospace; font-size:10px;">${esc(s.newBarcode)}</span>`,
    esc(s.note)
  ]);

  const totalPests = points.reduce((s, p) => s + p.totalPests, 0);
  const activePoints = points.filter((p) => p.totalPests > 0).length;

  return docHeader({
    title: 'Yerleşim Listesi ve Aktivite Raporu',
    subtitle: `${site.company} · ${site.name} · ${points.length} kontrol noktası`,
    cert: certNo('placement', siteId),
    badge: chip(`${families.size} ekipman ailesi`, 'secondary')
  })
  + metaGrid([
    ['Toplam nokta', `<b>${points.length}</b>`],
    ['Ekipman ailesi', `<b>${families.size}</b>`],
    ['Toplam okuma', `<b>${points.reduce((s, p) => s + p.readings, 0)}</b>`],
    ['Toplam bulgu', `<b style="color:${totalPests ? 'var(--red)' : 'var(--green)'}">${totalPests}</b>`],
    ['Aktivite görülen nokta', `<b>${activePoints}/${points.length}</b>`],
    ['Cihaz değişimi', `<b>${swaps.length}</b>`]
  ])
  + section('Nokta Bazında Aktivite Yoğunluğu', `<div class="rep-chart">${bars}</div>`)
  + section('Yerleşim Listeleri — Ekipman Ailesi Bazında', familySections)
  + section('Cihaz Değişim Kayıtları', table(
      ['Nokta', 'Tarih', 'Sebep', 'Eski Barkod', 'Yeni Barkod', 'Not'], swapRows,
      { empty: 'Bu tesiste kayıtlı cihaz değişimi bulunmuyor.' })
    + `<p class="rep-note">Kayıp, kırık veya yenilenen bir cihazın yerine aynı
       nokta numarasına yeni barkod tanımlanır; noktaya ait eski okuma kayıtları
       ölçüm ve kıyaslama için korunur.</p>`);
}

/* --------------------------------------- 7 · activity-only report (§7, §10) */

// §10 lists a standalone activity report among the documents printable at the
// end of a visit ("aktivite girildiği için sadece aktivite raporu"). Unlike the
// service report it carries no clean stations at all — only what was found, at
// which point, of which species and how many, the way §7 describes it: "10 nolu
// yem istasyonunda 2 adet fare, 45 nolu sinek cihazında 23 adet karasinek".
export function activityReport(visit) {
  const site = siteById(visit.siteId);
  const stationByCode = new Map((site.stations || []).map((s) => [s.code, s]));

  const active = visit.readings.filter((r) => r.pestCount > 0);
  const faults = visit.readings.filter((r) => r.status === 'damaged' || r.status === 'missing');

  const areaOf = (code) => {
    const st = stationByCode.get(code);
    if (!st) return '—';
    return (st.placement && st.placement.areaName) || getStationArea(st.x, st.y);
  };

  const activityRows = active
    .slice()
    .sort((a, b) => b.pestCount - a.pestCount)
    .map((r) => [
      `<b>${esc(r.code)}</b>`,
      esc(equipmentName(r.type)),
      esc(areaOf(r.code)),
      `<b>${esc(r.pestName)}</b>`,
      `<b style="color:var(--red)">${r.pestCount}</b>`,
      chip((STATUS_TR[r.status] || ['—', 'secondary'])[0], (STATUS_TR[r.status] || ['', 'secondary'])[1])
    ]);

  // Species rollup, with the points each species was found at.
  const bySpecies = {};
  for (const r of active) {
    const s = (bySpecies[r.pestName] ||= { name: r.pestName, count: 0, points: [] });
    s.count += r.pestCount;
    s.points.push(`${r.code} (${r.pestCount})`);
  }
  const speciesList = Object.values(bySpecies).sort((a, b) => b.count - a.count);

  const speciesRows = speciesList.map((s) => [
    `<b>${esc(s.name)}</b>`,
    `<b style="color:var(--red)">${s.count}</b>`,
    s.points.length,
    `<span style="font-size:10px;">${esc(s.points.join(' · '))}</span>`
  ]);

  const donut = speciesList.length
    ? donutChart({
        title: 'Tür dağılımı',
        centerLabel: 'bulgu',
        centerValue: String(visit.totals.all),
        data: speciesList.map((s) => ({ label: s.name, value: s.count })),
        height: 240
      })
    : '';

  const faultRows = faults.map((r) => [
    `<b>${esc(r.code)}</b>`,
    esc(equipmentName(r.type)),
    esc(areaOf(r.code)),
    chip((STATUS_TR[r.status] || ['—', 'secondary'])[0], 'warning')
  ]);

  const chemRows = visit.chemicals.map((c) => [
    esc(c.name), `${c.quantity} ${esc(c.unit)}`, esc(c.area), esc(c.tech)
  ]);

  return docHeader({
    title: 'Aktivite Raporu',
    subtitle: `${site.company} · ${visit.siteName} · ${visit.date}`,
    cert: certNo('activity', visit.id),
    badge: chip(visit.totals.all ? `${visit.totals.all} bulgu` : 'Aktivite yok',
      visit.totals.all ? 'critical' : 'healthy')
  })
  + metaGrid([
    ['Ziyaret No', `<b>${esc(visit.id)}</b>`],
    ['Tarih', `<b>${esc(visit.date)}</b>`],
    ['Ziyaret Tipi', `<b>${esc(visitTypeName(visit.visitType))}</b>`],
    ['Teknisyen', `<b>${esc(visit.tech)}</b>`],
    ['Aktivite görülen nokta', `<b style="color:${active.length ? 'var(--red)' : 'var(--green)'}">${active.length}/${visit.readings.length}</b>`],
    ['Toplam bulgu', `<b style="color:${visit.totals.all ? 'var(--red)' : 'var(--green)'}">${visit.totals.all}</b>`]
  ])
  + section('Aktivite Tespit Edilen Noktalar', table(
      ['Nokta', 'Cihaz Tipi', 'Bölge', 'Gözlenen Tür', 'Adet', 'Durum'], activityRows,
      { empty: 'Bu ziyarette hiçbir noktada zararlı aktivitesi tespit edilmemiştir.' }))
  + section('Kategori Dağılımı', statRow([
      { label: 'Kemirgen', value: visit.totals.rodent, tone: visit.totals.rodent ? 'red' : null },
      { label: 'Uçan haşere', value: visit.totals.flying, tone: visit.totals.flying ? 'red' : null },
      { label: 'Yürüyen haşere', value: visit.totals.crawler, tone: visit.totals.crawler ? 'red' : null },
      { label: 'Farklı tür', value: speciesList.length },
      { label: 'Arızalı / kayıp cihaz', value: faults.length, tone: faults.length ? 'amber' : null }
    ]))
  + (speciesList.length
      ? section('Tür Bazında Döküm', table(
          ['Gözlenen Tür', 'Toplam Adet', 'Nokta Sayısı', 'Tespit Edilen Noktalar'], speciesRows)
        + `<div class="rep-chart rep-chart-narrow">${donut}</div>`)
      : '')
  + section('Ekipman Arıza ve Kayıp Kayıtları', table(
      ['Nokta', 'Cihaz Tipi', 'Bölge', 'Durum'], faultRows,
      { empty: 'Bu ziyarette arızalı veya kayıp cihaz kaydedilmemiştir.' }))
  + section('Aktiviteye Karşı Uygulanan Ürünler', table(
      ['Ürün', 'Miktar', 'Uygulama Alanı', 'Uygulayan'], chemRows,
      { empty: 'Bu ziyarette kimyasal uygulama yapılmamıştır.' })
    + `<p class="rep-note">Aktivite kayıtları tesiste okutulan QR kodları ile
       noktaya bağlanmıştır; adet bilgileri saha formunda teknisyen tarafından
       girilmiştir.</p>`);
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
    + signatureBlock('Ladybug Teknik Müdürlüğü', 'Denetim Sorumlusu'));
}
