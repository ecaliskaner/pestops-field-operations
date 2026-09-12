// Facility detail page: profile, tabs, floor plan, stations.
// Extracted from app.js (Phase 0a-3).

import { $, $$, esc } from '../core/dom.js';
import { recalculateSiteStats, replaceSites, state } from '../core/state.js';
import { ui } from '../core/session.js';
import { equipmentStatusCodes, equipmentTypes, getPlacementSchema, getStationArea, pestDatabase, placementSummary, stationAreaName, stateLabel } from '../data/catalog.js';
import { setView } from '../core/router.js';
import { renderClientAnalytics } from '../views/insights.js';
import { toast } from '../core/dom.js';
import { save } from '../core/state.js';
import { modal, printQrCodeSticker } from '../ui/modal.js';
import { renderSites } from '../views/sites.js';
import { technicianStats } from '../data/history.js';
import { fetchUsageForSite } from '../data/repo/inventory.js';
import { parseContractPeriod, updateSite, fetchSites } from '../data/repo/sites.js';
import { recordInspection } from '../data/repo/work.js';
import { fetchPointHistory, fetchPointSummary, replaceStationDevice } from '../data/repo/stations.js';
import { fetchTechnicianCredentials } from '../data/repo/technicians.js';
import { saveContract } from '../data/repo/customer.js';
import {
  fetchRecommendations, respondToRecommendation, approveRecommendation,
  rejectRecommendation, uploadRecommendationPhoto, signedPhotoUrl
} from '../data/repo/customer.js';
import { renderFloorPlan } from './floorPlan.js';
import { visitsPerMonth } from '../data/schedule.js';
import { demoToday } from '../data/history.js';
import { techData } from '../data/seed.js';

// Shared by the chemical-usage table and the licensed-product library below.
const DAY_FMT = { day: '2-digit', month: 'short', year: 'numeric' };

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
  renderInspectionWorkOrders(site);
  
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
// appears. The documents themselves are technician_credentials rows.
export function renderCompanyCredentials(site) {
  const host = $('#compCredentialsList');
  if (!host) return;

  // The four document rows used to come from data/credentials.js: a map of four
  // demo technician names to invented certificate numbers and expiry dates,
  // with `getCredential()` falling back to "Ayşe Demir" for anyone unknown — so
  // a real technician was shown another person's paperwork. The rows are
  // technician_credentials now, and a technician with nothing on file says so.
  // Technicians who have actually attended this facility, from the visit
  // history. Falling back to the whole team when none have yet is deliberate:
  // a customer opening a new facility should still be able to check the
  // credentials of whoever is about to be sent.
  const served = new Set(technicianStats(site.id).map((t) => t.tech));
  const all = state.technicians || [];
  const technicians = served.size ? all.filter((t) => served.has(t.name)) : all;

  host.innerHTML = '<p class="text-muted" style="font-size:12px;">Yükleniyor…</p>';

  fetchTechnicianCredentials()
    .then((byTech) => {
      const cards = technicians.map((t) => {
        const docs = byTech[t.id] || [];
        const initials = t.initials || (t.name || '??').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
        const rows = docs.length
          ? docs.map((d) => {
              const expired = d.validUntil && new Date(d.validUntil) < new Date();
              const ok = d.isValid && !expired;
              const meta = [
                d.referenceNo,
                d.validUntil ? `Geçerlilik: ${new Date(d.validUntil).toLocaleDateString('tr-TR', DAY_FMT)}` : ''
              ].filter(Boolean).join(' · ');
              return `
                <div class="cred-doc">
                  <span class="cred-doc-icon">📄</span>
                  <div class="cred-doc-body"><b>${esc(d.title)}</b><small>${esc(meta) || '—'}</small></div>
                  <span class="cred-doc-status ${ok ? 'ok' : 'warn'}">${ok ? 'Geçerli' : (expired ? 'Süresi doldu' : 'Geçersiz')}</span>
                </div>`;
            }).join('')
          : '<div class="cred-doc"><span class="cred-doc-icon">⚠</span><div class="cred-doc-body"><b>Belge kaydı yok</b><small>Bu teknisyen için yüklenmiş belge bulunmuyor.</small></div></div>';

        return `
          <div class="cred-card panel" style="box-shadow:none; border:1px solid var(--line);">
            <div class="cred-head">
              <span class="tech-avatar" style="background:${esc(t.color)};">${esc(initials)}</span>
              <div><b>${esc(t.name)}</b><span>${served.has(t.name) ? 'Bu tesiste görev aldı' : 'Ekipte'}</span></div>
            </div>
            <div class="cred-docs">${rows}</div>
          </div>`;
      }).join('') || '<p class="text-muted" style="font-size:12px;">Kayıtlı teknisyen bulunmuyor.</p>';

      host.innerHTML = cards;
      host.insertAdjacentHTML('beforeend',
        '<p class="cred-kvkk">🔒 <b>KVKK:</b> Belgeler yalnızca hizmet süresince ve yalnızca ilgili tesise gösterilir. Kimlik numaraları saklanmaz.</p>');
    })
    .catch((err) => {
      console.error('[repellent] teknisyen belgeleri yuklenemedi', err);
      host.innerHTML = '<p class="text-muted" style="font-size:12px;">Belgeler yüklenemedi.</p>';
    });
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
// Real findings for the org, loaded once and refreshed after every loop step.
//
// This replaced two fabrications at once: recommendationsForSite() invented
// findings from the synthetic history, and every lifecycle change the user
// made was kept in a browser-side `state.recLifecycle` overlay. That overlay
// meant the customer's response and the operator's approval were visible only
// in the browser that performed them — a cleared cache destroyed the audit
// trail of a compliance loop.
let recommendations = [];
let recsLoaded = false;

async function loadRecommendations(force = false) {
  if (recsLoaded && !force) return;
  recsLoaded = true;
  try {
    recommendations = await fetchRecommendations();
  } catch (err) {
    console.error('[repellent] bulgular yuklenemedi', err);
    return;
  }
  const site = state.sites.find((x) => x.id === ui.activeSiteId);
  if (site) {
    renderCompanyRecommendations(site);
    if (activeRecId) renderRecLoopDetail(site, activeRecId);
  }
}

/**
 * Findings for one site, ordered by where they sit in the loop.
 *
 * @param {object} site
 * @returns {object[]}
 */
export function loopRecommendations(site) {
  return recommendations
    .filter((r) => r.siteId === site.id)
    .slice()
    .sort((a, b) => LOOP_STAGES[a.stage].order - LOOP_STAGES[b.stage].order);
}

// Photos are held as descriptors. A simulated one is drawn as an SVG so the
// demo always has evidence to show; a real upload carries its own data URL.
// Evidence photos live in the private recommendation-photos bucket, so an
// <img> cannot address them directly. Each tile renders a placeholder and is
// filled in once its short-lived signed URL comes back.
//
// The previous version drew a deterministic SVG for any photo it did not
// have, which meant a compliance loop could display fabricated evidence.
const signedUrlCache = new Map();

async function fillPhoto(el, path) {
  if (!el || !path) return;
  let url = signedUrlCache.get(path);
  if (!url) {
    url = await signedPhotoUrl(path);
    if (url) signedUrlCache.set(path, url);
  }
  if (!url) {
    el.outerHTML = '<div class="rec-photo-missing">Fotoğraf açılamadı</div>';
    return;
  }
  el.innerHTML = `<img src="${url}" alt="" loading="lazy">`;
  el.classList.remove('rec-photo-pending');
}

// Resolve every pending tile currently on screen.
function hydratePhotos() {
  document.querySelectorAll('[data-photo-path]').forEach((el) => {
    fillPhoto(el, el.dataset.photoPath);
  });
}

function photoTile(path, fallbackLabel) {
  if (!path) return `<div class="rec-photo-missing">${esc(fallbackLabel)}</div>`;
  return `<div class="rec-photo rec-photo-pending" data-photo-path="${esc(path)}">Yükleniyor…</div>`;
}

export function renderCompanyRecommendations(site) {
  const tbody = $('#compRecommendationsTableBody');
  if (!tbody) return;
  if (!site.recommendations) site.recommendations = [];

  loadRecommendations();
  const recs = loopRecommendations(site);
  const role = state.currentUser ? state.currentUser.role : 'admin';

  const countLabel = $('#compRecsCount');
  if (countLabel) countLabel.textContent = recs.filter(r => r.stage !== 'approved').length;

  renderLoopSummary(recs);

  tbody.innerHTML = recs.map(r => {
    const stage = LOOP_STAGES[r.stage] || LOOP_STAGES.raised;
    const selected = r.id === activeRecId ? ' class="rec-row-selected"' : '';
    return `
      <tr data-rec-id="${esc(r.id)}"${selected} style="cursor:pointer;">
        <td><b>${esc(r.desc)}</b>${r.stationCode ? `<br><small class="text-muted">Nokta: ${esc(r.stationCode)}</small>` : ''}</td>
        <td><span class="status-chip secondary" style="font-size:9px; font-weight:700;">${esc(r.category)}</span></td>
        <td>${esc(r.assignee)}</td>
        <td><small class="text-muted">${esc(r.date)}</small></td>
        <td><small>${esc(r.dueDate || '—')}</small></td>
        <td><span class="status-chip ${stage.chip}">${stage.short}</span></td>
        <td><button class="text-btn rec-open-btn" data-rec-id="${esc(r.id)}" style="padding:0; font-size:11px; font-weight:700;">${nextActionLabel(r, role)}</button></td>
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
    { n: 3, title: 'Onaylandı', who: rec.approvedDate ? 'Operasyon' : '', when: rec.approvedDate, done: rec.stage === 'approved' }
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
        ${photoTile(rec.photoBeforePath, 'Tespit fotoğrafı yok')}
      </figure>
      <figure>
        <figcaption>SONRA — aksiyon fotoğrafı</figcaption>
        ${photoTile(rec.photoAfterPath, 'Müşteri henüz yüklemedi')}
      </figure>
    </div>

    ${rec.customerNote ? `<p class="rec-note customer"><b>Müşteri notu:</b> ${esc(rec.customerNote)}</p>` : ''}
    ${rec.rejectionNote ? `<p class="rec-note reject"><b>Onaylanmama nedeni:</b> ${esc(rec.rejectionNote)}</p>` : ''}

    <p class="rec-waiting-on">⏳ ${esc(stage.actor)}</p>

    ${renderRecActions(rec, role)}`;

  hydratePhotos();
}

// Only the role that owns the current step gets controls; everyone else sees
// why they cannot act.
function renderRecActions(rec, role) {
  const isTech = role === 'tech' || role === 'admin';

  if (rec.stage === 'approved') {
    return `<div class="rec-actions closed">✓ Bu bulgu ${esc(rec.approvedDate || '')} tarihinde onaylanarak kapatıldı.</div>`;
  }

  if (role === 'client') {
    if (rec.stage === 'raised' || rec.stage === 'rejected') {
      return `
        <form class="rec-actions rec-customer-form" id="recCustomerForm" data-rec-id="${esc(rec.id)}">
          <p class="rec-actions-title">Aksiyonu bildirin — aynı alanın fotoğrafını yükleyin</p>
          <input type="file" accept="image/*" class="form-input rec-file" id="inpRecPhoto">
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
// The point's device, its replacement history and its readings.
//
// All three were generated. The barcode came out of `barcodeFor()`, a hash of
// the site id and point code; replacements lived partly in the synthetic visit
// store and partly in a `station.deviceLog` array kept on the browser's copy of
// the station. They are now `station_replacements` rows and `inspections` rows,
// joined on the point code — see src/data/repo/stations.js for why the code,
// and not the barcode, is the identity that history hangs off.
export async function renderDeviceBlock(site, station) {
  const container = $('#detDeviceCurrent');
  if (!container) return;

  if (!station.dbId) {
    container.innerHTML = '<p class="device-timeline-empty">Bu nokta henüz kaydedilmedi.</p>';
    return;
  }

  let summary;
  let readings;
  try {
    [summary, readings] = await Promise.all([
      fetchPointSummary(site.id, station.code),
      fetchPointHistory(site.id, station.code)
    ]);
  } catch (err) {
    console.error('[repellent] nokta gecmisi yuklenemedi', err);
    container.innerHTML = '<p class="device-timeline-empty">Nokta geçmişi yüklenemedi.</p>';
    return;
  }

  const swaps = summary.replacements;
  const generation = swaps.length + 1;
  // The barcode on the device right now, straight off the station row. Blank
  // until the org records one — there is no sequence to derive it from.
  const current = station.deviceBarcode || '';

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
      <b class="device-barcode">${current ? esc(current) : '<span style="color:var(--muted);">kayıtlı değil</span>'}</b>
    </div>
    <div class="device-id-row">
      <span class="device-id-label">Toplam Okuma</span>
      <b>${esc(summary.totalReadings)} ölçüm · ${esc(summary.totalPests)} adet bulgu</b>
    </div>`;

  // The next barcode is not prefilled any more: it comes off the physical
  // label on the replacement box, and guessing it is how a made-up barcode got
  // into the record in the first place.
  const barcodeInput = $('#inpNewBarcode');
  if (barcodeInput) barcodeInput.value = '';
  const hint = $('#deviceSwapHint');
  if (hint) {
    hint.textContent = `Nokta numarası ${station.code} değişmez. ${summary.totalReadings} geçmiş ölçüm bu noktada kalır ve karşılaştırmada kullanılmaya devam eder.`;
  }

  renderDeviceTimeline(station, swaps, summary);
  renderPointHistory(station, readings);
}

function renderDeviceTimeline(station, swaps, summary) {
  const el = $('#detDeviceTimeline');
  if (!el) return;

  if (!swaps.length) {
    el.innerHTML = '<p class="device-timeline-empty">Bu noktada henüz cihaz değişimi kaydedilmedi — ilk cihaz görevde.</p>';
    return;
  }

  const genRows = summary.generations.map((g) =>
    `<li class="device-gen">
       <span class="device-gen-no">${esc(g.generation)}</span>
       <span class="device-gen-body">
         <b>${g.barcode ? esc(g.barcode) : '<span style="color:var(--muted);">barkod kayıtlı değil</span>'}</b>
         <small>${esc(g.firstDate)} – ${esc(g.lastDate)} · ${esc(g.readings)} ölçüm · ${esc(g.totalPests)} bulgu</small>
       </span>
     </li>`).join('');

  const swapRows = swaps.map((sw) =>
    `<li class="device-swap">
       <span class="device-swap-icon">⇄</span>
       <span class="device-gen-body">
         <b>${esc(sw.date)} — ${esc(sw.reasonName)}</b>
         <small>${esc(sw.oldBarcode) || '—'} → ${esc(sw.newBarcode)}${sw.notes ? ` · ${esc(sw.notes)}` : ''}</small>
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
function renderPointHistory(station, readings) {
  const el = $('#detPointHistory');
  if (!el) return;

  if (!readings.length) {
    el.innerHTML = '<p class="device-timeline-empty">Bu nokta için geçmiş ölçüm kaydı bulunmuyor.</p>';
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
    .flatMap((g) => perGeneration.get(g));

  let lastGen = null;
  const rows = shown.map((r) => {
    let divider = '';
    if (lastGen !== null && r.generation !== lastGen) {
      divider = `<li class="point-history-divider">⇄ cihaz değişimi — nokta ${esc(station.code)} aynı kaldı, ölçümler devam ediyor</li>`;
    }
    lastGen = r.generation;
    const cls = r.pestCount > 0 ? 'activity' : 'clean';
    return `${divider}
      <li class="point-history-row">
        <span class="ph-date">${esc(r.date)}</span>
        <span class="ph-gen" title="${esc(r.barcode)}">${esc(r.generation)}. cihaz</span>
        <span class="ph-count ${cls}">${r.pestCount > 0 ? `${esc(r.pestCount)} adet ${esc(r.pestName)}` : 'Aktivite yok'}</span>
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

// Chemical applications recorded at this facility.
//
// This used to read `site.chemicalsUsed` and resolve product names against
// data/catalog.js. Neither survives contact with a real account: the array is
// always empty (repo/sites.js), and the catalogue is a static list of brands
// this company may not be licensed to apply. Applications are recorded against
// a work order, so the facility's own record is a query over those rather than
// a second copy that has to be kept in step.
export function renderChemicalUsage(site) {
  const tbody = $('#compChemicalsTableBody');
  if (!tbody) return;

  const paint = (rows) => {
    const countLabel = $('#compChemicalsCount');
    if (countLabel) countLabel.textContent = rows.length;
    tbody.innerHTML = rows.map((cu) => `
      <tr>
        <td><b>${esc(cu.name)}</b><br><small class="text-muted">${esc(cu.activeIngredient) || '—'}</small></td>
        <td><code style="font-size:10px;">${esc(cu.licenseNo) || '—'}</code></td>
        <td>${cu.quantity} ${esc(cu.unit)}</td>
        <td>${esc(cu.area) || '—'}</td>
        <td><small class="text-muted">${esc(cu.workOrderCode) || '—'}</small></td>
        <td>${esc(cu.tech) || '—'}</td>
        <td><small>${cu.at ? new Date(cu.at).toLocaleDateString('tr-TR', DAY_FMT) : '—'}</small></td>
      </tr>
    `).join('') || '<tr><td colspan="7" class="empty" style="text-align:center;">Bu tesiste henüz kimyasal kullanım kaydı bulunmuyor.</td></tr>';
  };

  // A facility created in the browser has no database row yet, so there is
  // nothing to ask for; painting the empty state is the honest answer.
  if (!site.dbId) { paint([]); return; }

  tbody.innerHTML = '<tr><td colspan="7" class="empty" style="text-align:center;">Yükleniyor…</td></tr>';
  fetchUsageForSite(site.dbId)
    .then(paint)
    .catch((err) => {
      console.error('[repellent] kimyasal kullanimlari yuklenemedi', err);
      tbody.innerHTML = '<tr><td colspan="7" class="empty" style="text-align:center;">Kullanım kayıtları yüklenemedi.</td></tr>';
    });
}

// The org's licensed products, and whether this facility has seen them.
//
// What stood here was the heaviest fabrication in the app: a document library
// listing twelve catalogue products, each with an invented "T.C. Sağlık Bak.
// Ruhsat No", an invented file size and an invented date, under a heading
// offering MSDS sheets and ministry permits. A "Görüntüle" button sat beside
// every row with no handler behind it. This is a screen a BRCGS or IFS auditor
// is shown, so inventing its contents is not a cosmetic problem.
//
// It now lists what the org actually registered, with the ruhsat number it
// entered. MSDS upload does not exist yet, and a product without one says so
// rather than displaying a reference that was never filed.
export function renderChemicalDocLibrary(site) {
  const grid = $('#compChemDocsGrid');
  if (!grid) return;

  const chemicals = state.chemicals || [];
  const today = new Date();

  const paint = (usedIds) => {
    grid.innerHTML = chemicals.map((chem) => {
      const used = usedIds.has(chem.id);
      const expired = !!chem.licenseUntil && new Date(chem.licenseUntil) < today;
      const until = chem.licenseUntil
        ? new Date(chem.licenseUntil).toLocaleDateString('tr-TR', DAY_FMT)
        : null;
      return `
      <div class="chem-doc-card">
        <h4>${esc(chem.name)} ${used ? '<span class="status-chip healthy" style="font-size:8px; font-weight:700;">BU TESİSTE KULLANILDI</span>' : ''}</h4>
        <p class="chem-doc-sub">${esc(chem.activeIngredient) || 'Etkin madde girilmemiş'}${chem.unit ? ' · ' + esc(chem.unit) : ''}</p>
        <div class="chem-doc-row">
          <span>📜</span>
          <span>
            <b>Biyosidal Ruhsat</b>
            <span class="chem-doc-meta">${esc(chem.licenseNo) || 'Ruhsat no girilmemiş'}${until ? ' · geçerlilik ' + until : ''}</span>
          </span>
          ${expired ? '<span class="status-chip critical" style="font-size:8px;">SÜRESİ DOLDU</span>' : ''}
        </div>
        <div class="chem-doc-row">
          <span class="chem-doc-missing">⚠ MSDS / güvenlik bilgi formu henüz yüklenmedi.</span>
        </div>
      </div>`;
    }).join('') ||
      '<p class="text-muted" style="font-size:12px;">Henüz ruhsatlı ürün tanımlanmamış. Stok &amp; Envanter sayfasından ekleyin.</p>';

    const count = $('#compChemDocsCount');
    if (count) count.textContent = `${chemicals.length} ürün`;
  };

  if (!site.dbId) { paint(new Set()); return; }
  fetchUsageForSite(site.dbId)
    .then((rows) => paint(new Set(rows.map((r) => r.chemicalId))))
    .catch(() => paint(new Set()));
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
  preview.innerHTML = '';
  const img = document.createElement('img');
  img.alt = 'önizleme';
  img.src = URL.createObjectURL(photo.blob);
  img.addEventListener('load', () => URL.revokeObjectURL(img.src), { once: true });
  const cap = document.createElement('span');
  cap.textContent = 'Yüklenecek görsel';
  preview.append(img, cap);
}

// The app's delegator listens for click and submit only, so the photo input
// wires its own change listener — same module-scope pattern mobile.js uses.
document.addEventListener('change', async (e) => {
  if (e.target.id !== 'inpRecPhoto') return;
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    // Downscaled before upload: a phone camera original is several megabytes
    // and the bucket caps objects at 10 MB.
    const dataUrl = await readImageDownscaled(file);
    const blob = await (await fetch(dataUrl)).blob();
    pendingCustomerPhoto = { blob, ext: (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg') };
    showPhotoPreview(pendingCustomerPhoto);
    toast('Fotoğraf hazır, göndermek için formu tamamlayın.');
  } catch (err) {
    console.error('[repellent] fotograf okunamadi', err);
    toast('Fotoğraf okunamadı. Lütfen başka bir görsel deneyin.');
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
  if (e.target.id !== 'recCustomerForm') return false;
  e.preventDefault();

  const site = state.sites.find((s) => s.id === ui.activeSiteId);
  if (!site) return true;

  const recId = e.target.dataset.recId;
  const note = String(new FormData(e.target).get('customerNote') || '').trim();
  if (!note) {
    toast('Alınan aksiyonu kısaca açıklayın.');
    return true;
  }
  if (!pendingCustomerPhoto || !pendingCustomerPhoto.blob) {
    toast('Aksiyon fotoğrafı yüklenmeli — cihazınızdan bir fotoğraf seçin.');
    return true;
  }

  const orgId = state.currentUser?.orgId;
  if (!orgId) {
    toast('Kuruma bağlı bir hesapla giriş yapmalısınız.');
    return true;
  }

  const button = e.target.querySelector('button[type="submit"]');
  if (button) { button.disabled = true; button.textContent = 'Gönderiliyor…'; }
  const photo = pendingCustomerPhoto;

  uploadRecommendationPhoto({ orgId, siteId: site.id, recId, blob: photo.blob, ext: photo.ext })
    .then((photoPath) => respondToRecommendation({ recId, note, photoPath }))
    .then(() => loadRecommendations(true))
    .then(() => {
      pendingCustomerPhoto = null;
      toast('Aksiyonunuz iletildi. Onay bekleniyor.');
    })
    .catch((err) => {
      toast(err.message || 'Aksiyonunuz gönderilemedi. Lütfen tekrar deneyin.');
    })
    .finally(() => {
      if (button) { button.disabled = false; button.textContent = 'Aksiyonu Gönder →'; }
    });

  return true;
}

// Step 3: the operator decides whether the completed action is adequate.
// Approval is the only thing that closes the loop, and it is deliberately not
// something the customer can do to their own finding.
export function recApprovalSubmit(e) {
  if (e.target.id !== 'recApprovalForm') return false;
  e.preventDefault();

  const site = state.sites.find((s) => s.id === ui.activeSiteId);
  if (!site) return true;

  const recId = e.target.dataset.recId;
  const note = String(new FormData(e.target).get('decisionNote') || '').trim();
  const decision = (e.submitter && e.submitter.value) || 'approve';

  if (decision === 'reject' && !note) {
    toast('Reddetme gerekçesi yazılmalıdır.');
    return true;
  }

  const buttons = [...e.target.querySelectorAll('button[type="submit"]')];
  buttons.forEach((b) => { b.disabled = true; });

  const action = decision === 'reject'
    ? rejectRecommendation({ recId, note })
    : approveRecommendation({ recId, approverId: state.currentUser?.id });

  action
    .then(() => loadRecommendations(true))
    .then(() => {
      toast(decision === 'reject'
        ? 'Aksiyon reddedildi. Müşteriden tekrar aksiyon istendi.'
        : 'Aksiyon onaylandı — bulgu kapatıldı.');
    })
    .catch((err) => {
      toast(err.message || 'İşlem tamamlanamadı.');
    })
    .finally(() => {
      buttons.forEach((b) => { b.disabled = false; });
    });

  return true;
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

// Facility and contract details.
//
// This wrote every field to browser state and called save(), so a corrected
// price or phone number survived only in the browser it was typed in. The
// contract prices matter most: billing.js refuses to invoice a site whose
// contract has no monthly price, and until now that price could only be set
// while creating the site — an existing facility's fee could not be corrected
// from the app at all.
export function editSiteSubmit(e) {
  if (e.target.id !== 'editSiteForm') return false;
  e.preventDefault();

  const siteId = e.target.dataset.siteId;
  const site = state.sites.find((x) => x.id === siteId);
  if (!site) return true;

  const f = new FormData(e.target);
  const orgId = state.currentUser?.orgId;
  if (!orgId) { toast('Kuruma bağlı bir hesapla giriş yapmalısınız.'); return true; }

  const periodText = String(f.get('contractPeriod') || '');
  const period = parseContractPeriod(periodText);
  if (!period) {
    toast('Sözleşme dönemini GG.AA.YYYY - GG.AA.YYYY biçiminde girin.');
    return true;
  }

  const num = (key) => {
    const v = parseFloat(f.get(key));
    return Number.isFinite(v) ? v : null;
  };

  // Built before the write so the same object is stored and installed; two
  // constructions of it would be one edit away from disagreeing.
  const serviceScope = {
    outdoorRodent: { frequency: parseFloat(f.get('freqOutdoorRodent')) || 0, unit: 'ay' },
    indoorRodent: { frequency: parseFloat(f.get('freqIndoorRodent')) || 0, unit: 'ay' },
    crawlingPest: { frequency: parseFloat(f.get('freqCrawlingPest')) || 0, unit: 'ay' },
    flyingPest: { frequency: parseFloat(f.get('freqFlyingPest')) || 0, unit: 'ay' },
    storagePest: { frequency: parseFloat(f.get('freqStoragePest')) || 0, unit: 'ay' }
  };

  const button = e.target.querySelector('button[type="submit"]');
  if (button) button.disabled = true;

  Promise.all([
    updateSite({
      siteId,
      customerId: site.customerId,
      serviceScope,
      address: String(f.get('address') || '').trim(),
      contactName: String(f.get('contactName') || '').trim(),
      contactPhone: String(f.get('contactPhone') || '').trim(),
      contactEmail: String(f.get('contactEmail') || '').trim()
    }),
    saveContract({
      // An existing period is edited; a site with no contract yet opens one.
      id: site.contract?.id,
      orgId,
      siteId,
      periodStart: period[0],
      periodEnd: period[1],
      monthlyPrice: num('monthlyPrice'),
      annualPrice: num('annualPrice'),
      extraVisitPrice: num('extraVisitPrice'),
      emergencyCallPrice: num('emergencyCallPrice'),
      taxOffice: String(f.get('taxOffice') || '').trim(),
      taxNo: String(f.get('taxNo') || '').trim()
    })
  ])
    .then(([, contract]) => {
      // The stored contract is installed on the site so billing.js sees the new
      // price immediately, rather than the figure that was just typed in.
      site.contract = contract;
      site.address = String(f.get('address') || '').trim();
      site.contact = {
        name: String(f.get('contactName') || '').trim(),
        phone: String(f.get('contactPhone') || '').trim(),
        email: String(f.get('contactEmail') || '').trim()
      };
      site.serviceScope = serviceScope;
      // The prose cadence ("15 Günde Bir") is a label with no column; the plan
      // is computed from serviceScope above, so this is display only.
      site.serviceFrequency = f.get('serviceFrequency');
      save();

      $('#modal').classList.add('hidden');
      showCompanyDetail(site.id);
      renderSites();
      toast('Tesis ve sözleşme bilgileri kaydedildi.');
    })
    .catch((err) => toast(err.message || 'Kaydedilemedi.'))
    .finally(() => { if (button) button.disabled = false; });

  return true;
}

// Records a device swap: the point keeps its code and its whole reading
// history; only the barcode and generation move on.
export function deviceReplacementSubmit(e) {
    if (e.target.id === 'deviceReplacementForm') {
      e.preventDefault();
      if (!ui.activeSiteId || !ui.activeStationCode) return true;

      const site = state.sites.find((x) => x.id === ui.activeSiteId);
      if (!site) return true;
      const station = (site.stations || []).find((st) => st.code === ui.activeStationCode);
      if (!station) return true;
      if (!station.dbId) { toast('Bu nokta henüz kaydedilmedi.'); return true; }

      const f = new FormData(e.target);
      const reason = String(f.get('reasonCode') || '');
      const newBarcode = String(f.get('newBarcode') || '').trim();
      const notes = String(f.get('note') || '').trim();
      if (!newBarcode) { toast('Yeni barkod girilmelidir.'); return true; }

      const button = e.target.querySelector('button[type="submit"]');
      if (button) button.disabled = true;

      // The replacement row and the barcode on the station are written together
      // by replace_station_device(); a record whose station still carries the
      // old barcode would misreport what is physically at the point.
      replaceStationDevice({ stationId: station.dbId, reason, newBarcode, notes })
        .then(() => {
          station.deviceBarcode = newBarcode;
          // A replaced device is back in service: clear the lost/broken status
          // so the point does not keep reporting a fault it no longer has.
          if (station.status === 'damaged' || station.status === 'missing') {
            station.status = 'clean';
            station.checked = true;
          }
          recalculateSiteStats(site);
          e.target.reset();
          e.target.classList.add('hidden');
          renderCompanyStationsTable(site);
          renderStationMarkers(site.stations, $$('[data-station-filter].active')[0]?.dataset.stationFilter || 'all');
          toast(`${station.code} noktasına yeni cihaz tanımlandı (${newBarcode}). Geçmiş ölçümler bu noktada kaldı.`);
          return renderDeviceBlock(site, station);
        })
        .catch((err) => toast(err.message || 'Cihaz değişimi kaydedilemedi.'))
        .finally(() => { if (button) button.disabled = false; });

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

// Office-entered station inspection.
//
// This wrote the reading onto the browser's copy of the station and stamped it
// `controlledBy: "Seda Kaya (Yönetici)"` — a person who does not work at any
// customer's company. Nothing reached the database, so the reading never
// appeared in a visit report, a point's history or an audit trail.
//
// An inspection belongs to a visit: `inspections.work_order_id` is NOT NULL,
// and that is the right constraint rather than an obstacle — a station reading
// with no visit behind it cannot be placed in time or attributed to anyone. So
// the form asks which visit, and says so when the site has none open.
export function adminInspectionSubmit(e) {
  if (e.target.id !== 'adminInspectionForm') return false;
  e.preventDefault();
  if (!ui.activeSiteId || !ui.activeStationCode) return true;

  const site = state.sites.find((x) => x.id === ui.activeSiteId);
  if (!site) return true;
  const station = (site.stations || []).find((st) => st.code === ui.activeStationCode);
  if (!station) return true;

  const f = new FormData(e.target);
  const workOrderId = String(f.get('workOrderId') || '');
  const orgId = state.currentUser?.orgId;
  if (!workOrderId) { toast('Denetimin bağlanacağı iş emrini seçin.'); return true; }
  if (!orgId) { toast('Kuruma bağlı bir hesapla giriş yapmalısınız.'); return true; }

  const pestType = String(f.get('pestType') || 'none');
  const status = String(f.get('status') || 'clean');
  const button = e.target.querySelector('button[type="submit"]');
  if (button) button.disabled = true;

  recordInspection({
    orgId,
    workOrderId,
    stationId: station.dbId || null,
    stationCode: station.code,
    // A recorded pest is activity, whatever the status dropdown says; letting
    // the two disagree is how a site's score drifts away from its readings.
    status: pestType !== 'none' ? 'activity' : status,
    baitStatus: String(f.get('baitStatus') || 'intact'),
    pestType,
    activityCount: parseInt(f.get('pestCount'), 10) || 0,
    notes: String(f.get('notes') || '').trim(),
    createdBy: state.currentUser?.id || null
  })
    .then(() => {
      e.target.reset();
      toast(`İstasyon ${station.code} denetimi kaydedildi.`);
      // Re-read rather than patch the local copy: the station's status is
      // recomputed from its readings, and guessing at it here is what let the
      // browser and the database disagree in the first place.
      return refreshSiteStations(site.id);
    })
    .catch((err) => toast(err.message || 'Denetim kaydedilemedi.'))
    .finally(() => { if (button) button.disabled = false; });

  return true;
}

/**
 * The visits this station's reading can be attached to.
 *
 * Only work orders for this facility that are not yet closed: a completed visit
 * is a finished record and a reading added to it afterwards would change what
 * the customer was already shown.
 */
export function renderInspectionWorkOrders(site) {
  const select = $('#inpInspectionWorkOrder');
  if (!select) return;
  const open = (state.work || []).filter(
    (w) => w.siteId === site.id && w.status !== 'completed' && w.status !== 'cancelled' && w.dbId
  );
  select.innerHTML = open.length
    ? open.map((w) => `<option value="${esc(w.dbId)}">${esc(w.id)} · ${esc(w.tech || 'atanmamış')}</option>`).join('')
    : '<option value="">Bu tesis için açık iş emri yok</option>';
  select.disabled = !open.length;
}

/** Re-read one facility's stations after a write. */
async function refreshSiteStations(siteId) {
  try {
    const sites = await fetchSites();
    replaceSites(sites);
  } catch (err) {
    console.error('[repellent] sahalar yenilenemedi', err);
  }
  showCompanyDetail(siteId);
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

// chemicalUsageSubmit() used to live here. The facility page carried a form
// that recorded an application against the *site* and deducted seeded stock in
// the browser, backed by a hardcoded twelve-product picker in index.html. An
// application belongs to a visit — chemical_usages is what the customer report
// prints and what the stock ledger is written from, and both need the work
// order it happened on — so the form was left refusing every submission with a
// pointer to the work order flow.
//
// A form that looks usable and always refuses is worse than no form, so the
// markup and this handler are both gone; the panel now just says where the
// entry is made.
