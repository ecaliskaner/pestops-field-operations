// Team / field view. Extracted from app.js (Phase 0a-3), extended in Phase 3a
// (Session G) with a live simulated-GPS map, geofence enter/exit events, route
// optimization before/after, and technician credential cards.
//
// The map is a REAL Leaflet/OpenStreetMap surface centred on the İstanbul metro
// area. Sites, depot and technicians sit on genuine coordinates, and each
// technician follows a polyline that traces the actual motorway corridors
// (D-100 / O-4 on the Anadolu side, the 15 Temmuz bridge, the TEM/O-3 to
// Hadımköy). Baseline motion is a deterministic in-browser simulation, but any
// technician who reports a real fix from the Flutter app is pinned to their
// true coordinates instead — see pollLivePositions() below.

import { $, $$ } from '../core/dom.js';
import { state } from '../core/state.js';
import { save } from '../core/state.js';
import { techData, techSites, initial } from '../data/seed.js';
import { technicianStats } from '../data/history.js';
import { credentialDocs } from '../data/credentials.js';
import { stackedBarChart, mountChart } from '../ui/charts.js';
import { setGpsAlerts } from '../core/gpsAlerts.js';
import { updateNotifBadge } from '../ui/demo.js';

// ---- real geography (WGS84 lat/lng) -------------------------------------
//
// The six seeded sites are already real İstanbul-area facilities, so each gets
// its true-ish coordinate plus a geofence radius in metres. The depot is the
// Repellent operations hub on the Anadolu side (Kozyatağı).

const DEPOT = { lat: 40.9762, lng: 29.0980, name: 'Repellent Merkez' };

const SITE_GEO = {
  s1: { lat: 40.8021, lng: 29.4307, r: 240 }, // Acme Foods — Gebze Üretim Tesisi
  s2: { lat: 41.1372, lng: 28.6792, r: 240 }, // Kuzey Lojistik — Hadımköy Dağıtım Merkezi
  s3: { lat: 40.9923, lng: 29.1277, r: 200 }, // Aster Hospital — Ataşehir Kampüsü
  s4: { lat: 41.0812, lng: 29.0101, r: 170 }, // Bora Retail — Levent Merkez Mağaza
  s5: { lat: 40.8252, lng: 29.3761, r: 210 }, // Novatek — Çayırova Ar-Ge Merkezi
  s6: { lat: 41.0369, lng: 28.9851, r: 160 }  // Orion Hotels — Taksim Otel
};

const siteById = (id) => initial.sites.find((s) => s.id === id);

// ---- road corridors -----------------------------------------------------
//
// Shared waypoints along the real motorways. Technician routes are assembled
// from these so several technicians visibly share the same highways.

const P = {
  depot:   [DEPOT.lat, DEPOT.lng],
  s1:      [SITE_GEO.s1.lat, SITE_GEO.s1.lng],
  s2:      [SITE_GEO.s2.lat, SITE_GEO.s2.lng],
  s3:      [SITE_GEO.s3.lat, SITE_GEO.s3.lng],
  s4:      [SITE_GEO.s4.lat, SITE_GEO.s4.lng],
  s5:      [SITE_GEO.s5.lat, SITE_GEO.s5.lng],
  s6:      [SITE_GEO.s6.lat, SITE_GEO.s6.lng],
  // Anadolu D-100 / O-4 eastbound corridor
  kozOn:   [40.9840, 29.1080],
  kartal:  [40.9010, 29.1800],
  pendik:  [40.8790, 29.2560],
  tuzla:   [40.8400, 29.3050],
  // 15 Temmuz bridge crossing (Anadolu <-> Avrupa)
  uskudar: [41.0230, 29.0250],
  brA:     [41.0400, 29.0330],
  brB:     [41.0455, 29.0280],
  besik:   [41.0430, 29.0060],
  // Avrupa TEM / O-3 towards Hadımköy
  maslak:  [41.1080, 29.0180],
  tem1:    [41.1150, 28.9200],
  tem2:    [41.1300, 28.8000],
  taksAcc: [41.0700, 28.9600]
};

// Each technician's full working loop, depot -> stops -> depot, expressed as an
// ordered list of corridor keys. The site keys (s1..s6) are the geofenced
// stops; everything else is a road waypoint.
const TECH_LOOPS = {
  'Ayşe Demir': ['depot', 'kozOn', 'kartal', 'pendik', 'tuzla', 's5', 's1',
                 'tuzla', 'pendik', 'kartal', 's3', 'kozOn', 'depot'],
  'Mert Kaya':  ['depot', 'uskudar', 'brA', 'brB', 'besik', 'maslak', 'tem1', 'tem2', 's2',
                 'tem2', 'tem1', 'taksAcc', 's6', 'besik', 'brB', 'brA', 'uskudar', 'depot'],
  'Ece Yılmaz': ['depot', 'uskudar', 'brA', 'brB', 'besik', 'taksAcc', 's6',
                 'besik', 'brB', 'brA', 'uskudar', 'kozOn', 's3',
                 'kartal', 'pendik', 'tuzla', 's5', 's1',
                 'tuzla', 'pendik', 'kartal', 'kozOn', 'depot'],
  'Can Öztürk': ['depot', 'uskudar', 'brA', 'brB', 'besik', 's4',
                 'besik', 'brB', 'brA', 'uskudar', 'kozOn', 'kartal', 'pendik', 'tuzla', 's5',
                 'tuzla', 'pendik', 'kartal', 'kozOn', 'depot']
};

// Which stops belong to each technician's day (drives the roster / route panel).
const TECH_STOPS = {
  'Ayşe Demir': ['s1', 's3'],
  'Mert Kaya':  ['s2', 's6'],
  'Ece Yılmaz': ['s6', 's3', 's1'],
  'Can Öztürk': ['s4', 's5']
};

// ---- geometry helpers ---------------------------------------------------

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

// Pre-compute cumulative distances along a polyline so we can map a "metres
// travelled" cursor onto a real coordinate.
function buildRoute(keys) {
  const pts = keys.map((k) => P[k]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + haversine(pts[i - 1], pts[i]));
  return { pts, cum, total: cum[cum.length - 1] };
}

// Position along a route at a given distance (wraps around the loop).
function locate(route, distance) {
  const total = route.total || 1;
  let d = ((distance % total) + total) % total;
  const { pts, cum } = route;
  let i = 1;
  while (i < cum.length && cum[i] < d) i++;
  if (i >= cum.length) return { lat: pts[pts.length - 1][0], lng: pts[pts.length - 1][1] };
  const segLen = cum[i] - cum[i - 1] || 1;
  const t = (d - cum[i - 1]) / segLen;
  const a = pts[i - 1];
  const b = pts[i];
  return { lat: a[0] + (b[0] - a[0]) * t, lng: a[1] + (b[1] - a[1]) * t };
}

// ---- live simulation state (module-local; never persisted) ----

let map = null;
let mapInited = false;
let opBounds = null;          // bounds of the whole operating area (for re-fit)
const techLayers = {};        // tech -> L.marker
let siteCircles = {};         // siteId -> L.circle
let routeLayer = null;        // L.polyline group for the optimization overlay

const routes = {};            // tech -> buildRoute(...)
const motion = {};            // tech -> { cursor, speed }
const insideFence = {};       // tech -> Set of siteIds currently inside
let geofenceEvents = [];      // most-recent-first feed
let routeOptimized = false;   // route panel before/after toggle

let simTimer = null;
let lastTs = 0;
const TICK_MS = 100;          // animation cadence

// ---- real GPS from the technician mobile app ----------------------------
// Everything above this line is simulated. This is not: the Flutter app posts
// a real device fix to /api/mobile/work-orders/:id/arrive, and the API keeps it
// in its event log. Any technician who has reported in gets pinned to their
// true coordinates; the rest keep gliding along the simulated loops so the map
// still reads as a live fleet.
const realPositions = {};     // tech name -> { lat, lng, at, siteCompany, distanceM }
let livePollTimer = null;
const LIVE_POLL_MS = 3000;

async function pollLivePositions() {
  let payload;
  try {
    const res = await fetch('/api/mobile/live-positions', { cache: 'no-store' });
    if (!res.ok) return;
    payload = await res.json();
  } catch {
    return;                   // API down → keep simulating, never break the map
  }
  let changed = false;
  const seen = new Set();
  (payload.positions || []).forEach((p) => {
    const lat = Number(p && p.lat);
    const lng = Number(p && p.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    // Only known technicians — the map has no marker for anyone else.
    if (!(p.techName in techLayers)) return;
    seen.add(p.techName);
    const prev = realPositions[p.techName];
    if (!prev || prev.at !== p.at) changed = true;
    realPositions[p.techName] = { ...p, lat, lng };
  });
  // Someone the server no longer reports — most often after POST /api/mobile/reset
  // — must fall back to the simulation instead of staying pinned at a stale fix
  // forever. The cursor kept advancing, so they rejoin their route in place.
  Object.keys(realPositions).forEach((n) => {
    if (!seen.has(n)) { delete realPositions[n]; changed = true; }
  });
  if (changed) {
    refreshTechMarkers();
    renderLiveGpsNote();
    publishGpsAlerts();
  }
}

// A technician whose device GPS puts them outside the geofence of the site they
// just reported arriving at. `insideGeofence === false` only — a null means the
// server could not measure it (offline record), which is not an accusation.
function publishGpsAlerts() {
  const alerts = Object.values(realPositions)
    .filter((p) => p.insideGeofence === false)
    .map((p) => ({
      techName: p.techName,
      siteCompany: p.siteCompany,
      siteName: p.siteName,
      workOrderId: p.workOrderId,
      distanceM: p.distanceM,
      radiusM: p.radiusM,
      at: p.at,
    }));
  setGpsAlerts(alerts);
  updateNotifBadge();
}

function fmtDistance(m) {
  if (typeof m !== 'number') return '';
  if (m < 1000) return `${m} m`;
  const km = m / 1000;
  return `${km >= 100 ? Math.round(km) : km.toFixed(1)} km`;
}

// True when a fix lands anywhere near the İstanbul operating area. A phone
// reporting from far outside it — a bad fix, a VPN, or an emulator still on its
// factory Mountain View default — would otherwise just vanish off-map with no
// explanation, which reads as "the feature is broken".
function withinOperatingArea(lat, lng) {
  if (!opBounds) return true;
  return opBounds.pad(0.6).contains([lat, lng]);
}

// A line under the map so it is obvious which markers are real device fixes
// rather than simulation — otherwise the demo looks identical either way.
// Each chip pans the map to that technician, including the off-area ones.
function renderLiveGpsNote() {
  const el = document.getElementById('liveGpsNote');
  if (!el) return;
  const names = Object.keys(realPositions);
  if (!names.length) { el.innerHTML = ''; return; }
  el.innerHTML = names.map((n) => {
    const p = realPositions[n];
    const dist = fmtDistance(p.distanceM);
    const mismatch = p.insideGeofence === false;
    const offMap = !withinOperatingArea(p.lat, p.lng);
    let cls = 'live-gps-chip';
    let label;
    if (mismatch) {
      // The whole point of the alert: they said they were there, GPS disagrees.
      cls += ' mismatch';
      label = `${n} — ${p.siteCompany || 'tesiste'} değil · ${dist} uzakta${offMap ? ' (harita dışı)' : ''}`;
    } else {
      if (offMap) cls += ' off-area';
      label = `${n} — canlı GPS${p.siteCompany ? ` @ ${p.siteCompany}` : ''}${dist ? ` · ${dist}` : ''}`;
    }
    return `<button type="button" class="${cls}" data-tech="${n}" title="Haritada göster"><i></i>${label}</button>`;
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
    const p = realPositions[btn.dataset.tech];
    if (p) map.setView([p.lat, p.lng], 14, { animate: true });
  });
  liveNoteBound = true;
}

// A full working loop plays out in this many wall-clock seconds. Fast enough to
// be visibly live, slow enough to read as real road movement (~a marker gliding
// down the motorway) rather than teleporting.
const LOOP_SECONDS = 150;

function initMotion() {
  const techs = Object.keys(TECH_LOOPS);
  techs.forEach((tech, i) => {
    if (motion[tech]) return;
    routes[tech] = buildRoute(TECH_LOOPS[tech]);
    // Spread the technicians around their loops so they don't all start stacked
    // on the depot.
    motion[tech] = {
      cursor: routes[tech].total * (i / techs.length),
      speed: routes[tech].total / LOOP_SECONDS // metres per second
    };
    insideFence[tech] = new Set();
  });
}

// ---- Leaflet map ---------------------------------------------------------

function techColor(tech) { return (techData[tech] || [])[5] || '#1769e0'; }
function techInitials(tech) { return (techData[tech] || ['--'])[0]; }

function techIcon(tech, active) {
  // `live` = a real GPS fix from the mobile app, not simulation.
  // `mismatch` = that fix contradicts the arrival the technician reported.
  const p = realPositions[tech];
  const live = !!p;
  const mismatch = !!p && p.insideGeofence === false;
  return L.divIcon({
    className: 'tech-marker-wrap',
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    html: `<div class="tech-marker${active ? ' active' : ''}${live ? ' live' : ''}${mismatch ? ' mismatch' : ''}" style="--tc:${techColor(tech)}">
             <span>${techInitials(tech)}</span>
           </div>`
  });
}

function siteIcon(siteId) {
  const site = siteById(siteId);
  const label = site ? site.company : siteId;
  const cls = site ? (site.state === 'risk' ? 'risk' : site.state === 'watch' ? 'watch' : 'ok') : 'ok';
  return L.divIcon({
    className: 'site-marker-wrap',
    iconSize: [20, 28],
    iconAnchor: [10, 28],
    html: `<div class="site-pin ${cls}"><i></i></div><span class="site-pin-label">${label}</span>`
  });
}

function depotIcon() {
  return L.divIcon({
    className: 'depot-marker-wrap',
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    html: `<div class="depot-pin">🏢</div><span class="site-pin-label depot">${DEPOT.name}</span>`
  });
}

// Build the map exactly once. Idempotent across re-renders.
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

  // Geofence circles + site pins.
  siteCircles = {};
  Object.entries(SITE_GEO).forEach(([id, g]) => {
    const site = siteById(id);
    const risk = site && site.state === 'risk';
    const watch = site && site.state === 'watch';
    const color = risk ? '#e0574a' : watch ? '#d9922b' : '#138b67';
    siteCircles[id] = L.circle([g.lat, g.lng], {
      radius: g.r,
      color,
      weight: 1.5,
      opacity: 0.6,
      fillColor: color,
      fillOpacity: 0.08,
      dashArray: '4 4',
      interactive: false
    }).addTo(map);
    const site2 = siteById(id);
    L.marker([g.lat, g.lng], { icon: siteIcon(id) })
      .addTo(map)
      .bindTooltip(site2 ? `<b>${site2.company}</b><br>${site2.name}` : id, { direction: 'top', offset: [0, -26] });
  });

  // Depot.
  L.marker([DEPOT.lat, DEPOT.lng], { icon: depotIcon() })
    .addTo(map)
    .bindTooltip(`<b>${DEPOT.name}</b><br>Operasyon merkezi`, { direction: 'top', offset: [0, -24] });

  // Technician markers.
  Object.keys(TECH_LOOPS).forEach((tech) => {
    const active = tech === state.selectedTech;
    const start = locate(routes[tech], motion[tech].cursor);
    const marker = L.marker([start.lat, start.lng], {
      icon: techIcon(tech, active),
      zIndexOffset: 500
    }).addTo(map);
    marker.bindTooltip(tech, { direction: 'top', offset: [0, -18] });
    marker.on('click', () => {
      state.selectedTech = tech;
      save();
      refreshTechMarkers();
      renderTeam();
    });
    techLayers[tech] = marker;
  });

  // Frame the whole operating area.
  opBounds = L.latLngBounds([
    [DEPOT.lat, DEPOT.lng],
    ...Object.values(SITE_GEO).map((g) => [g.lat, g.lng])
  ]);
  map.fitBounds(opBounds, { padding: [42, 42] });

  mapInited = true;
}

// Re-skin the technician markers to reflect the current selection.
function refreshTechMarkers() {
  Object.entries(techLayers).forEach(([tech, marker]) => {
    marker.setIcon(techIcon(tech, tech === state.selectedTech));
  });
}

// ---- animation loop ------------------------------------------------------

// Driven by a timer (not requestAnimationFrame) so live tracking keeps ticking
// even when the browser tab is backgrounded; motion uses the real elapsed time
// between ticks so it stays smooth and frame-rate independent.
function step() {
  const ts = performance.now();
  if (!lastTs) lastTs = ts;
  let dt = (ts - lastTs) / 1000;
  lastTs = ts;
  // Guard against huge jumps when the tab was backgrounded (timers clamp there).
  if (dt > 1) dt = TICK_MS / 1000;

  let fired = false;

  Object.entries(motion).forEach(([tech, m]) => {
    m.cursor += m.speed * dt;
    // A real device fix wins over the simulated loop. The cursor keeps
    // advancing regardless, so if the phone goes quiet the marker resumes its
    // route from where it would have been rather than snapping backwards.
    const real = realPositions[tech];
    const pos = real ? { lat: real.lat, lng: real.lng } : locate(routes[tech], m.cursor);
    const marker = techLayers[tech];
    if (marker) marker.setLatLng([pos.lat, pos.lng]);

    // Geofence membership against every site, using real metres.
    Object.entries(SITE_GEO).forEach(([siteId, g]) => {
      const within = haversine([pos.lat, pos.lng], [g.lat, g.lng]) <= g.r;
      const was = insideFence[tech].has(siteId);
      if (within && !was) {
        insideFence[tech].add(siteId);
        pushGeofenceEvent(tech, siteId, 'enter');
        fired = true;
      } else if (!within && was) {
        insideFence[tech].delete(siteId);
        pushGeofenceEvent(tech, siteId, 'exit');
        fired = true;
      }
    });
  });

  if (fired) renderGeofenceFeed();
}

function pushGeofenceEvent(tech, siteId, kind) {
  const site = siteById(siteId);
  const now = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  geofenceEvents.unshift({
    tech,
    siteId,
    kind,
    siteName: site ? site.name : siteId,
    company: site ? site.company : '',
    time: now
  });
  if (geofenceEvents.length > 18) geofenceEvents.pop();
}

function renderGeofenceFeed() {
  const feed = $('#geofenceFeed');
  if (!feed) return;
  if (!geofenceEvents.length) {
    feed.innerHTML = '<p class="geo-empty">Teknisyenler harita üzerinde hareket ettikçe geofence giriş/çıkış olayları burada belirir.</p>';
    return;
  }
  feed.innerHTML = geofenceEvents.map((ev) => {
    const enter = ev.kind === 'enter';
    return `
      <div class="geo-event ${enter ? 'enter' : 'exit'}">
        <span class="geo-dot">${enter ? '↴' : '↳'}</span>
        <div class="geo-body">
          <b>${ev.tech} · ${enter ? 'GİRİŞ' : 'ÇIKIŞ'}</b>
          <small>${ev.company} — ${ev.siteName}</small>
        </div>
        <time>${ev.time}</time>
      </div>`;
  }).join('');
}

// Start / stop the live simulation. Idempotent — guards against stacking loops
// across re-renders, and re-sizes the (possibly hidden-at-init) map.
export function startFieldSimulation() {
  initMotion();
  ensureMap();
  renderGeofenceFeed();
  // The map is built once during the initial render() while #team is hidden
  // (zero size), which leaves fitBounds at a bogus zoom. Re-measure and re-frame
  // once the view is actually on screen.
  if (map) setTimeout(() => {
    map.invalidateSize();
    if (opBounds) map.fitBounds(opBounds, { padding: [42, 42] });
  }, 60);
  if (simTimer == null) {
    lastTs = 0;
    simTimer = setInterval(step, TICK_MS);
  }
  bindLiveNote();
  if (livePollTimer == null) {
    pollLivePositions();       // don't wait a full interval for the first fix
    livePollTimer = setInterval(pollLivePositions, LIVE_POLL_MS);
  }
}

export function stopFieldSimulation() {
  if (simTimer != null) { clearInterval(simTimer); simTimer = null; }
  if (livePollTimer != null) { clearInterval(livePollTimer); livePollTimer = null; }
}

// ---- route optimization (task 3-5) --------------------------------------
//
// Now measured in real driving distance (straight-line metres between the
// day's stops) rather than abstract canvas units.

function optimizeRoute(stopIds) {
  const remaining = [...stopIds];
  const order = [];
  let cur = [DEPOT.lat, DEPOT.lng];
  while (remaining.length) {
    let bestI = 0;
    let bestD = Infinity;
    remaining.forEach((id, i) => {
      const g = SITE_GEO[id];
      const d = haversine(cur, [g.lat, g.lng]);
      if (d < bestD) { bestD = d; bestI = i; }
    });
    const [next] = remaining.splice(bestI, 1);
    order.push(next);
    cur = [SITE_GEO[next].lat, SITE_GEO[next].lng];
  }
  return order;
}

// Total driving distance (metres) for an ordered stop list, depot → … → depot.
function routeDistance(order) {
  let total = 0;
  let cur = [DEPOT.lat, DEPOT.lng];
  order.forEach((id) => {
    const g = SITE_GEO[id];
    total += haversine(cur, [g.lat, g.lng]);
    cur = [g.lat, g.lng];
  });
  total += haversine(cur, [DEPOT.lat, DEPOT.lng]);
  return total;
}

// Straight-line metres → driving minutes. Metro traffic averages ~26 km/h door
// to door, and real roads add ~40% over the crow-flies distance, so ~1 minute
// per 360 straight-line metres reads as a believable İstanbul field day.
const routeMinutes = (order) => Math.round(routeDistance(order) / 360);
const routeKm = (order) => Math.round((routeDistance(order) * 1.4) / 1000);

// The day's stops, in seed order (the "naive" plan).
const DAY_STOPS = ['s1', 's2', 's3', 's4', 's5', 's6'];

function renderRouteOptimization() {
  const panel = $('#routeOptBody');
  if (!panel) return;

  const naive = DAY_STOPS;
  const optimized = optimizeRoute(DAY_STOPS);
  const naiveMin = routeMinutes(naive);
  const optMin = routeMinutes(optimized);
  const saved = naiveMin - optMin;
  const savedPct = naiveMin ? Math.round((saved / naiveMin) * 100) : 0;

  const shown = routeOptimized ? optimized : naive;
  const label = (id) => (siteById(id) || {}).company || id;

  const chips = ['depot', ...shown, 'depot'].map((id, i) => {
    const name = id === 'depot' ? 'Merkez' : label(id);
    return `<span class="route-chip ${id === 'depot' ? 'depot' : ''}">${i}. ${name}</span>`;
  }).join('<span class="route-arrow">→</span>');

  panel.innerHTML = `
    <div class="route-compare">
      <div class="route-metric ${routeOptimized ? '' : 'active'}">
        <span>Mevcut sıralama</span><strong>${naiveMin} dk</strong><small>${routeKm(naive)} km</small>
      </div>
      <div class="route-metric ${routeOptimized ? 'active' : ''}">
        <span>Optimize sıralama</span><strong>${optMin} dk</strong><small>${routeKm(optimized)} km</small>
      </div>
      <div class="route-metric saved">
        <span>Kazanç</span><strong>${saved} dk · %${savedPct}</strong>
      </div>
    </div>
    <p class="route-mode">${routeOptimized ? '✓ Optimize edilmiş en yakın-komşu rotası' : 'Sözleşme/giriş sırasına göre ham rota'}</p>
    <div class="route-chips">${chips}</div>`;

  drawRouteOverlay(routeOptimized ? optimized : naive);

  const btn = $('#btnRouteOptimize');
  if (btn) btn.textContent = routeOptimized ? '↺ Ham rotayı göster' : '⚡ Rotayı optimize et';
}

// Draw the current stop order as a polyline on the real map.
function drawRouteOverlay(order) {
  if (!map) return;
  if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
  const pts = ['depot', ...order, 'depot'].map((id) =>
    id === 'depot' ? [DEPOT.lat, DEPOT.lng] : [SITE_GEO[id].lat, SITE_GEO[id].lng]);
  routeLayer = L.polyline(pts, {
    color: routeOptimized ? '#138b67' : '#c2673a',
    weight: 3,
    opacity: 0.85,
    dashArray: routeOptimized ? null : '8 8',
    lineJoin: 'round'
  }).addTo(map);
}

// ---- technician credential cards (task 2-5) ----
//
// The credential registry and row markup moved to data/credentials.js (6-1) so
// the customer portal can render the same documents; see the KVKK note there.

function renderCredentials(tech) {
  const host = $('#techCredentials');
  if (!host) return;
  const initials = (techData[tech] || ['--'])[0];

  host.innerHTML = `
    <div class="cred-head">
      <span class="tech-avatar" style="background:${(techData[tech] || [])[5] || '#eee'}">${initials}</span>
      <div><b>${tech}</b><span>Belgeler müşteri portalında görüntülenebilir</span></div>
    </div>
    <div class="cred-docs">
      ${credentialDocs(tech)}
    </div>
    <p class="cred-kvkk">🔒 <b>KVKK bildirimi:</b> Bu kartlar demo amaçlı yer tutucu belgelerdir. Gerçek kimlik,
    SGK veya sağlık verisi içermez; kişisel tanımlayıcılar maskelenmiştir. Canlı sistemde belgeler yalnızca
    ilgili müşteriye ve yalnızca hizmet süresince gösterilir.</p>`;
}

// ---- productivity: travel vs on-site time & efficiency (task 4-2) ----
//
// Reads the seeded 12-month history through technicianStats() — real per-tech
// visit counts and on-site / travel minute totals — and turns them into the
// utilisation story: how much of each technician's working time is billable
// time on the customer's site versus unbillable "windshield" travel. The cost
// side of the same numbers lives in views/finance.js next to the margins.

const firstName = (name) => name.split(' ')[0];
const hours = (min) => Math.round(min / 60);
// Share of working time spent on-site rather than driving. Higher is better.
const utilisation = (t) => Math.round((t.onSiteMin / (t.onSiteMin + t.travelMin)) * 100);
const utilClass = (u) => (u >= 70 ? 'ok' : u >= 60 ? 'mid' : 'low');

function renderProductivity() {
  const body = $('#teamProductivityBody');
  if (!body) return;

  const stats = technicianStats();
  const totalOn = stats.reduce((s, t) => s + t.onSiteMin, 0);
  const totalTravel = stats.reduce((s, t) => s + t.travelMin, 0);
  const totalVisits = stats.reduce((s, t) => s + t.visits, 0);
  const teamUtil = totalOn + totalTravel ? Math.round((totalOn / (totalOn + totalTravel)) * 100) : 0;

  const pill = $('#teamUtilPill');
  if (pill) {
    pill.textContent = `Ekip verimliliği %${teamUtil}`;
    pill.className = `status-chip ${teamUtil >= 70 ? 'healthy' : teamUtil >= 60 ? 'warning' : 'blue'}`;
  }

  const rows = stats.map((t) => {
    const u = utilisation(t);
    const sel = t.tech === state.selectedTech ? ' selected' : '';
    return `
      <div class="prod-row${sel}" data-tech="${t.tech}">
        <div class="prod-row-head">
          <span class="tech-avatar" style="background:${(techData[t.tech] || [])[5] || '#eee'}">${(techData[t.tech] || ['--'])[0]}</span>
          <div class="prod-row-id"><b>${t.tech}</b><small>${t.visits} ziyaret · ort. saha ${t.avgOnSiteMin} dk · ort. yol ${t.avgTravelMin} dk</small></div>
          <span class="prod-util ${utilClass(u)}">%${u}</span>
        </div>
        <div class="prod-bar" title="Saha ${hours(t.onSiteMin)} sa · Yol ${hours(t.travelMin)} sa">
          <span class="prod-bar-on" style="width:${u}%"></span>
          <span class="prod-bar-travel" style="width:${100 - u}%"></span>
        </div>
      </div>`;
  }).join('');

  body.innerHTML = `
    <div class="prod-summary">
      <div class="prod-stat"><span>Ekip verimliliği</span><strong class="${teamUtil >= 70 ? 'good' : teamUtil >= 60 ? 'mid' : 'bad'}">%${teamUtil}</strong><small>saha / toplam mesai</small></div>
      <div class="prod-stat"><span>Toplam saha süresi</span><strong>${hours(totalOn)} sa</strong><small>faturalanabilir</small></div>
      <div class="prod-stat"><span>Toplam yol süresi</span><strong>${hours(totalTravel)} sa</strong><small>windshield / gayri-faturalı</small></div>
      <div class="prod-stat"><span>Toplam ziyaret</span><strong>${totalVisits}</strong><small>12 ay</small></div>
    </div>
    <div class="prod-chart-wrap"><div id="teamProductivityChart" class="prod-chart"></div></div>
    <div class="prod-legend"><span><i class="on"></i> Saha (faturalanabilir)</span><span><i class="travel"></i> Yol (windshield)</span></div>
    <div class="prod-rows">${rows}</div>`;

  mountChart('#teamProductivityChart', stackedBarChart({
    labels: stats.map((t) => firstName(t.tech)),
    series: [
      { name: 'Saha', values: stats.map((t) => hours(t.onSiteMin)), color: '#10b981' },
      { name: 'Yol', values: stats.map((t) => hours(t.travelMin)), color: '#f59e0b' }
    ],
    height: 220,
    legend: false,
    format: (n) => `${n} sa`
  }));
}

// ---- main view rendering ----

export function renderTeam(){
  const d=techData[state.selectedTech];
  const stats = technicianStats().find((t) => t.tech === state.selectedTech);
  const statLine = stats
    ? `${stats.visits} ziyaret · saha ort. ${stats.avgOnSiteMin} dk · yol ort. ${stats.avgTravelMin} dk`
    : '—';
  const stopNames = (TECH_STOPS[state.selectedTech] || [])
    .map((id) => (siteById(id) || {}).company || id).join(' → ');

  $('#techDetail').innerHTML=`
    <div class="tech-summary">
      <span class="tech-avatar" style="background:${d[5]}">${d[0]}</span>
      <div><b>${state.selectedTech}</b><span>${d[1]} · ${d[2]}</span></div>
    </div>
    <div class="tech-rows">
      <div><span>Mevcut durum</span><b>${d[1]}</b></div>
      <div><span>Servis doğrulaması</span><b>${d[3]}</b></div>
      <div><span>Son konum sinyali</span><b>${d[4]}</b></div>
      <div><span>Bugünkü rota</span><b>${stopNames || '—'}</b></div>
      <div><span>12 aylık saha özeti</span><b>${statLine}</b></div>
    </div>
    <button class="secondary-btn map-access" data-action="facilityMap">⌖ Tesis planını görüntüle</button>
    <p class="map-hint">Plan uygulama içinde çevrimiçi görüntülenir; teknisyen isterse offline kullanım için ayrıca indirebilir.</p>
  `;
  $('#roster').innerHTML=Object.entries(techData).map(([n,x])=>`
    <div class="roster-item" data-tech="${n}" style="cursor:pointer; background:${state.selectedTech===n?'#f0f4f8':''}">
      <span class="tech-avatar" style="background:${x[5]}">${x[0]}</span>
      <div><b>${n}</b><span>${x[1]} · ${x[2]}</span></div>
    </div>
  `).join('');

  renderCredentials(state.selectedTech);
  renderProductivity();
  startFieldSimulation();
  renderRouteOptimization();
  refreshTechMarkers();
}


export function teamRosterClicks(e) {
    // Route optimization before/after toggle (task 3-5).
    if (e.target.id === 'btnRouteOptimize') {
      routeOptimized = !routeOptimized;
      renderRouteOptimization();
      return true;
    }

    const tech=e.target.closest('[data-tech]');
    if(tech){
      state.selectedTech=tech.dataset.tech;
      save();
      refreshTechMarkers();
      renderTeam();
      return true;
    }

  return false;
}
