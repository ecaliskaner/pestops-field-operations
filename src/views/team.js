// Team / field view (Ekip & rota) — real technicians, real coordinates, real
// device fixes.
//
// What this file used to be: a deterministic simulation. Four hardcoded
// technicians (Ayşe Demir, Mert Kaya, Ece Yılmaz, Can Öztürk) glided along
// hand-drawn İstanbul motorway polylines between eight hardcoded facility
// coordinates, manufacturing geofence enter/exit events as they went, while a
// 3-second poll against /api/mobile/live-positions tried to overlay real fixes
// on top. That endpoint belongs to the old Node server and does not exist on
// the Vercel deployment, so in production the poll failed on every tick and
// what a customer saw was entirely invented movement attributed to people who
// do not work for them.
//
// What it is now: the org's own technicians, its own sites at the coordinates
// it recorded, and only positions the Flutter app actually reported through
// the live_positions() RPC. When nobody is in the field the map says so
// instead of inventing traffic. Every panel degrades to an honest empty state
// rather than a plausible fiction.
//
// Technician rates and compliance documents are edited here: this is the only
// page that already knows which technician is selected, and both are read
// straight back by the finance page and the customer portal.

import { $, esc, toast } from '../core/dom.js';
import { state, save, setTechRates } from '../core/state.js';
import {
  fetchLivePositions, fetchTechnicianCredentials, fetchRatesByTechnician,
  setTechnicianRate, saveTechnicianCredential, signedCredentialUrl
} from '../data/repo/technicians.js';
import { fetchTechnicianStats, fetchGeofenceEvents } from '../data/repo/work.js';
import { setGpsAlerts } from '../core/gpsAlerts.js';
import { updateNotifBadge } from '../ui/notificationCenter.js';

// ---- module-local view state (never persisted) ----

let map = null;
let mapInited = false;
let opBounds = null;
const techLayers = {};        // technician name -> L.marker
let siteLayers = [];          // site markers + geofence circles, re-plotted on change
let routeLayer = null;
let plottedSiteKey = '';      // guards against re-plotting an identical site set

let livePositions = {};       // technician name -> live fix from the RPC
let credentialsByTech = {};   // technician id -> credential rows
let ratesByTechnician = {};   // technician id -> current hourly rate
let technicianStatsRows = [];
let geofenceEvents = [];
let routeOptimized = false;

let livePollTimer = null;
const LIVE_POLL_MS = 15000;   // a real device fix does not move every 3 seconds

// ---- helpers ------------------------------------------------------------

const R_EARTH = 6371000;
const toRad = (d) => (d * Math.PI) / 180;

// Great-circle distance between two [lat,lng] points, in metres.
function haversine(a, b) {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const la1 = toRad(a[0]);
  const la2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}

function initialsOf(name) {
  return String(name || '')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((p) => p[0].toLocaleUpperCase('tr')).join('') || '—';
}

const technicianList = () => state.technicians || [];
const technicianByName = (name) => technicianList().find((t) => t.name === name) || null;

// Sites the org has actually geocoded. A site with no lat/lng cannot be drawn,
// and inventing a coordinate for it would be exactly what this rewrite removes.
const mappableSites = () =>
  (state.sites || []).filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));

function fmtDistance(m) {
  if (typeof m !== 'number' || !Number.isFinite(m)) return '';
  if (m < 1000) return `${Math.round(m)} m`;
  const km = m / 1000;
  return `${km >= 100 ? Math.round(km) : km.toFixed(1)} km`;
}

// ---- data loading -------------------------------------------------------
//
// Loaded lazily on the first Ekip render rather than at sign-in: three extra
// queries should not sit on the login path for a user who never opens this
// page. Each failure is logged and leaves its own panel in its empty state.

let auxLoaded = false;

async function loadTeamAux() {
  if (auxLoaded) return;
  auxLoaded = true;
  try {
    credentialsByTech = await fetchTechnicianCredentials();
  } catch (err) {
    console.error('[repellent] teknisyen belgeleri yuklenemedi', err);
  }
  try {
    ratesByTechnician = await fetchRatesByTechnician();
  } catch (err) {
    // Rates are admin-only; a technician signing in gets denied here and the
    // table simply does not render for them.
    console.error('[repellent] teknisyen ucretleri yuklenemedi', err);
  }
  try {
    technicianStatsRows = await fetchTechnicianStats();
  } catch (err) {
    console.error('[repellent] teknisyen istatistikleri yuklenemedi', err);
  }
  try {
    geofenceEvents = await fetchGeofenceEvents();
  } catch (err) {
    console.error('[repellent] geofence olaylari yuklenemedi', err);
  }
  renderCredentials(state.selectedTech);
  renderTechRates();
  renderProductivity();
  renderGeofenceFeed();
  renderTechDetail();
}

async function pollLivePositions() {
  let rows;
  try {
    rows = await fetchLivePositions();
  } catch (err) {
    console.error('[repellent] canli konumlar alinamadi', err);
    return;
  }
  const next = {};
  for (const p of rows) {
    if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) next[p.name] = p;
  }
  livePositions = next;
  refreshTechMarkers();
  renderLiveGpsNote();
  renderFieldCount();
  publishGpsAlerts();
}

// A technician whose device GPS puts them outside the geofence of the site
// they just reported arriving at. `insideGeofence === false` only: a null
// means the server could not measure it (an offline record), which is not an
// accusation. The notification centre (src/ui/notificationCenter.js) renders
// bridge has to stay wired or that alert silently stops firing.
function publishGpsAlerts() {
  const siteById = new Map((state.sites || []).map((s) => [s.id, s]));
  setGpsAlerts(
    Object.values(livePositions)
      .filter((p) => p.insideGeofence === false)
      .map((p) => ({
        techName: p.name,
        siteCompany: siteById.get(p.siteId)?.company || '',
        siteName: p.siteName,
        workOrderId: p.workOrderId,
        distanceM: p.distanceM,
        radiusM: p.radiusM,
        at: p.at
      }))
  );
  updateNotifBadge();
}

// ---- map ----------------------------------------------------------------

function techColor(name) {
  const t = technicianByName(name);
  return (t && t.color) || '#1769e0';
}

function techIcon(name, active) {
  const p = livePositions[name];
  const live = !!p;
  const mismatch = !!p && p.insideGeofence === false;
  return L.divIcon({
    className: 'tech-marker-wrap',
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    html: `<div class="tech-marker${active ? ' active' : ''}${live ? ' live' : ''}${mismatch ? ' mismatch' : ''}" style="--tc:${techColor(name)}">
             <span>${esc(initialsOf(name))}</span>
           </div>`
  });
}

function siteIcon(site) {
  const cls = site.state === 'risk' ? 'risk' : site.state === 'watch' ? 'watch' : 'ok';
  return L.divIcon({
    className: 'site-marker-wrap',
    iconSize: [20, 28],
    iconAnchor: [10, 28],
    html: `<div class="site-pin ${cls}"><i></i></div><span class="site-pin-label">${esc(site.company || site.name)}</span>`
  });
}

function ensureMap() {
  if (mapInited) return;
  const host = document.getElementById('fieldMap');
  if (!host || typeof L === 'undefined') return;

  map = L.map('fieldMap', {
    zoomControl: true,
    attributionControl: true,
    scrollWheelZoom: true,
    zoomSnap: 0.25
  });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap · © CARTO',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  // A neutral Türkiye-wide opening frame for an org with no geocoded sites
  // yet; plotSites() fits to the real ones as soon as there are any.
  map.setView([39.5, 33.5], 5.5);
  mapInited = true;
}

// Draw the org's real sites and their real geofence radii. Idempotent: the
// site set is keyed so a re-render does not stack duplicate layers.
function plotSites() {
  if (!map) return;
  const sites = mappableSites();

  // Ahead of the memoized short-circuit below, so a genuinely empty portfolio
  // gets the overlay on the very first paint too — the memo key for "no sites"
  // is the same empty string the module starts with, and would otherwise skip
  // this on the first call.
  document.getElementById('fieldMapEmpty')?.classList.toggle('hidden', sites.length > 0);

  const key = sites.map((s) => `${s.id}:${s.lat},${s.lng},${s.geofenceRadiusM},${s.state}`).join('|');
  if (key === plottedSiteKey) return;
  plottedSiteKey = key;

  siteLayers.forEach((layer) => map.removeLayer(layer));
  siteLayers = [];

  sites.forEach((site) => {
    const color = site.state === 'risk' ? '#e0574a' : site.state === 'watch' ? '#d9922b' : '#138b67';
    const circle = L.circle([site.lat, site.lng], {
      radius: site.geofenceRadiusM || 150,
      color, weight: 1.5, opacity: 0.6,
      fillColor: color, fillOpacity: 0.08,
      dashArray: '4 4', interactive: false
    }).addTo(map);
    const marker = L.marker([site.lat, site.lng], { icon: siteIcon(site) })
      .addTo(map)
      .bindTooltip(`<b>${esc(site.company || '')}</b><br>${esc(site.name)}`, { direction: 'top', offset: [0, -26] });
    siteLayers.push(circle, marker);
  });

  if (sites.length) {
    opBounds = L.latLngBounds(sites.map((s) => [s.lat, s.lng]));
    map.fitBounds(opBounds, { padding: [42, 42], maxZoom: 14 });
  }
}

// One marker per technician who has actually reported a fix. A technician with
// no live position gets no marker — the roster still lists them.
function refreshTechMarkers() {
  if (!map) return;
  Object.keys(techLayers).forEach((name) => {
    if (!livePositions[name]) {
      map.removeLayer(techLayers[name]);
      delete techLayers[name];
    }
  });
  Object.entries(livePositions).forEach(([name, p]) => {
    const active = name === state.selectedTech;
    if (techLayers[name]) {
      techLayers[name].setLatLng([p.lat, p.lng]);
      techLayers[name].setIcon(techIcon(name, active));
      return;
    }
    const marker = L.marker([p.lat, p.lng], { icon: techIcon(name, active), zIndexOffset: 500 })
      .addTo(map)
      .bindTooltip(esc(name), { direction: 'top', offset: [0, -18] });
    marker.on('click', () => {
      state.selectedTech = name;
      save();
      refreshTechMarkers();
      renderTeam();
    });
    techLayers[name] = marker;
  });
}

function renderFieldCount() {
  const el = $('#fieldLiveCount');
  if (!el) return;
  const live = Object.keys(livePositions).length;
  el.textContent = live ? `${live} teknisyen sahada` : 'Sahada canlı konum yok';
}

// A line under the map so it is obvious which markers are real device fixes.
// With the simulation gone every marker is one — but the mismatch chips still
// matter: they are the "said they were there, GPS disagrees" alert.
function renderLiveGpsNote() {
  const el = document.getElementById('liveGpsNote');
  if (!el) return;
  const names = Object.keys(livePositions);
  if (!names.length) {
    el.innerHTML = mappableSites().length
      ? '<span class="live-gps-empty">Şu anda sahadan canlı konum bildiren teknisyen yok. Teknisyenler mobil uygulamadan ziyarete başladığında burada görünür.</span>'
      : '<span class="live-gps-empty">Haritada gösterilecek konum yok — tesislerin koordinatları henüz girilmemiş.</span>';
    return;
  }
  el.innerHTML = names.map((n) => {
    const p = livePositions[n];
    const dist = fmtDistance(p.distanceM);
    const mismatch = p.insideGeofence === false;
    const cls = `live-gps-chip${mismatch ? ' mismatch' : ''}`;
    const label = mismatch
      ? `${n} — ${p.siteName || 'tesiste'} değil · ${dist} uzakta`
      : `${n} — canlı GPS${p.siteName ? ` @ ${p.siteName}` : ''}${dist ? ` · ${dist}` : ''}`;
    return `<button type="button" class="${cls}" data-tech="${esc(n)}" title="Haritada göster"><i></i>${esc(label)}</button>`;
  }).join('');
}

let liveNoteBound = false;
function bindLiveNote() {
  if (liveNoteBound) return;
  const el = document.getElementById('liveGpsNote');
  if (!el) return;
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tech]');
    if (!btn || !map) return;
    const p = livePositions[btn.dataset.tech];
    if (p) map.setView([p.lat, p.lng], 14, { animate: true });
  });
  liveNoteBound = true;
}

/**
 * Start live field tracking: build the map, plot the real sites, and begin
 * polling live_positions(). Idempotent across re-renders.
 */
export function startFieldTracking() {
  ensureMap();
  plotSites();
  // The map is built during the initial render() while #team is hidden (zero
  // size), which leaves fitBounds at a bogus zoom. Re-measure once visible.
  if (map) setTimeout(() => {
    map.invalidateSize();
    if (opBounds) map.fitBounds(opBounds, { padding: [42, 42], maxZoom: 14 });
  }, 60);
  bindLiveNote();
  if (livePollTimer == null) {
    pollLivePositions();
    livePollTimer = setInterval(pollLivePositions, LIVE_POLL_MS);
  }
}

/** Stop polling — used when the app tears the view down. */
export function stopFieldTracking() {
  if (livePollTimer != null) { clearInterval(livePollTimer); livePollTimer = null; }
}

// ---- geofence feed ------------------------------------------------------
//
// Real arrivals and real mismatches from work_order_events. The simulation
// used to manufacture an enter/exit pair every time a fake marker crossed a
// fake circle; nothing here is generated in the browser.

function renderGeofenceFeed() {
  const feed = $('#geofenceFeed');
  if (!feed) return;
  if (!geofenceEvents.length) {
    feed.innerHTML = '<p class="geo-empty">Henüz GPS doğrulamalı varış kaydı yok. Teknisyenler mobil uygulamadan tesise vardığını bildirdikçe buraya düşer.</p>';
    return;
  }
  feed.innerHTML = geofenceEvents.map((ev) => `
      <div class="geo-event ${ev.mismatch ? 'exit' : 'enter'}">
        <span class="geo-dot">${ev.mismatch ? '⚠' : '↴'}</span>
        <div class="geo-body">
          <b>${esc(ev.tech)} · ${ev.mismatch ? 'GEOFENCE DIŞI' : 'VARIŞ'}</b>
          <small>${esc(ev.company)} — ${esc(ev.siteName)}${ev.distanceM !== null ? ` · ${esc(fmtDistance(ev.distanceM))}` : ''}</small>
        </div>
        <time>${esc(ev.time)}</time>
      </div>`).join('');
}

// ---- route optimization -------------------------------------------------
//
// Computed over the selected technician's actual open work orders for today,
// using the sites' real coordinates. It previously optimised a fixed list of
// six seeded facilities regardless of who was selected.

function todaysStopsFor(techName) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const siteById = new Map((state.sites || []).map((s) => [s.id, s]));

  const seen = new Set();
  return (state.work || [])
    .filter((w) => w.tech === techName && !w.completed && w.dueAt)
    .filter((w) => { const d = new Date(w.dueAt); return d >= start && d <= end; })
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))
    .map((w) => siteById.get(w.siteId))
    .filter((s) => s && Number.isFinite(s.lat) && Number.isFinite(s.lng))
    .filter((s) => { if (seen.has(s.id)) return false; seen.add(s.id); return true; });
}

// Nearest-neighbour ordering, anchored on the day's first stop.
function optimizeRoute(stops) {
  if (stops.length < 3) return stops;
  const remaining = stops.slice(1);
  const order = [stops[0]];
  let cur = [stops[0].lat, stops[0].lng];
  while (remaining.length) {
    let bestI = 0;
    let bestD = Infinity;
    remaining.forEach((s, i) => {
      const d = haversine(cur, [s.lat, s.lng]);
      if (d < bestD) { bestD = d; bestI = i; }
    });
    const [next] = remaining.splice(bestI, 1);
    order.push(next);
    cur = [next.lat, next.lng];
  }
  return order;
}

function routeDistance(order) {
  let total = 0;
  for (let i = 1; i < order.length; i++) {
    total += haversine([order[i - 1].lat, order[i - 1].lng], [order[i].lat, order[i].lng]);
  }
  return total;
}

// Straight-line metres -> driving minutes. Metro traffic averages ~26 km/h
// door to door, and real roads add ~40% over the crow-flies distance.
const routeMinutes = (order) => Math.round(routeDistance(order) / 360);
const routeKm = (order) => Math.round((routeDistance(order) * 1.4) / 1000);

function renderRouteOptimization() {
  const panel = $('#routeOptBody');
  if (!panel) return;

  const stops = todaysStopsFor(state.selectedTech);
  const btn = $('#btnRouteOptimize');

  if (stops.length < 2) {
    panel.innerHTML = `<p class="route-empty">${esc(state.selectedTech || 'Seçili teknisyen')} için bugün rota hesaplanacak yeterli ziyaret yok. En az iki, koordinatı girilmiş tesise açık iş emri gerekiyor.</p>`;
    if (btn) btn.disabled = true;
    if (routeLayer && map) { map.removeLayer(routeLayer); routeLayer = null; }
    return;
  }
  if (btn) btn.disabled = false;

  const optimized = optimizeRoute(stops);
  const naiveMin = routeMinutes(stops);
  const optMin = routeMinutes(optimized);
  const saved = naiveMin - optMin;
  const savedPct = naiveMin ? Math.round((saved / naiveMin) * 100) : 0;
  const shown = routeOptimized ? optimized : stops;

  const chips = shown.map((s, i) =>
    `<span class="route-chip">${i + 1}. ${esc(s.company || s.name)}</span>`
  ).join('<span class="route-arrow">→</span>');

  panel.innerHTML = `
    <div class="route-compare">
      <div class="route-metric ${esc(routeOptimized ? '' : 'active')}">
        <span>Planlanan sıra</span><strong>${esc(naiveMin)} dk</strong><small>${esc(routeKm(stops))} km</small>
      </div>
      <div class="route-metric ${esc(routeOptimized ? 'active' : '')}">
        <span>Optimize sıra</span><strong>${esc(optMin)} dk</strong><small>${esc(routeKm(optimized))} km</small>
      </div>
      <div class="route-metric saved">
        <span>Kazanç</span><strong>${esc(saved)} dk · %${esc(savedPct)}</strong>
      </div>
    </div>
    <p class="route-mode">${esc(routeOptimized ? '✓ En yakın-komşu sıralaması' : `${state.selectedTech} · bugünkü planlanan sıra`)}</p>
    <div class="route-chips">${chips}</div>`;

  drawRouteOverlay(shown);
}

function drawRouteOverlay(order) {
  if (!map) return;
  if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
  if (order.length < 2) return;
  routeLayer = L.polyline(order.map((s) => [s.lat, s.lng]), {
    color: routeOptimized ? '#138b67' : '#c2673a',
    weight: 3, opacity: 0.85,
    dashArray: routeOptimized ? null : '8 8',
    lineJoin: 'round'
  }).addTo(map);
}

// ---- credentials --------------------------------------------------------

const CREDENTIAL_ICONS = {
  sgk: '🧾', safety_cert: '🦺', permit: '📋', health_report: '🩺'
};

// A document expiring within this window is flagged, so the office renews it
// before a customer audit finds it — not merely once it has already lapsed.
const EXPIRY_WARNING_DAYS = 60;

function credentialRow(doc) {
  const icon = CREDENTIAL_ICONS[doc.kind] || '📄';
  const parts = [];
  if (doc.referenceNo) parts.push(`Belge no: ${doc.referenceNo}`);
  if (doc.validUntil) {
    parts.push(`Geçerlilik: ${new Date(doc.validUntil).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })}`);
  }
  const soon = doc.validUntil
    && (new Date(doc.validUntil) - Date.now()) < EXPIRY_WARNING_DAYS * 24 * 3600 * 1000;
  const ok = doc.isValid && !soon;
  const label = ok ? 'Geçerli' : (doc.isValid ? 'Yakında doluyor' : 'Geçersiz');
  return `
    <div class="cred-doc">
      <span class="cred-doc-icon">${icon}</span>
      <div class="cred-doc-body"><b>${esc(doc.title)}</b><small>${esc(parts.join(' · ') || '—')}</small></div>
      <span class="cred-doc-status ${ok ? 'ok' : 'warn'}">${label}</span>
      ${doc.documentPath
        ? `<button type="button" class="text-btn cred-open-btn" data-path="${esc(doc.documentPath)}" style="padding:0 0 0 8px; font-size:10px; font-weight:700; color:var(--violet);">Aç ↗</button>`
        : '<span style="color:var(--muted); font-size:10px; padding-left:8px;">dosya yok</span>'}
    </div>`;
}

function renderCredentials(techName) {
  const host = $('#techCredentials');
  if (!host) return;
  const tech = technicianByName(techName);
  if (!tech) {
    host.innerHTML = '<p class="cred-empty">Teknisyen seçilmedi.</p>';
    return;
  }
  const docs = credentialsByTech[tech.id] || [];

  host.innerHTML = `
    <div class="cred-head">
      <span class="tech-avatar" style="background:${esc(tech.color || '#eee')}">${esc(tech.initials || initialsOf(tech.name))}</span>
      <div><b>${esc(tech.name)}</b><span>Belgeler müşteri portalında görüntülenebilir</span></div>
    </div>
    <div class="cred-docs">
      ${docs.length ? docs.map(credentialRow).join('')
        : '<p class="cred-empty">Bu teknisyen için henüz belge kaydı girilmemiş (SGK, iş güvenliği sertifikası, uygulama izni, portör raporu).</p>'}
    </div>
    <p class="cred-kvkk">🔒 <b>KVKK bildirimi:</b> Belgeler yalnızca ilgili müşteriye ve yalnızca hizmet süresince gösterilir.
    Kimlik ve SGK numaraları maskelenmiş biçimde saklanır; belge dosyaları özel (private) depolama alanında tutulur.</p>`;
}

// ---- productivity -------------------------------------------------------

const hours = (min) => Math.round(min / 60);
const utilisation = (t) =>
  (t.onSiteMin + t.travelMin ? Math.round((t.onSiteMin / (t.onSiteMin + t.travelMin)) * 100) : 0);
const utilClass = (u) => (u >= 70 ? 'ok' : u >= 60 ? 'mid' : 'low');

function renderProductivity() {
  const body = $('#teamProductivityBody');
  if (!body) return;

  const stats = technicianStatsRows;
  const pill = $('#teamUtilPill');

  if (!stats.length) {
    if (pill) { pill.textContent = 'Veri yok'; pill.className = 'status-chip blue'; }
    body.innerHTML = `<p class="prod-empty">Verimlilik, tamamlanan iş emirlerinin gerçek zaman damgalarından hesaplanır:
      yol süresi (yola çıkış → GPS varış) ve saha süresi (ilk QR → tamamlama). Henüz tamamlanmış ziyaret olmadığı için
      gösterilecek veri yok.</p>`;
    return;
  }

  const totalOn = stats.reduce((s, t) => s + t.onSiteMin, 0);
  const totalTravel = stats.reduce((s, t) => s + t.travelMin, 0);
  const totalVisits = stats.reduce((s, t) => s + t.visits, 0);
  const teamUtil = totalOn + totalTravel ? Math.round((totalOn / (totalOn + totalTravel)) * 100) : 0;

  if (pill) {
    pill.textContent = `Ekip verimliliği %${teamUtil}`;
    pill.className = `status-chip ${teamUtil >= 70 ? 'healthy' : teamUtil >= 60 ? 'warning' : 'blue'}`;
  }

  const rows = stats.map((t) => {
    const u = utilisation(t);
    const tech = technicianByName(t.tech);
    const sel = t.tech === state.selectedTech ? ' selected' : '';
    return `
      <div class="prod-row${sel}" data-tech="${esc(t.tech)}">
        <div class="prod-row-head">
          <span class="tech-avatar" style="background:${esc((tech && tech.color) || '#eee')}">${esc(initialsOf(t.tech))}</span>
          <div class="prod-row-id"><b>${esc(t.tech)}</b><small>${esc(t.visits)} ziyaret · ort. saha ${esc(t.avgOnSiteMin)} dk · ort. yol ${esc(t.avgTravelMin)} dk</small></div>
          <span class="prod-util ${utilClass(u)}">%${esc(u)}</span>
        </div>
        <div class="prod-bar" title="Saha ${hours(t.onSiteMin)} sa · Yol ${hours(t.travelMin)} sa">
          <span class="prod-bar-on" style="width:${u}%"></span>
          <span class="prod-bar-travel" style="width:${100 - u}%"></span>
        </div>
      </div>`;
  }).join('');

  body.innerHTML = `
    <div class="prod-summary">
      <div class="prod-stat"><span>Ekip verimliliği</span><strong class="${esc(teamUtil >= 70 ? 'good' : teamUtil >= 60 ? 'mid' : 'bad')}">%${esc(teamUtil)}</strong><small>saha / toplam mesai</small></div>
      <div class="prod-stat"><span>Toplam saha süresi</span><strong>${esc(hours(totalOn))} sa</strong><small>faturalanabilir</small></div>
      <div class="prod-stat"><span>Toplam yol süresi</span><strong>${esc(hours(totalTravel))} sa</strong><small>windshield / gayri-faturalı</small></div>
      <div class="prod-stat"><span>Tamamlanan ziyaret</span><strong>${esc(totalVisits)}</strong><small>tüm zamanlar</small></div>
    </div>
    <div class="prod-legend"><span><i class="on"></i> Saha (faturalanabilir)</span><span><i class="travel"></i> Yol (windshield)</span></div>
    <div class="prod-rows">${rows}</div>`;
}

// ---- technician detail + roster -----------------------------------------

// What the technician is doing right now, from evidence rather than a stored
// status string: a live fix means they are in the field, and the geofence
// verdict on that fix says whether they are actually at the site.
function liveStatusOf(techName) {
  const p = livePositions[techName];
  if (!p) return { status: 'Sahada değil', detail: 'Canlı konum bildirimi yok' };
  if (p.insideGeofence === false) {
    return {
      status: 'Tesis dışında',
      detail: `${p.siteName || 'Tesis'} sınırının ${fmtDistance(p.distanceM)} dışında`
    };
  }
  return {
    status: 'Müşteride',
    detail: p.siteName ? `${p.siteName} · geofence içinde` : 'Geofence içinde'
  };
}

function renderTechDetail() {
  const host = $('#techDetail');
  if (!host) return;

  const tech = technicianByName(state.selectedTech);
  if (!tech) {
    host.innerHTML = '<p class="empty">Henüz teknisyen kaydı yok. Aşağıdaki <b>Teknisyen ekle</b> ile ekibinize teknisyen davet edin.</p>';
    return;
  }

  const live = liveStatusOf(tech.name);
  const p = livePositions[tech.name];
  const stats = technicianStatsRows.find((s) => s.tech === tech.name);
  const statLine = stats
    ? `${stats.visits} ziyaret · saha ort. ${stats.avgOnSiteMin} dk · yol ort. ${stats.avgTravelMin} dk`
    : 'Henüz tamamlanmış ziyaret yok';
  const stopNames = todaysStopsFor(tech.name).map((s) => s.company || s.name).join(' → ');
  const lastSignal = p
    ? new Date(p.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    : '—';

  host.innerHTML = `
    <div class="tech-summary">
      <span class="tech-avatar" style="background:${esc(tech.color || '#eee')}">${esc(tech.initials || initialsOf(tech.name))}</span>
      <div><b>${esc(tech.name)}</b><span>${esc(live.status)}${tech.phone ? ` · ${esc(tech.phone)}` : ''}</span></div>
    </div>
    <div class="tech-rows">
      <div><span>Mevcut durum</span><b>${esc(live.detail)}</b></div>
      <div><span>Son konum sinyali</span><b>${esc(lastSignal)}</b></div>
      <div><span>Bugünkü rota</span><b>${esc(stopNames || 'Bugün planlı ziyaret yok')}</b></div>
      <div><span>Saha özeti</span><b>${esc(statLine)}</b></div>
      ${tech.email ? `<div><span>E-posta</span><b>${esc(tech.email)}</b></div>` : ''}
    </div>
    <button class="secondary-btn map-access" data-action="facilityMap">⌖ Tesis planını görüntüle</button>
    <p class="map-hint">Plan uygulama içinde çevrimiçi görüntülenir; teknisyen isterse offline kullanım için ayrıca indirebilir.</p>
  `;
}

function renderRoster() {
  const host = $('#roster');
  if (!host) return;
  const techs = technicianList();
  if (!techs.length) {
    host.innerHTML = '<p class="empty">Ekibinizde henüz teknisyen yok.</p>';
    return;
  }
  host.innerHTML = techs.map((t) => {
    const live = liveStatusOf(t.name);
    return `
    <div class="roster-item" data-tech="${esc(t.name)}" style="cursor:pointer; background:${state.selectedTech === t.name ? '#f0f4f8' : ''}">
      <span class="tech-avatar" style="background:${esc(t.color || '#eee')}">${esc(t.initials || initialsOf(t.name))}</span>
      <div><b>${esc(t.name)}</b><span>${esc(live.status)}</span></div>
    </div>`;
  }).join('');
}

// ---- main view rendering ------------------------------------------------

export function renderTeam() {
  // The selected technician is stored by name (app.js and finance.js both
  // compare against it). The seed left "Ayşe Demir" there, so anything not in
  // the real roster falls back to the first real technician.
  const techs = technicianList();
  if (!technicianByName(state.selectedTech)) {
    // Falls back to the first real technician, or to nothing at all: an org
    // with no technicians yet must not keep showing the seeded "Ayse Demir",
    // which leaked into the route panel's copy.
    state.selectedTech = techs.length ? techs[0].name : '';
  }

  renderRoster();
  renderTechDetail();
  renderCredentials(state.selectedTech);
  // The rate table lists every technician, so it belongs on the render path and
  // not only in loadTeamAux(): that runs once and had already run — against an
  // empty roster — by the time the technicians finished loading.
  renderTechRates();
  renderProductivity();
  renderFieldCount();
  renderLiveGpsNote();
  renderGeofenceFeed();
  startFieldTracking();
  plotSites();
  renderRouteOptimization();
  refreshTechMarkers();
  loadTeamAux();
}

export function teamRosterClicks(e) {
  if (e.target.id === 'btnRouteOptimize') {
    routeOptimized = !routeOptimized;
    const btn = $('#btnRouteOptimize');
    if (btn) btn.textContent = routeOptimized ? '↺ Planlanan sırayı göster' : '⚡ Rotayı optimize et';
    renderRouteOptimization();
    return true;
  }

  const tech = e.target.closest('[data-tech]');
  if (tech) {
    state.selectedTech = tech.dataset.tech;
    save();
    refreshTechMarkers();
    renderTeam();
    return true;
  }

  return false;
}

// ---- hourly rates -------------------------------------------------------
//
// technician_rates was readable but had no write path, so a technician with no
// rate on file stayed out of every labour cost and margin. That exclusion is
// deliberate — an invented rate produces an invented margin — which made this
// table the missing half of the finance page rather than a convenience.

function renderTechRates() {
  const body = $('#techRatesBody');
  if (!body) return;

  const techs = technicianList();
  if (!techs.length) {
    body.innerHTML = '<tr><td colspan="4" class="empty" style="text-align:center;">Kayıtlı teknisyen bulunmuyor.</td></tr>';
    return;
  }

  body.innerHTML = techs.map((t) => {
    const rate = ratesByTechnician[t.id];
    return `
      <tr>
        <td><b>${esc(t.name)}</b></td>
        <td>
          <input type="number" min="1" step="any" class="form-input tech-rate-input"
                 data-tech="${esc(t.id)}" value="${rate ? esc(rate.hourlyRate) : ''}"
                 placeholder="tanımsız" style="height:28px; font-size:11px; max-width:120px;">
        </td>
        <td><small class="text-muted">${rate?.validFrom
          ? esc(new Date(rate.validFrom).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }))
          : '—'}</small></td>
        <td><button type="button" class="text-btn tech-rate-save" data-tech="${esc(t.id)}" style="padding:0; font-size:10px; font-weight:700; color:var(--blue);">Kaydet</button></td>
      </tr>`;
  }).join('');
}

export function teamAdminClicks(e) {
  const openDoc = e.target.closest('.cred-open-btn');
  if (openDoc) {
    signedCredentialUrl(openDoc.dataset.path).then((url) => {
      if (url) window.open(url, '_blank', 'noopener');
      else toast('Belge bağlantısı alınamadı.');
    });
    return true;
  }

  const saveRate = e.target.closest('.tech-rate-save');
  if (saveRate) {
    const technicianId = saveRate.dataset.tech;
    const input = document.querySelector(`.tech-rate-input[data-tech="${technicianId}"]`);
    const orgId = state.currentUser?.orgId;
    if (!orgId) { toast('Kuruma bağlı bir hesapla giriş yapmalısınız.'); return true; }

    const hourlyRate = parseFloat(input && input.value);
    if (!(hourlyRate > 0)) { toast('Saatlik ücret sıfırdan büyük olmalıdır.'); return true; }

    saveRate.disabled = true;
    setTechnicianRate({ orgId, technicianId, hourlyRate })
      .then((saved) => {
        ratesByTechnician[technicianId] = saved;
        // The finance page prices labour by technician *name*, so the store it
        // reads is updated here too rather than waiting for the next sign-in.
        const tech = technicianList().find((t) => t.id === technicianId);
        if (tech) setTechRates({ ...(state.techRates || {}), [tech.name]: saved.hourlyRate });
        renderTechRates();
        toast(`${tech ? tech.name : 'Teknisyen'} saatlik ücreti kaydedildi.`);
      })
      .catch((err) => toast(err.message || 'Ücret kaydedilemedi.'))
      .finally(() => { saveRate.disabled = false; });
    return true;
  }

  return false;
}

export function techCredentialSubmit(e) {
  if (e.target.id !== 'techCredentialForm') return false;
  e.preventDefault();

  const tech = technicianByName(state.selectedTech);
  const orgId = state.currentUser?.orgId;
  if (!tech) { toast('Önce bir teknisyen seçin.'); return true; }
  if (!orgId) { toast('Kuruma bağlı bir hesapla giriş yapmalısınız.'); return true; }

  const f = new FormData(e.target);
  const title = String(f.get('title') || '').trim();
  if (!title) { toast('Belge başlığı zorunludur.'); return true; }

  const fileInput = $('#inpCredentialFile');
  const file = fileInput && fileInput.files && fileInput.files[0];

  const button = e.target.querySelector('button[type="submit"]');
  if (button) button.disabled = true;

  saveTechnicianCredential({
    orgId,
    technicianId: tech.id,
    kind: String(f.get('kind') || 'permit'),
    title,
    referenceNo: String(f.get('referenceNo') || '').trim(),
    validUntil: String(f.get('validUntil') || ''),
    file: file || null
  })
    .then(() => fetchTechnicianCredentials())
    .then((byTech) => {
      credentialsByTech = byTech;
      renderCredentials(state.selectedTech);
      e.target.reset();
      toast(`${tech.name} için belge kaydedildi.`);
    })
    .catch((err) => toast(err.message || 'Belge kaydedilemedi.'))
    .finally(() => { if (button) button.disabled = false; });

  return true;
}
