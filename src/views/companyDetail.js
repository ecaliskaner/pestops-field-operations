// Facility detail page: profile, tabs, floor plan, stations.
// Extracted from app.js (Phase 0a-3).

import { $, $$, esc } from '../core/dom.js';
import { recalculateSiteStats, state } from '../core/state.js';
import { ui } from '../core/session.js';
import { chemicalDatabase, equipmentStatusCodes, equipmentTypes, getChemicalDocuments, getPlacementSchema, getStationArea, pestDatabase, placementSummary, stationAreaName, stateLabel } from '../data/catalog.js';
import { setView } from '../core/router.js';
import { renderClientAnalytics } from '../views/insights.js';
import { toast } from '../core/dom.js';
import { save } from '../core/state.js';
import { modal, printQrCodeSticker } from '../ui/modal.js';
import { deductStock } from '../views/inventory.js';
import { renderSites } from '../views/sites.js';
import {
  barcodeFor, deviceReplacements, pointDeviceSummary, readingsForPoint,
  recommendationsForSite, replacementReasons, technicianStats
} from '../data/history.js';
import { credentialDocs, KVKK_NOTICE } from '../data/credentials.js';
import { renderFloorPlan } from './floorPlan.js';
import { visitsPerMonth } from '../data/schedule.js';
import { demoToday } from '../data/history.js';
import { techData } from '../data/seed.js';

// Human-readable service cadence, derived from the contracted scope rather
// than stored as prose — so it can never disagree with the visit plan.
function describeFrequency(site) {
  const t = demoToday();
  const n = visitsPerMonth(site, t.month);
  if (n >= 4) return `Haftalık (ayda ${n} servis)`;
  if (n === 2) return '15 günde bir (ayda 2 servis)';
  if (n === 1) return 'Aylık periyodik koruma';
  return `Ayda ${n} servis`;
}

export function showCompanyDetail(siteId) {
  ui.activeSiteId = siteId;
  ui.activeStationCode = null;
  const site = state.sites.find(s => s.id === siteId);
  if (!site) return;
  
  recalculateSiteStats(site);
  
  // Page headers
  $('#compParentCompany').textContent = site.company.toUpperCase();
  $('#compHeaderName').textContent = site.name;
  $('#compHeaderMeta').textContent = `${site.city} · Son Servis: ${site.last} · Sıradaki: ${site.next}`;
  
  // Left Sidebar Profile Card
  const avatar = $('#compAvatarLogo');
  if (avatar) avatar.textContent = site.company.slice(0, 2).toUpperCase();
  
  $('#compProfileName').textContent = site.company;
  
  const sectorBadge = $('#compSectorBadge');
  if (sectorBadge) {
    sectorBadge.textContent = site.sector || "Genel Hizmet";
    sectorBadge.className = `status-chip ${site.state === 'healthy' ? 'healthy' : site.state === 'risk' ? 'critical' : 'warning'}`;
  }
  
  $('#compHealthScore').textContent = site.score;
  $('#compHealthStateText').textContent = stateLabel[site.state];
  
  const scoreGauge = $('#compScoreGauge');
  if (scoreGauge) {
    scoreGauge.style.borderLeft = `5px solid ${site.state === 'healthy' ? 'var(--green)' : site.state === 'risk' ? 'var(--red)' : 'var(--amber)'}`;
  }
  
  // Tab 1: Overview stats
  const total = site.stations.length;
  const checked = site.stations.filter(s => s.checked).length;
  
  $('#compOverviewTotalStations').textContent = total;
  $('#compOverviewCheckedStations').textContent = `${checked}/${total}`;
  $('#compOverviewActiveIssues').textContent = site.issues;
  
  // Calculate and display control rate dynamically
  const rate = total > 0 ? Math.round((checked / total) * 100) : 0;
  const ratePercentEl = $('#compControlRatePercent');
  const rateBarEl = $('#compControlRateBar');
  if (ratePercentEl) ratePercentEl.textContent = `${rate}%`;
  if (rateBarEl) rateBarEl.style.width = `${rate}%`;

  $('#compContactName').textContent = site.contact ? site.contact.name : "Temsilci Yok";
  $('#compContactPhone').textContent = site.contact ? site.contact.phone : "—";
  $('#compContactEmail').textContent = site.contact ? site.contact.email : "—";

  // Contract Details
  const contractPeriodEl = $('#compContractPeriod');
  const serviceFrequencyEl = $('#compServiceFrequency');
  const addressEl = $('#compAddress');
  // These used to fall back to per-site-id hardcoded strings, which meant any
  // facility beyond s1/s2/s3 was shown another site's address and a made-up
  // frequency. Every site now carries a real address, and the service frequency
  // is derived from the contracted scope the planner already works from.
  if (contractPeriodEl) contractPeriodEl.textContent = (site.contract && site.contract.period) || 'Sözleşme tanımlanmadı';
  if (serviceFrequencyEl) serviceFrequencyEl.textContent = site.serviceFrequency || describeFrequency(site);
  if (addressEl) addressEl.textContent = site.address || '—';
  
  // Tab 2: Map Stats
  const checkedClean = site.stations.filter(s => s.checked && s.status === 'clean').length;
  const checkedActivity = site.stations.filter(s => s.checked && s.status === 'activity').length;
  const damaged = site.stations.filter(s => s.checked && (s.status === 'damaged' || s.status === 'missing')).length;
  const unchecked = site.stations.filter(s => !s.checked).length;
  
  const totalLabel = document.querySelector('#paneCompMap #facilityTotalStations');
  const cleanLabel = document.querySelector('#paneCompMap #facilityCheckedClean');
  const actLabel = document.querySelector('#paneCompMap #facilityCheckedActivity');
  const dmgLabel = document.querySelector('#paneCompMap #facilityDamaged');
  const unLabel = document.querySelector('#paneCompMap #facilityUnchecked');
  
  if (totalLabel) totalLabel.textContent = total;
  if (cleanLabel) cleanLabel.textContent = checkedClean;
  if (actLabel) actLabel.textContent = checkedActivity;
  if (dmgLabel) dmgLabel.textContent = damaged;
  if (unLabel) unLabel.textContent = unchecked;
  
  // Render nodes
  renderFloorPlan(site);
  renderStationMarkers(site.stations);
  
  // Render applied methods
  renderCompanyMethods(site);
  
  // Render files table
  renderCompanyFiles(site);

  // Render stations tracking table
  renderCompanyStationsTable(site);

  // Render recommendations table
  renderCompanyRecommendations(site);

  // Render chemical usage tab
  renderChemicalUsage(site);
  renderChemicalDocLibrary(site);
  
  // Render service scope in overview
  renderServiceScope(site);
  
  // Reset form panel
  $('#stationDetailsEmpty').classList.remove('hidden');
  $('#stationDetailsContent').classList.add('hidden');
  
  // Reset active filter button styling
  $$('[data-station-filter]').forEach(x => x.classList.toggle('active', x.dataset.stationFilter === 'all'));
  
  switchCompanyTab('overview');
  setView('companyDetail');
}

export function switchCompanyTab(tabId) {
  $$('.comp-nav-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.compTab === tabId);
  });
  
  const tabPanes = {
    overview: 'paneCompOverview',
    map: 'paneCompMap',
    methods: 'paneCompMethods',
    files: 'paneCompFiles',
    recommendations: 'paneCompRecommendations',
    chemicals: 'paneCompChemicals',
    analytics: 'paneCompAnalytics',
    credentials: 'paneCompCredentials'
  };

  Object.entries(tabPanes).forEach(([t, id]) => {
    const pane = $(`#${id}`);
    if (pane) pane.classList.toggle('hidden', t !== tabId);
  });

  if (tabId === 'analytics') {
    renderClientAnalytics();
  } else if (tabId === 'credentials') {
    const site = state.sites.find(s => s.id === ui.activeSiteId);
    if (site) renderCompanyCredentials(site);
  }
}

// Roadmap §11: the customer can open the technicians who serviced their site
// and see each one's compliance documents (SGK, iş güvenliği, uygulama izni,
// portör sağlık raporu). Which technicians serviced this facility is derived
// from the visit history, so the list is honest — no one who never attended
// appears. Documents are KVKK-safe placeholders (see data/credentials.js).
export function renderCompanyCredentials(site) {
  const host = $('#compCredentialsList');
  if (!host) return;

  const stats = technicianStats(site.id);
  const techs = stats.length ? stats.map(t => t.tech) : ['Ayşe Demir'];

  host.innerHTML = techs.map(tech => {
    const meta = techData[tech] || [];
    const initials = meta[0] || tech.slice(0, 2).toUpperCase();
    const stat = stats.find(s => s.tech === tech);
    const visitNote = stat ? `Bu tesiste ${stat.visits} ziyaret` : 'Atanmış teknisyen';
    return `
      <div class="cred-card panel" style="box-shadow:none; border:1px solid var(--line);">
        <div class="cred-head">
          <span class="tech-avatar" style="background:${meta[5] || '#eee'}">${initials}</span>
          <div><b>${tech}</b><span>${visitNote}</span></div>
        </div>
        <div class="cred-docs">
          ${credentialDocs(tech)}
        </div>
      </div>`;
  }).join('');

  host.insertAdjacentHTML('beforeend', `<p class="cred-kvkk">${KVKK_NOTICE} Belgeler yalnızca hizmet süresince ve yalnızca ilgili tesise gösterilir.</p>`);
}

export function renderCompanyMethods(site) {
  const container = $('#compMethodsContainer');
  if (!container) return;
  if (!site.methods) site.methods = [];
  
  container.innerHTML = site.methods.map(m => `
    <div class="method-card">
      <div class="method-info">
        <h3>${m.name}</h3>
        <p>${m.desc}</p>
      </div>
      <span class="method-status-badge ${m.active ? 'active' : 'inactive'}">
        ${m.active ? 'Aktif Uygulama' : 'Aktif Değil'}
      </span>
    </div>
  `).join('') || '<p class="empty">Bu tesis için kayıtlı mücadele yöntemi bulunmuyor.</p>';
}

export function renderCompanyFiles(site) {
  const tbody = $('#compFilesTableBody');
  if (!tbody) return;
  if (!site.files) site.files = [];
  
  const filesCountLabel = $('#compFilesCount');
  if (filesCountLabel) filesCountLabel.textContent = site.files.length;
  
  tbody.innerHTML = site.files.map((f, index) => {
    const category = f.category || (f.name.includes('Sozlesme') || f.name.includes('Protokol') ? 'Sözleşme' : (f.name.includes('Risk') ? 'Risk Analizi' : 'SDS'));
    
    let badgeClass = 'secondary';
    if (category === 'Sözleşme') badgeClass = 'blue';
    else if (category === 'SDS') badgeClass = 'warning';
    else if (category === 'Risk Analizi') badgeClass = 'violet';
    else if (category === 'Biyosidal İzin') badgeClass = 'healthy';
    else if (category === 'Servis') badgeClass = 'green';
    
    return `
      <tr>
        <td><b>${f.name}</b></td>
        <td><span class="status-chip ${badgeClass}" style="font-size:9px; font-weight:700;">${category}</span></td>
        <td>${f.size}</td>
        <td>${f.date}</td>
        <td>
          <button class="text-btn download-file-btn" data-file-index="${index}" style="padding:0; font-size:11px;">İndir ↓</button>
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="5" class="empty" style="text-align:center;">Henüz yüklenmiş belge bulunmuyor.</td></tr>';
}

// ===== Closed-loop recommendation workflow (task 1-6) =====
//
// Roadmap §9: the technician photographs the problem and sets a deadline; the
// customer uploads a photo of the same area once they have acted; finally the
// technician approves whether the completed action is adequate. Three roles,
// one loop, with the stage visible at every step.

// Which finding the detail panel is showing, and the photo the customer has
// attached but not yet submitted. Both are view state, so they stay local
// rather than going into the shared `ui` cursor holder.
let activeRecId = null;
let pendingCustomerPhoto = null;

// `waitingStep` is the step the loop is currently sitting on — the one the
// stepper highlights and whose owner gets the controls. 0 means the loop is
// closed and nobody is waiting.
export const LOOP_STAGES = {
  raised:            { label: 'Bulgu Açıldı',         short: 'Açık',          chip: 'critical', waitingStep: 2, order: 1, actor: 'Müşteri aksiyonu bekleniyor' },
  customer_actioned: { label: 'Müşteri Aksiyon Aldı', short: 'Onay Bekliyor', chip: 'warning',  waitingStep: 3, order: 2, actor: 'Teknisyen onayı bekleniyor' },
  rejected:          { label: 'Onaylanmadı',          short: 'Reddedildi',    chip: 'critical', waitingStep: 2, order: 2, actor: 'Müşterinin tekrar aksiyon alması gerekiyor' },
  approved:          { label: 'Onaylandı & Kapatıldı', short: 'Kapandı',      chip: 'healthy',  waitingStep: 0, order: 3, actor: 'Döngü tamamlandı' }
};

// User-driven lifecycle changes live in state (so they survive a reload) and
// are layered over the generated history when rendering, rather than mutating
// the history module's cache.
function lifecycleOverlay() {
  if (!state.recLifecycle) state.recLifecycle = {};
  return state.recLifecycle;
}

/**
 * Findings for a site from both sources — the 12-month generated history and
 * any raised by hand during the demo — normalised onto one shape, with the
 * lifecycle overlay applied.
 */
export function loopRecommendations(site) {
  const overlay = lifecycleOverlay();

  const fromHistory = recommendationsForSite(site.id).map(r => ({
    id: r.id,
    source: 'history',
    desc: r.desc,
    category: r.category,
    assignee: r.assignee || 'Tesis Yetkilisi',
    tech: r.tech,
    date: r.date,
    dueDate: r.dueDate,
    stationCode: r.stationCode,
    stage: r.stage,
    status: r.status,
    photoBefore: r.photoBefore,
    photoAfter: r.photoAfter,
    customerNote: r.customerNote,
    customerRespondedDate: r.customerRespondedDate,
    approvedBy: r.approvedBy,
    approvedDate: r.approvedDate,
    rejectionNote: r.rejectionNote
  }));

  const fromSite = (site.recommendations || []).map((r, index) => ({
    id: r.id || `RS-${index}`,
    source: 'site',
    siteIndex: index,
    desc: r.desc,
    category: r.category,
    assignee: r.assignee,
    tech: r.tech || (state.currentUser ? state.currentUser.name : 'Teknisyen'),
    date: r.date,
    dueDate: r.due,
    stationCode: r.stationCode || null,
    // Hand-raised findings start at the same first step of the loop.
    stage: r.status === 'resolved' ? 'approved' : 'raised',
    status: r.status,
    photoBefore: r.photoBefore || { kind: 'simulated', label: 'Tespit anı', ref: `${r.id || index}-before` },
    photoAfter: r.photoAfter || null,
    customerNote: null,
    customerRespondedDate: null,
    approvedBy: null,
    approvedDate: null,
    rejectionNote: null
  }));

  return [...fromSite, ...fromHistory]
    .map(r => ({ ...r, ...(overlay[r.id] || {}) }))
    .sort((a, b) => LOOP_STAGES[a.stage].order - LOOP_STAGES[b.stage].order);
}

// Photos are held as descriptors. A simulated one is drawn as an SVG so the
// demo always has evidence to show; a real upload carries its own data URL.
export function recPhotoSrc(photo) {
  if (!photo) return null;
  if (photo.kind === 'upload') return photo.dataUrl;

  // Deterministic tint from the ref, so the same finding always looks the same.
  let h = 0;
  for (let i = 0; i < (photo.ref || '').length; i++) h = (h * 31 + photo.ref.charCodeAt(i)) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${h},32%,62%)"/><stop offset="1" stop-color="hsl(${(h + 40) % 360},28%,38%)"/>
    </linearGradient></defs>
    <rect width="320" height="200" fill="url(#g)"/>
    <rect x="18" y="18" width="284" height="164" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="2" stroke-dasharray="7 5"/>
    <circle cx="160" cy="88" r="26" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="3"/>
    <path d="M147 88h26M160 75v26" stroke="rgba(255,255,255,.75)" stroke-width="3"/>
    <text x="160" y="140" font-family="DM Sans,sans-serif" font-size="14" font-weight="700" fill="#fff" text-anchor="middle">${photo.label || 'Saha fotoğrafı'}</text>
    <text x="160" y="160" font-family="DM Sans,sans-serif" font-size="10" fill="rgba(255,255,255,.85)" text-anchor="middle">simüle görsel · ${photo.ref || ''}</text>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function photoTile(photo, fallbackLabel) {
  if (!photo) {
    return `<div class="rec-photo empty"><span>${fallbackLabel}</span></div>`;
  }
  const badge = photo.kind === 'upload' ? 'Yüklendi' : 'Simüle';
  return `<div class="rec-photo">
      <img src="${recPhotoSrc(photo)}" alt="${photo.label || ''}">
      <span class="rec-photo-badge">${badge}</span>
    </div>`;
}

export function renderCompanyRecommendations(site) {
  const tbody = $('#compRecommendationsTableBody');
  if (!tbody) return;
  if (!site.recommendations) site.recommendations = [];

  const recs = loopRecommendations(site);
  const role = state.currentUser ? state.currentUser.role : 'admin';

  const countLabel = $('#compRecsCount');
  if (countLabel) countLabel.textContent = recs.filter(r => r.stage !== 'approved').length;

  renderLoopSummary(recs);

  tbody.innerHTML = recs.map(r => {
    const stage = LOOP_STAGES[r.stage] || LOOP_STAGES.raised;
    const selected = r.id === activeRecId ? ' class="rec-row-selected"' : '';
    return `
      <tr data-rec-id="${r.id}"${selected} style="cursor:pointer;">
        <td><b>${r.desc}</b>${r.stationCode ? `<br><small class="text-muted">Nokta: ${r.stationCode}</small>` : ''}</td>
        <td><span class="status-chip secondary" style="font-size:9px; font-weight:700;">${r.category}</span></td>
        <td>${r.assignee}</td>
        <td><small class="text-muted">${r.date}</small></td>
        <td><small>${r.dueDate || '—'}</small></td>
        <td><span class="status-chip ${stage.chip}">${stage.short}</span></td>
        <td><button class="text-btn rec-open-btn" data-rec-id="${r.id}" style="padding:0; font-size:11px; font-weight:700;">${nextActionLabel(r, role)}</button></td>
      </tr>`;
  }).join('') || '<tr><td colspan="7" class="empty" style="text-align:center;">Henüz açılmış bir öneri kaydı bulunmuyor.</td></tr>';

  // Keep the detail panel in sync with whatever is selected.
  if (activeRecId && recs.some(r => r.id === activeRecId)) {
    renderRecLoopDetail(site, activeRecId);
  }
}

// What this role can do next on this finding — drives both the row button and
// the detail panel's call to action.
function nextActionLabel(rec, role) {
  if (rec.stage === 'approved') return 'Görüntüle';
  if (role === 'client') return (rec.stage === 'raised' || rec.stage === 'rejected') ? 'Aksiyon Bildir →' : 'Görüntüle';
  if (rec.stage === 'customer_actioned') return 'Onayla / Reddet →';
  return 'Görüntüle';
}

function renderLoopSummary(recs) {
  const el = $('#recLoopSummary');
  if (!el) return;
  const count = (s) => recs.filter(r => r.stage === s).length;
  const cells = [
    ['raised', 'Açık Bulgu', count('raised')],
    ['customer_actioned', 'Onay Bekliyor', count('customer_actioned')],
    ['rejected', 'Reddedildi', count('rejected')],
    ['approved', 'Kapandı', count('approved')]
  ];
  el.innerHTML = cells.map(([key, label, n]) =>
    `<div class="rec-loop-stat ${key}"><strong>${n}</strong><span>${label}</span></div>`).join('');
}

export function renderRecLoopDetail(site, recId) {
  const el = $('#recLoopDetail');
  if (!el) return;

  const rec = loopRecommendations(site).find(r => r.id === recId);
  if (!rec) {
    el.innerHTML = '<p class="rec-loop-placeholder">Kapalı döngü detayını görmek için tablodan bir öneri seçin.</p>';
    return;
  }

  const role = state.currentUser ? state.currentUser.role : 'admin';
  const stage = LOOP_STAGES[rec.stage] || LOOP_STAGES.raised;

  const steps = [
    { n: 1, title: 'Teknisyen bulguyu açtı', who: rec.tech, when: rec.date, done: true },
    { n: 2, title: 'Müşteri aksiyon aldı', who: rec.assignee, when: rec.customerRespondedDate, done: !!rec.customerRespondedDate },
    { n: 3, title: 'Teknisyen onayladı', who: rec.approvedBy, when: rec.approvedDate, done: rec.stage === 'approved' }
  ];

  const stepper = steps.map(s => `
    <li class="rec-step ${s.done ? 'done' : ''} ${(!s.done && s.n === stage.waitingStep) ? 'current' : ''}">
      <span class="rec-step-no">${s.done ? '✓' : s.n}</span>
      <span class="rec-step-body">
        <b>${esc(s.title)}</b>
        <small>${s.done ? `${esc(s.who || '—')} · ${esc(s.when || '—')}` : 'bekliyor'}</small>
      </span>
    </li>`).join('');

  el.innerHTML = `
    <div class="rec-detail-head">
      <div>
        <p class="overline" style="margin:0;">KAPALI DÖNGÜ · ${esc(rec.id)}</p>
        <h3 class="rec-detail-title">${esc(rec.desc)}</h3>
        <p class="rec-detail-meta">${esc(rec.category)}${rec.stationCode ? ` · Nokta ${rec.stationCode}` : ''} · Termin: <b>${esc(rec.dueDate || '—')}</b></p>
      </div>
      <span class="status-chip ${esc(stage.chip)} rec-detail-stage">${esc(stage.label)}</span>
    </div>

    <ol class="rec-stepper">${stepper}</ol>

    <div class="rec-photos">
      <figure>
        <figcaption>ÖNCE — tespit fotoğrafı</figcaption>
        ${photoTile(rec.photoBefore, 'Fotoğraf yok')}
      </figure>
      <figure>
        <figcaption>SONRA — aksiyon fotoğrafı</figcaption>
        ${photoTile(rec.photoAfter, 'Müşteri henüz yüklemedi')}
      </figure>
    </div>

    ${rec.customerNote ? `<p class="rec-note customer"><b>Müşteri notu:</b> ${rec.customerNote}</p>` : ''}
    ${rec.rejectionNote ? `<p class="rec-note reject"><b>Onaylanmama nedeni:</b> ${rec.rejectionNote}</p>` : ''}

    <p class="rec-waiting-on">⏳ ${esc(stage.actor)}</p>

    ${renderRecActions(rec, role)}`;
}

// Only the role that owns the current step gets controls; everyone else sees
// why they cannot act.
function renderRecActions(rec, role) {
  const isTech = role === 'tech' || role === 'admin';

  if (rec.stage === 'approved') {
    return `<div class="rec-actions closed">✓ Bu bulgu ${rec.approvedDate || ''} tarihinde ${rec.approvedBy || 'teknisyen'} tarafından onaylanarak kapatıldı.</div>`;
  }

  if (role === 'client') {
    if (rec.stage === 'raised' || rec.stage === 'rejected') {
      return `
        <form class="rec-actions rec-customer-form" id="recCustomerForm" data-rec-id="${rec.id}">
          <p class="rec-actions-title">Aksiyonu bildirin — aynı alanın fotoğrafını yükleyin</p>
          <input type="file" accept="image/*" class="form-input rec-file" id="inpRecPhoto">
          <button type="button" class="secondary-btn rec-sim-photo" id="btnSimulateRecPhoto">📷 Fotoğrafı Simüle Et</button>
          <textarea class="form-textarea" name="customerNote" rows="2" placeholder="Alınan aksiyonu kısaca açıklayın..." required></textarea>
          <div class="rec-photo-preview hidden" id="recPhotoPreview"></div>
          <button type="submit" class="primary-btn">Aksiyonu Gönder →</button>
        </form>`;
    }
    return `<div class="rec-actions waiting">Aksiyonunuz iletildi. Repellent teknisyeninin onayı bekleniyor.</div>`;
  }

  if (isTech) {
    if (rec.stage === 'customer_actioned') {
      return `
        <form class="rec-actions rec-approve-form" id="recApprovalForm" data-rec-id="${rec.id}">
          <p class="rec-actions-title">Müşteri aksiyonunu değerlendirin</p>
          <textarea class="form-textarea" name="decisionNote" rows="2" placeholder="Reddediyorsanız gerekçe yazın (onay için isteğe bağlı)"></textarea>
          <div class="rec-decision-buttons">
            <button type="submit" name="decision" value="approve" class="primary-btn rec-approve">✓ Onayla & Kapat</button>
            <button type="submit" name="decision" value="reject" class="secondary-btn rec-reject">✕ Reddet</button>
          </div>
        </form>`;
    }
    return `<div class="rec-actions waiting">Müşterinin aksiyon almasını bekliyor. Termin: <b>${rec.dueDate || '—'}</b>.</div>`;
  }

  return '';
}

export function renderCompanyStationsTable(site) {
  const container = $('#compStationsTableBody');
  if (!container) return;
  
  const typeLabels = {};
  Object.entries(equipmentTypes).forEach(([key, val]) => { typeLabels[key] = val.name; });
  
  const statusLabels = {};
  Object.entries(equipmentStatusCodes).forEach(([key, val]) => { statusLabels[key] = val.name; });

  const baitLabels = {
    intact: 'Sağlam (Tüketilmedi)',
    consumed: 'Tüketildi',
    replaced: 'Yem Yenilendi',
    missing: 'Yem Eksik',
    missing_bait: 'Yem Yok / Eksik'
  };

  const pestLabels = {
    none: 'Yok',
    mouse: 'Fare',
    rat: 'Sıçan',
    cockroach: 'Hamamböceği',
    fly: 'Sinek',
    other: 'Diğer'
  };
  // Pre-populate pestLabels from pestDatabase
  Object.values(pestDatabase).forEach(category => {
    category.forEach(p => {
      pestLabels[p.code] = p.name;
    });
  });

  container.innerHTML = site.stations.map(s => {
    const planted = s.plantedDate || "15.01.2025";
    const lastCheck = s.checked ? (s.lastControl || "12 Tem 2026") : "—";
    const inspector = s.checked ? (s.controlledBy || "Ayşe Demir") : "—";
    const placement = s.placement || {};
    const area = stationAreaName(site, s);
    const typeLabel = typeLabels[s.type] || s.type;
    const specs = placementSummary(s);
    const statusText = statusLabels[s.status] || s.status;
    
    let statusClass = 'warning';
    if (s.checked) {
      if (s.status === 'clean') statusClass = 'healthy';
      else if (s.status === 'activity') statusClass = 'critical';
      else statusClass = 'warning';
    }

    let hasPests = s.pestCount > 0;
    let findings = '—';
    if (s.checked) {
      if (s.findings && s.findings.length > 0) {
        findings = s.findings.map(f => {
          const name = pestLabels[f.pestCode] || f.pestCode;
          if (f.count > 0) hasPests = true;
          return `${name} (${f.count} Adet)`;
        }).join(', ');
      } else {
        const name = pestLabels[s.pestType] || s.pestType;
        const countDesc = s.pestCount > 0 ? ` (${s.pestCount} Adet)` : '';
        findings = s.pestType !== 'none' ? `${name}${countDesc}` : 'Yok';
      }
    }
    const baitText = s.checked ? (baitLabels[s.baitStatus] || s.baitStatus) : '—';
    
    return `
      <tr onclick="showStationDetail('${s.code}'); switchCompanyTab('map');" style="cursor:pointer;">
        <td><strong>${s.code}</strong></td>
        <td>${typeLabel}${specs ? `<br><small class="text-muted">${specs}</small>` : ''}</td>
        <td><span style="color:#55616b; font-size:11px; font-weight:600;">📍 ${area}</span></td>
        <td><small class="text-muted">${planted}</small></td>
        <td><small>${lastCheck}</small></td>
        <td><b>${inspector}</b></td>
        <td><small>${baitText}</small></td>
        <td><span class="${hasPests ? 'attention' : ''}">${findings}</span></td>
        <td><span class="status-chip ${statusClass}">${statusText}</span></td>
      </tr>
    `;
  }).join('');
}

export function renderStationMarkers(stations, filterType = 'all') {
  const container = $('#stationMarkersLayer');
  if (!container) return;
  container.innerHTML = '';
  
  const isHeatmap = $('#heatmapToggleBtn') ? $('#heatmapToggleBtn').checked : false;
  
  stations.forEach(s => {
    if (filterType !== 'all' && s.type !== filterType) return;
    
    const marker = document.createElement('div');
    marker.className = `station-marker ${s.checked ? s.status : 'unchecked'}`;
    if (s.code === ui.activeStationCode) marker.classList.add('selected');
    
    marker.style.left = `${s.x}%`;
    marker.style.top = `${s.y}%`;
    marker.textContent = s.code;
    marker.title = `${s.code} (${s.type.toUpperCase()}) - ${s.checked ? 'Kontrol Edildi' : 'Bekliyor'}`;
    marker.dataset.stationCode = s.code;
    
    // Heat map density visualization
    if (isHeatmap) {
      marker.classList.add('heatmap-mode');
      if (s.status === 'activity') {
        const radius = s.pestCount > 10 ? 45 : (s.pestCount > 5 ? 32 : 24);
        const color = s.pestCount > 10 ? 'rgba(215, 68, 62, 0.8)' : 'rgba(217, 119, 6, 0.7)';
        marker.style.boxShadow = `0 0 ${radius}px ${radius/2}px ${color}`;
        marker.style.border = '2px solid white';
      } else if (s.status === 'clean') {
        marker.style.boxShadow = '0 0 16px 8px rgba(21, 149, 106, 0.45)';
      } else if (s.status === 'damaged' || s.status === 'missing') {
        marker.style.boxShadow = '0 0 16px 8px rgba(119, 129, 139, 0.45)';
      }
    }
    
    container.appendChild(marker);
  });
}

export function showStationDetail(code) {
  ui.activeStationCode = code;
  const site = state.sites.find(s => s.id === ui.activeSiteId);
  if (!site) return;
  const s = site.stations.find(st => st.code === code);
  if (!s) return;
  
  $$('.station-marker').forEach(m => m.classList.toggle('selected', m.dataset.stationCode === code));
  
  $('#stationDetailsEmpty').classList.add('hidden');
  $('#stationDetailsContent').classList.remove('hidden');
  
  $('#detStationCode').textContent = s.code;
  
  const statusLabels = { clean: 'Temiz', activity: 'Aktivite Var', damaged: 'Hasarlı', missing: 'Eksik', unchecked: 'Kontrol Edilmedi' };
  const badgeClass = s.checked ? (s.status === 'clean' ? 'healthy' : (s.status === 'activity' ? 'critical' : 'warning')) : 'warning';
  
  $('#detStationStatus').className = `status-chip ${badgeClass}`;
  $('#detStationStatus').textContent = s.checked ? statusLabels[s.status] : 'Kontrol Edilmedi';
  
  const typeNames = { rodent: 'Kemirgen Yem İstasyonu', crawler: 'Yürüyen Haşere Monitörü', flying: 'Uçan Haşere Cihazı', insect_light_trap: 'UV Işıklı Cihaz (ILT)' };
  $('#detStationType').textContent = typeNames[s.type] || s.type;
  
  renderPlacementForm(s);
  renderDeviceBlock(site, s);

  // Collapse the swap form whenever a different station is opened.
  $('#deviceReplacementForm')?.classList.add('hidden');

  $('#inpBaitStatus').value = s.baitStatus || 'intact';
  $('#inpPestType').value = s.pestType || 'none';
  $('#inpPestCount').value = s.pestCount || 0;
  $('#inpStatus').value = s.checked ? s.status : 'clean';
  $('#inpNotes').value = s.notes || '';
}

// ===== Device identity & replacement (task 1-2) =====
//
// Roadmap §8: "34 nolu sinek cihazı değişse bile, o noktadaki cihaz yine 34
// numara olduğu için eski cihaza ait veriler ölçüm ve kıyaslama için devam
// etmelidir." The point number is the permanent identity; the barcode belongs
// to the physical device and is reissued on every swap.
//
// Two sources feed the device log: replacements seeded into the 12-month
// history, and any swap the user performs during the demo (stored on the
// station so it survives a reload).
export function pointDevices(site, station) {
  const seeded = deviceReplacements(site.id, station.code);
  const runtime = station.deviceLog || [];

  // Generation 1 is the original install; each replacement adds one.
  const baseGeneration = seeded.reduce((max, s) => Math.max(max, s.generation), 1);
  const generation = baseGeneration + runtime.length;

  const swaps = [
    ...seeded.map(s => ({
      date: s.date,
      reasonCode: s.reasonCode,
      reason: s.reason,
      oldBarcode: s.oldBarcode,
      newBarcode: s.newBarcode,
      generation: s.generation,
      note: s.note,
      source: 'history'
    })),
    ...runtime
  ].sort((a, b) => a.generation - b.generation);

  const current = swaps.length
    ? swaps[swaps.length - 1].newBarcode
    : barcodeFor(site.id, station.code, 1);

  return { generation, current, swaps, installedGeneration: baseGeneration };
}

export function renderDeviceBlock(site, station) {
  const container = $('#detDeviceCurrent');
  if (!container) return;

  const { generation, current, swaps } = pointDevices(site, station);
  const summary = pointDeviceSummary(site.id, station.code);

  const genBadge = $('#detDeviceGeneration');
  if (genBadge) genBadge.textContent = `${generation}. cihaz`;

  container.innerHTML = `
    <div class="device-id-row">
      <span class="device-id-label">Nokta No</span>
      <b class="device-point-no">${esc(station.code)}</b>
      <span class="device-permanent">kalıcı</span>
    </div>
    <div class="device-id-row">
      <span class="device-id-label">Barkod</span>
      <b class="device-barcode">${esc(current)}</b>
    </div>
    <div class="device-id-row">
      <span class="device-id-label">Toplam Okuma</span>
      <b>${esc(summary.totalReadings)} ölçüm · ${esc(summary.totalPests)} adet bulgu</b>
    </div>`;

  // Prefill the swap form with the next barcode in the sequence.
  const barcodeInput = $('#inpNewBarcode');
  if (barcodeInput) barcodeInput.value = barcodeFor(site.id, station.code, generation + 1);
  const hint = $('#deviceSwapHint');
  if (hint) {
    hint.textContent = `Nokta numarası ${station.code} değişmez. ${summary.totalReadings} geçmiş ölçüm bu noktada kalır ve karşılaştırmada kullanılmaya devam eder.`;
  }

  renderDeviceTimeline(site, station, swaps, summary);
  renderPointHistory(site, station);
}

function renderDeviceTimeline(site, station, swaps, summary) {
  const el = $('#detDeviceTimeline');
  if (!el) return;

  if (!swaps.length) {
    el.innerHTML = `<p class="device-timeline-empty">Bu noktada henüz cihaz değişimi yapılmadı — ilk cihaz görevde.</p>`;
    return;
  }

  const genRows = summary.generations.map(g =>
    `<li class="device-gen">
       <span class="device-gen-no">${g.generation}</span>
       <span class="device-gen-body">
         <b>${g.barcode}</b>
         <small>${g.firstDate} – ${g.lastDate} · ${g.readings} ölçüm · ${g.totalPests} bulgu</small>
       </span>
     </li>`).join('');

  const swapRows = swaps.map(s =>
    `<li class="device-swap">
       <span class="device-swap-icon">⇄</span>
       <span class="device-gen-body">
         <b>${esc(s.date)} — ${esc(s.reason)} (${esc(s.reasonCode)})</b>
         <small>${esc(s.oldBarcode)} → ${esc(s.newBarcode)}${s.note ? ` · ${esc(s.note)}` : ''}</small>
       </span>
     </li>`).join('');

  el.innerHTML = `
    <p class="overline device-section-title">CİHAZ GEÇMİŞİ</p>
    <ul class="device-gen-list">${genRows}</ul>
    <ul class="device-swap-list">${swapRows}</ul>`;
}

// The point's reading timeline, tagged by the device that was in place. A
// divider marks each swap, making it obvious that the readings either side
// belong to the same point.
function renderPointHistory(site, station) {
  const el = $('#detPointHistory');
  if (!el) return;

  const readings = readingsForPoint(site.id, station.code);
  if (!readings.length) {
    el.innerHTML = `<p class="device-timeline-empty">Bu nokta için geçmiş ölçüm kaydı bulunmuyor.</p>`;
    return;
  }

  // Show the most recent readings, but always carry a few from each earlier
  // device too. A plain "last 10" hides the swap boundary once enough visits
  // have happened on the new device — which is precisely the thing this panel
  // exists to demonstrate.
  const newest = readings[readings.length - 1].generation;
  const perGeneration = new Map();
  for (let i = readings.length - 1; i >= 0; i--) {
    const r = readings[i];
    const bucket = perGeneration.get(r.generation) || [];
    const limit = r.generation === newest ? 8 : 3;
    if (bucket.length < limit) {
      bucket.push(r);
      perGeneration.set(r.generation, bucket);
    }
  }

  const shown = [...perGeneration.keys()]
    .sort((a, b) => b - a)
    .flatMap(g => perGeneration.get(g));

  let lastGen = null;
  const rows = shown.map(r => {
    let divider = '';
    if (lastGen !== null && r.generation !== lastGen) {
      divider = `<li class="point-history-divider">⇄ cihaz değişimi — nokta ${station.code} aynı kaldı, ölçümler devam ediyor</li>`;
    }
    lastGen = r.generation;
    const cls = r.pestCount > 0 ? 'activity' : 'clean';
    return `${divider}
      <li class="point-history-row">
        <span class="ph-date">${r.date}</span>
        <span class="ph-gen" title="${r.barcode}">${r.generation}. cihaz</span>
        <span class="ph-count ${cls}">${r.pestCount > 0 ? `${r.pestCount} adet ${r.pestName}` : 'Aktivite yok'}</span>
      </li>`;
  }).join('');

  el.innerHTML = `
    <p class="overline device-section-title">NOKTA ÖLÇÜM GEÇMİŞİ <span class="ph-total">${esc(shown.length)} / ${esc(readings.length)} kayıt</span></p>
    <ul class="point-history-list">${rows}</ul>`;
}

// Builds the placement ("yerleşim listesi") sheet for a station from its
// equipment type's schema, so a fly unit asks for tube length and UV type while
// a moth trap asks for trap type and pheromone period. Values already recorded
// on the station are pre-filled.
export function renderPlacementForm(station) {
  const container = $('#stationPlacementFields');
  if (!container) return;

  const schema = getPlacementSchema(station.type);
  const saved = station.placement || {};

  const schemaBadge = $('#detPlacementSchemaName');
  if (schemaBadge) schemaBadge.textContent = schema.title;

  container.innerHTML = schema.fields.map(f => {
    // Point number defaults to the code's numeric suffix — the roadmap keeps
    // that number stable even when the physical device is replaced.
    let value = saved[f.key] ?? '';
    if (!value && f.key === 'pointNo') value = (station.code.match(/\d+/) || [''])[0];
    if (!value && f.key === 'areaName') value = stationAreaName(site, station);

    const label = `<span class="placement-label">${f.label}<small>${f.en}</small></span>`;

    if (f.type === 'select') {
      const opts = ['<option value="">— Seçiniz —</option>']
        .concat(f.options.map(o => `<option value="${o}"${o === value ? ' selected' : ''}>${o}</option>`))
        .join('');
      return `<label class="placement-field">${label}<select name="${f.key}" class="form-select">${opts}</select></label>`;
    }

    const type = f.type === 'date' ? 'date' : 'text';
    const ph = f.placeholder ? ` placeholder="${f.placeholder}"` : '';
    return `<label class="placement-field">${label}<input type="${type}" name="${f.key}" value="${value}" class="form-input"${ph}></label>`;
  }).join('');
}

// Mobile App Workflow

export function renderChemicalUsage(site) {
  const tbody = $('#compChemicalsTableBody');
  if (!tbody) return;
  if (!site.chemicalsUsed) site.chemicalsUsed = [];
  
  const countLabel = $('#compChemicalsCount');
  if (countLabel) countLabel.textContent = site.chemicalsUsed.length;
  
  tbody.innerHTML = site.chemicalsUsed.map((cu, index) => {
    const chem = chemicalDatabase.find(c => c.id === cu.chemicalId);
    const chemName = chem ? chem.name : 'Bilinmeyen Kimyasal';
    const chemIngredient = chem ? chem.activeIngredient : '—';
    const chemCategory = chem ? chem.category : '—';
    const chemDosage = chem ? chem.dosagePerM2 : '—';
    
    return `
      <tr>
        <td><b>${chemName}</b><br><small class="text-muted">${chemIngredient}</small></td>
        <td><span class="status-chip secondary" style="font-size:9px; font-weight:700;">${chemCategory}</span></td>
        <td>${cu.quantity}</td>
        <td>${cu.area}</td>
        <td><small class="text-muted">${chemDosage}</small></td>
        <td>${cu.tech}</td>
        <td><small>${cu.date}</small></td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="7" class="empty" style="text-align:center;">Henüz kimyasal kullanım kaydı bulunmuyor.</td></tr>';
}

// Document library for every product in the catalog. Products actually used at
// this facility are flagged, so an auditor can see the paperwork behind each
// application record in the table above.
export function renderChemicalDocLibrary(site) {
  const grid = $('#compChemDocsGrid');
  if (!grid) return;

  const usedIds = new Set((site.chemicalsUsed || []).map(cu => cu.chemicalId));

  grid.innerHTML = chemicalDatabase.map(chem => {
    const docs = getChemicalDocuments(chem.id);
    const used = usedIds.has(chem.id);
    return `
      <div class="chem-doc-card">
        <h4>${chem.name} ${used ? '<span class="status-chip healthy" style="font-size:8px; font-weight:700;">BU TESİSTE KULLANILDI</span>' : ''}</h4>
        <p class="chem-doc-sub">${chem.activeIngredient} · ${chem.concentration} · ${chem.category}</p>
        ${docs.length ? docs.map(d => `
          <div class="chem-doc-row">
            <span>${d.icon}</span>
            <span>
              <b>${d.label}</b>
              <span class="chem-doc-meta">${d.ref} · ${d.size} · ${d.date}</span>
            </span>
            <button type="button" class="text-btn chem-doc-btn" data-chem-doc="${chem.id}:${d.kind}">Görüntüle ↗</button>
          </div>`).join('')
        : '<div class="chem-doc-row"><span class="chem-doc-missing">⚠ Belge eksik — kullanım raporu üretilemez.</span></div>'}
      </div>`;
  }).join('');

  const count = $('#compChemDocsCount');
  if (count) count.textContent = `${chemicalDatabase.length} ürün · ${chemicalDatabase.length * 3} belge`;
}

export function renderServiceScope(site) {
  const container = $('#compServiceScopeContainer');
  if (!container) return;
  if (!site.serviceScope) {
    container.innerHTML = '<p class="text-muted" style="font-size:12px;">Bu tesis için hizmet kapsamı henüz tanımlanmadı.</p>';
    return;
  }
  const scope = site.serviceScope;
  const rows = [
    ['Dış Alan Kemirgen Kontrolü', scope.outdoorRodent],
    ['İç Alan Kemirgen Kontrolü', scope.indoorRodent],
    ['Yürüyen Haşere Kontrolü', scope.crawlingPest],
    ['Uçan Haşere Kontrolü', scope.flyingPest],
    ['Depo Zararlıları Kontrolü', scope.storagePest]
  ];
  container.innerHTML = `
    <div class="table-panel" style="border:1px solid var(--line); border-radius:8px; overflow:auto;">
      <table>
        <thead><tr><th>Hizmet Türü</th><th>Sıklık</th><th>Not</th></tr></thead>
        <tbody>
          ${rows.map(([label, data]) => {
            if (!data) return '';
            return `<tr><td><b>${label}</b></td><td>Ayda ${data.frequency} ziyaret</td><td><small class="text-muted">${data.seasonNote || '—'}</small></td></tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
  
  // Render contract pricing if available
  const pricing = $('#compPricingContainer');
  if (pricing && site.contract) {
    const c = site.contract;
    pricing.innerHTML = `
      <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:10px; margin-top:12px;">
        <div class="metric-card" style="padding:10px; min-height:auto; display:flex; align-items:center; justify-content:center; box-shadow:none; border:1px solid var(--line); background:var(--soft);">
          <div style="text-align:center;"><span>Yıllık Bedel</span><strong style="font-size:15px; color:var(--green); margin:0;">₺${c.annualPrice?.toLocaleString('tr-TR') || '—'}</strong></div>
        </div>
        <div class="metric-card" style="padding:10px; min-height:auto; display:flex; align-items:center; justify-content:center; box-shadow:none; border:1px solid var(--line); background:var(--soft);">
          <div style="text-align:center;"><span>Aylık Bedel</span><strong style="font-size:15px; margin:0;">₺${c.monthlyPrice?.toLocaleString('tr-TR') || '—'}</strong></div>
        </div>
        <div class="metric-card" style="padding:10px; min-height:auto; display:flex; align-items:center; justify-content:center; box-shadow:none; border:1px solid var(--line); background:var(--soft);">
          <div style="text-align:center;"><span>Ek Servis</span><strong style="font-size:15px; margin:0;">₺${c.extraVisitPrice?.toLocaleString('tr-TR') || '—'}</strong></div>
        </div>
        <div class="metric-card" style="padding:10px; min-height:auto; display:flex; align-items:center; justify-content:center; box-shadow:none; border:1px solid var(--line); background:var(--soft);">
          <div style="text-align:center;"><span>Acil Çağrı</span><strong style="font-size:15px; color:var(--red); margin:0;">₺${c.emergencyCallPrice?.toLocaleString('tr-TR') || '—'}</strong></div>
        </div>
      </div>
      <div style="margin-top:10px; display:flex; gap:16px; font-size:11px; color:var(--muted); justify-content:center;">
        <span><b>Vergi Dairesi:</b> ${esc(c.taxOffice || '—')}</span>
        <span><b>Vergi No:</b> ${esc(c.taxNo || '—')}</span>
      </div>
    `;
  }
}


export function siteCardClicks(e) {
    const siteClick = e.target.closest('[data-site-id]');
    if (siteClick) {
      showCompanyDetail(siteClick.dataset.siteId);
      return true;
    }
    
    // Clicking works on dashboard redirects to work orders view
  return false;
}

export function backNavClicks(e) {
    if (e.target.id === 'backToSitesFromCompBtn') {
      setView('sites');
    }

    // Toggle calendar and list views
  return false;
}

export function planToolbarClicks(e) {
    const heatToggle = e.target.closest('#heatmapToggleBtn');
    if (heatToggle) {
      const site = state.sites.find(s => s.id === ui.activeSiteId);
      if (site) {
        renderStationMarkers(site.stations, $$('[data-station-filter].active')[0]?.dataset.stationFilter || 'all');
      }
    }

    // Print QR code sticker label
    if (e.target.id === 'printStationQrBtn') {
      printQrCodeSticker(ui.activeStationCode);
      return true;
    }

    // The old one-click "mark resolved" toggle is gone: closing a finding now
    // requires the full loop (customer action, then technician approval),
    // which `lifecycleClicks` and the two loop submit handlers drive.
  return false;
}

// Real uploads are downscaled before they are stored — a phone photo would
// otherwise put several megabytes of base64 into demo state.
function readImageDownscaled(file, maxPx = 480) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function showPhotoPreview(photo) {
  const preview = $('#recPhotoPreview');
  if (!preview) return;
  preview.classList.remove('hidden');
  preview.innerHTML = `<img src="${recPhotoSrc(photo)}" alt="önizleme"><span>Yüklenecek görsel</span>`;
}

// The app's delegator listens for click and submit only, so the photo input
// wires its own change listener — same module-scope pattern mobile.js uses.
document.addEventListener('change', async (e) => {
  if (e.target.id !== 'inpRecPhoto') return;
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const dataUrl = await readImageDownscaled(file);
    pendingCustomerPhoto = { kind: 'upload', label: 'Aksiyon sonrası', dataUrl };
    showPhotoPreview(pendingCustomerPhoto);
    toast('Fotoğraf yüklendi, göndermek için formu tamamlayın.');
  } catch (err) {
    console.warn('photo read failed', err);
    toast('Fotoğraf okunamadı. Simüle seçeneğini kullanabilirsiniz.');
  }
});

// Clicks for the closed-loop lifecycle features (tasks 1-2 and 1-6).
export function lifecycleClicks(e) {
    if (e.target.id === 'btnToggleDeviceSwap') {
      $('#deviceReplacementForm')?.classList.toggle('hidden');
      return true;
    }
    if (e.target.id === 'btnCancelDeviceSwap') {
      $('#deviceReplacementForm')?.classList.add('hidden');
      return true;
    }

    // Not every demo machine has a photo to hand — offer a simulated capture.
    if (e.target.id === 'btnSimulateRecPhoto') {
      pendingCustomerPhoto = {
        kind: 'simulated',
        label: 'Aksiyon sonrası',
        ref: `${activeRecId || 'rec'}-after-${Date.now() % 1000}`
      };
      showPhotoPreview(pendingCustomerPhoto);
      toast('Saha fotoğrafı simüle edildi.');
      return true;
    }

    // Selecting a finding opens the closed-loop detail panel. Scoped to the
    // table row and its button on purpose: the detail panel's forms also carry
    // data-rec-id, and a looser match would swallow their submit clicks and
    // rebuild the form out from under them.
    const recTarget = e.target.closest('tr[data-rec-id], .rec-open-btn');
    if (recTarget) {
      const site = state.sites.find(s => s.id === ui.activeSiteId);
      if (!site) return true;
      activeRecId = recTarget.dataset.recId;
      pendingCustomerPhoto = null;
      renderCompanyRecommendations(site);
      renderRecLoopDetail(site, activeRecId);
      $('#recLoopDetail')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return true;
    }
  return false;
}

// Step 2 of the loop: the customer reports the action they took, with a photo
// of the same area.
export function recCustomerResponseSubmit(e) {
    if (e.target.id === 'recCustomerForm') {
      e.preventDefault();
      const site = state.sites.find(s => s.id === ui.activeSiteId);
      if (!site) return true;

      const recId = e.target.dataset.recId;
      const note = (new FormData(e.target).get('customerNote') || '').trim();
      if (!note) {
        toast('Alınan aksiyonu kısaca açıklayın.');
        return true;
      }
      if (!pendingCustomerPhoto) {
        toast('Aksiyon fotoğrafı yüklenmeli — dosya seçin veya simüle edin.');
        return true;
      }

      const overlay = lifecycleOverlay();
      overlay[recId] = {
        ...(overlay[recId] || {}),
        stage: 'customer_actioned',
        status: 'open',
        photoAfter: pendingCustomerPhoto,
        customerNote: note,
        customerRespondedDate: new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }),
        // A fresh response clears any previous rejection.
        rejectionNote: null
      };
      pendingCustomerPhoto = null;
      save();

      renderCompanyRecommendations(site);
      renderRecLoopDetail(site, recId);
      toast('Aksiyonunuz iletildi. Teknisyen onayı bekleniyor.');
      return true;
    }
  return false;
}

// Step 3: the technician who serves the point decides whether the completed
// action is adequate. Approval is the only thing that closes the loop.
export function recApprovalSubmit(e) {
    if (e.target.id === 'recApprovalForm') {
      e.preventDefault();
      const site = state.sites.find(s => s.id === ui.activeSiteId);
      if (!site) return true;

      const recId = e.target.dataset.recId;
      const note = (new FormData(e.target).get('decisionNote') || '').trim();
      // Which button submitted the form.
      const decision = (e.submitter && e.submitter.value) || 'approve';
      const who = state.currentUser ? state.currentUser.name : 'Teknisyen';
      const today = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });

      const overlay = lifecycleOverlay();

      if (decision === 'reject') {
        if (!note) {
          toast('Reddetme gerekçesi yazılmalıdır.');
          return true;
        }
        overlay[recId] = {
          ...(overlay[recId] || {}),
          stage: 'rejected',
          status: 'open',
          rejectionNote: note,
          approvedBy: null,
          approvedDate: null
        };
        toast('Aksiyon reddedildi. Müşteriden tekrar aksiyon istendi.');
      } else {
        overlay[recId] = {
          ...(overlay[recId] || {}),
          stage: 'approved',
          status: 'resolved',
          approvedBy: who,
          approvedDate: today,
          rejectionNote: null
        };
        toast('Aksiyon onaylandı — bulgu kapatıldı.');
      }

      save();
      renderCompanyRecommendations(site);
      renderRecLoopDetail(site, recId);
      return true;
    }
  return false;
}

export function planCanvasClicks(e) {
    const marker = e.target.closest('[data-station-code]');
    if (marker) {
      showStationDetail(marker.dataset.stationCode);
    }
    
    // Station filters click in facility plan
    const sf = e.target.closest('[data-station-filter]');
    if (sf) {
      $$('[data-station-filter]').forEach(x => x.classList.toggle('active', x === sf));
      const site = state.sites.find(s => s.id === ui.activeSiteId);
      if (site) {
        // Clear active room rect highlights when clicking manual filters
        $$('.blueprint-room').forEach(r => r.classList.remove('active'));
        renderStationMarkers(site.stations, sf.dataset.stationFilter);
      }
    }

    // Blueprint room SVG click filter
    const roomClick = e.target.closest('.blueprint-room');
    if (roomClick) {
      const roomName = roomClick.dataset.room;
      const alreadyActive = roomClick.classList.contains('active');
      
      // Clear active classes from other rooms and manual filters
      $$('.blueprint-room').forEach(r => r.classList.remove('active'));
      $$('[data-station-filter]').forEach(x => x.classList.toggle('active', x.dataset.stationFilter === 'all'));
      
      const site = state.sites.find(s => s.id === ui.activeSiteId);
      if (!site) return true;
      
      if (alreadyActive) {
        renderStationMarkers(site.stations, 'all');
        toast("Tüm istasyonlar listeleniyor.");
      } else {
        roomClick.classList.add('active');
        const filtered = site.stations.filter(s => getStationArea(s.x, s.y) === roomName);
        renderStationMarkers(filtered, 'all');
        toast(`"${roomName}" bölgesindeki istasyonlar filtrelendi (${filtered.length} adet).`);
      }
      return true;
    }
    
    // ==========================================
    // MOBILE APP CLICK EVENTS
    // ==========================================
  return false;
}

export function companyTabClicks(e) {
    const compTab = e.target.closest('[data-comp-tab]');
    if (compTab) {
      switchCompanyTab(compTab.dataset.compTab);
      return true;
    }

    // Download Client Analytics Chart
  return false;
}

export function fileDownloadClicks(e) {
    const downloadBtn = e.target.closest('.download-file-btn');
    if (downloadBtn) {
      const idx = parseInt(downloadBtn.dataset.fileIndex);
      const site = state.sites.find(s => s.id === ui.activeSiteId);
      if (site && site.files && site.files[idx]) {
        toast(`${site.files[idx].name} indirmesi başlatıldı...`);
      }
      return true;
    }
  return false;
}

export function editSiteSubmit(e) {
    if(e.target.id==='editSiteForm'){
      e.preventDefault();
      const siteId = e.target.dataset.siteId;
      const s = state.sites.find(site => site.id === siteId);
      if(!s) return true;
      
      const f = new FormData(e.target);
      s.contact = {
        name: f.get('contactName'),
        phone: f.get('contactPhone'),
        email: f.get('contactEmail')
      };
      s.address = f.get('address');
      s.serviceFrequency = f.get('serviceFrequency');
      
      const annualPrice = parseFloat(f.get('annualPrice')) || 0;
      const monthlyPrice = parseFloat(f.get('monthlyPrice')) || 0;
      const extraVisitPrice = parseFloat(f.get('extraVisitPrice')) || 0;
      const emergencyCallPrice = parseFloat(f.get('emergencyCallPrice')) || 0;
      
      s.contract = {
        period: f.get('contractPeriod'),
        taxOffice: f.get('taxOffice'),
        taxNo: f.get('taxNo'),
        annualPrice: annualPrice,
        monthlyPrice: monthlyPrice,
        extraVisitPrice: extraVisitPrice,
        emergencyCallPrice: emergencyCallPrice
      };
      
      s.serviceScope = {
        outdoorRodent: { frequency: parseFloat(f.get('freqOutdoorRodent')) || 0, unit: 'ay' },
        indoorRodent: { frequency: parseFloat(f.get('freqIndoorRodent')) || 0, unit: 'ay' },
        crawlingPest: { frequency: parseFloat(f.get('freqCrawlingPest')) || 0, unit: 'ay' },
        flyingPest: { frequency: parseFloat(f.get('freqFlyingPest')) || 0, unit: 'ay' },
        storagePest: { frequency: parseFloat(f.get('freqStoragePest')) || 0, unit: 'ay' }
      };
      
      save();
      $('#modal').classList.add('hidden');
      
      showCompanyDetail(s.id);
      renderSites();
      toast('Tesis ve sözleşme detayları başarıyla güncellendi.');
    }
  return false;
}

// Records a device swap: the point keeps its code and its whole reading
// history; only the barcode and generation move on.
export function deviceReplacementSubmit(e) {
    if (e.target.id === 'deviceReplacementForm') {
      e.preventDefault();
      if (!ui.activeSiteId || !ui.activeStationCode) return true;

      const site = state.sites.find(s => s.id === ui.activeSiteId);
      if (!site) return true;
      const s = site.stations.find(st => st.code === ui.activeStationCode);
      if (!s) return true;

      const f = new FormData(e.target);
      const reasonCode = f.get('reasonCode');
      const newBarcode = (f.get('newBarcode') || '').trim();
      const note = (f.get('note') || '').trim();
      if (!newBarcode) {
        toast('Yeni barkod girilmelidir.');
        return true;
      }

      const before = pointDevices(site, s);
      const readingsKept = readingsForPoint(site.id, s.code).length;

      if (!s.deviceLog) s.deviceLog = [];
      s.deviceLog.push({
        date: new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }),
        reasonCode,
        reason: (replacementReasons[reasonCode] || {}).name || reasonCode,
        oldBarcode: before.current,
        newBarcode,
        generation: before.generation + 1,
        note,
        recordedBy: state.currentUser ? state.currentUser.name : 'Operatör',
        source: 'runtime'
      });

      // A replaced device is back in service: clear the lost/broken status so
      // the point does not keep reporting a fault it no longer has.
      if (s.status === 'damaged' || s.status === 'missing') {
        s.status = 'clean';
        s.checked = true;
      }

      recalculateSiteStats(site);
      save();

      renderDeviceBlock(site, s);
      renderCompanyStationsTable(site);
      renderStationMarkers(site.stations, $$('[data-station-filter].active')[0]?.dataset.stationFilter || 'all');
      e.target.classList.add('hidden');

      toast(`${s.code} noktasına yeni cihaz tanımlandı (${newBarcode}). ${readingsKept} geçmiş ölçüm korundu.`);
      return true;
    }
  return false;
}

export function placementSubmit(e) {
    if (e.target.id === 'stationPlacementForm') {
      e.preventDefault();
      if (!ui.activeSiteId || !ui.activeStationCode) return true;

      const site = state.sites.find(s => s.id === ui.activeSiteId);
      if (!site) return true;
      const s = site.stations.find(st => st.code === ui.activeStationCode);
      if (!s) return true;

      const schema = getPlacementSchema(s.type);
      const f = new FormData(e.target);

      s.placement = {};
      schema.fields.forEach(field => {
        s.placement[field.key] = (f.get(field.key) || '').trim();
      });
      s.placement.recordedBy = state.currentUser ? state.currentUser.name : 'Operatör';
      s.placement.recordedAt = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });

      save();
      renderCompanyStationsTable(site);
      toast(`${s.code} yerleşim kaydı güncellendi (${schema.title}).`);
      return true;
    }
  return false;
}

export function adminInspectionSubmit(e) {
    if (e.target.id === 'adminInspectionForm') {
      e.preventDefault();
      if (!ui.activeSiteId || !ui.activeStationCode) return true;
      
      const site = state.sites.find(s => s.id === ui.activeSiteId);
      if (!site) return true;
      const s = site.stations.find(st => st.code === ui.activeStationCode);
      if (!s) return true;
      
      const f = new FormData(e.target);
      s.checked = true;
      s.baitStatus = f.get('baitStatus');
      s.pestType = f.get('pestType');
      s.pestCount = parseInt(f.get('pestCount')) || 0;
      s.status = f.get('status');
      s.notes = f.get('notes');
      
      const localPestLabels = { none: 'Yok', mouse: 'Fare', rat: 'Sıçan', cockroach: 'Hamamböceği', fly: 'Sinek', other: 'Diğer' };
      Object.values(pestDatabase).forEach(category => {
        category.forEach(p => {
          localPestLabels[p.code] = p.name;
        });
      });
      
      if (s.pestType !== 'none' && s.pestCount > 0) {
        const pestName = localPestLabels[s.pestType] || s.pestType;
        s.findings = [{
          pestCode: s.pestType,
          pestName: pestName,
          count: s.pestCount
        }];
      } else {
        s.findings = [];
      }
      
      s.controlledBy = "Seda Kaya (Yönetici)";
      s.lastControl = "Bugün, " + new Date().toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'});
      
      if (s.pestType !== 'none') {
        s.status = 'activity';
      } else if (s.status === 'activity') {
        s.status = 'clean';
      }
      
      recalculateSiteStats(site);
      save();
      showCompanyDetail(ui.activeSiteId);
      toast(`İstasyon ${s.code} denetimi başarıyla kaydedildi.`);
    }

    // Company profile file upload form submit
  return false;
}

export function fileUploadSubmit(e) {
    if (e.target.id === 'companyFileUploadForm') {
      e.preventDefault();
      if (!ui.activeSiteId) return true;
      const site = state.sites.find(s => s.id === ui.activeSiteId);
      if (!site) return true;
      
      const inpName = $('#inpUploadFileName');
      const inpFile = $('#inpUploadFile');
      const inpCat = $('#inpUploadFileCategory');
      if (!inpName || !inpFile) return true;
      
      const fileName = inpName.value.trim();
      if (!fileName) return true;
      
      const ext = inpFile.files[0] ? inpFile.files[0].name.split('.').pop() : 'pdf';
      const rawSize = inpFile.files[0] ? inpFile.files[0].size : 1250000;
      const sizeStr = rawSize > 1024*1024 ? `${(rawSize/(1024*1024)).toFixed(1)} MB` : `${Math.round(rawSize/1024)} KB`;
      const dateStr = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
      const category = inpCat ? inpCat.value : 'SDS';
      
      if (!site.files) site.files = [];
      site.files.unshift({
        name: `${fileName}.${ext}`,
        type: ext,
        size: sizeStr,
        date: dateStr,
        category: category
      });
      
      save();
      renderCompanyFiles(site);
      
      inpName.value = '';
      inpFile.value = '';
      toast('Belge başarıyla yüklendi ve site profiline eklendi.');
    }

    // Company profile recommendation form submit
  return false;
}

export function recommendationSubmit(e) {
    if (e.target.id === 'companyRecommendationForm') {
      e.preventDefault();
      if (!ui.activeSiteId) return true;
      const site = state.sites.find(s => s.id === ui.activeSiteId);
      if (!site) return true;
      
      const inpDesc = $('#inpRecDesc');
      const inpCat = $('#inpRecCategory');
      const inpAss = $('#inpRecAssignee');
      const inpDue = $('#inpRecDueDate');
      if (!inpDesc || !inpCat || !inpAss || !inpDue) return true;
      
      const desc = inpDesc.value.trim();
      const category = inpCat.value;
      const assignee = inpAss.value.trim();
      const dueDateVal = inpDue.value;
      
      if (!desc || !assignee || !dueDateVal) return true;
      
      const dMatch = dueDateVal.split('-');
      const formattedDue = dMatch.length === 3 ? `${dMatch[2]} Tem 2026` : '20 Tem 2026';
      
      const newRec = {
        id: `r${Date.now()}`,
        desc: desc,
        category: category,
        assignee: assignee,
        date: "Bugün",
        due: formattedDue,
        status: 'open'
      };
      
      if (!site.recommendations) site.recommendations = [];
      site.recommendations.unshift(newRec);
      save();
      renderCompanyRecommendations(site);
      
      inpDesc.value = '';
      inpAss.value = '';
      inpDue.value = '';
      toast('Standart Önleme Önerisi başarıyla kaydedildi.');
    }

    // Company profile chemical form submit
  return false;
}

export function chemicalUsageSubmit(e) {
    if (e.target.id === 'companyChemicalForm') {
      e.preventDefault();
      if (!ui.activeSiteId) return true;
      const site = state.sites.find(s => s.id === ui.activeSiteId);
      if (!site) return true;
      
      const inpChemSelect = $('#inpChemicalSelect');
      const inpChemQty = $('#inpChemicalQty');
      const inpChemArea = $('#inpChemicalArea');
      const inpChemNotes = $('#inpChemicalNotes');
      if (!inpChemSelect || !inpChemQty || !inpChemArea || !inpChemNotes) return true;
      
      const chemicalId = inpChemSelect.value;
      const quantity = inpChemQty.value.trim();
      const area = inpChemArea.value.trim();
      const notes = inpChemNotes.value.trim();
      
      if (!chemicalId || !quantity || !area) return true;
      
      const dateStr = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
      const newChemUse = {
        id: `cu${Date.now()}`,
        chemicalId: chemicalId,
        date: dateStr,
        quantity: quantity,
        area: area,
        tech: state.currentUser ? state.currentUser.name : "Operatör",
        notes: notes
      };
      
      if (!site.chemicalsUsed) site.chemicalsUsed = [];
      site.chemicalsUsed.unshift(newChemUse);
      
      // Auto-deduct stock from inventory
      deductStock(chemicalId, quantity);
      
      save();
      renderChemicalUsage(site);
      
      inpChemSelect.value = '';
      inpChemQty.value = '';
      inpChemArea.value = '';
      inpChemNotes.value = '';
    }

    // Stock Refill Form submit
  return false;
}
