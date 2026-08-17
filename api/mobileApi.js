// Mobile REST API for the Flutter technician app.
//
// A single exported handler, handleMobileApi(req, res), that owns every
// /api/mobile/* route. server.js calls it first; if it returns true the
// request is fully handled, otherwise the static file server takes over.
//
// State is in-memory and seeded from api/mobileData.js. This is a pitch demo:
// restarting the server (or POST /api/mobile/reset) restores a pristine seed.
// The one production-shaped guarantee kept here is idempotent sync — every
// offline event carries a mobileEventId and is written at most once, so a
// flaky-network retry never double-records a QR scan or a form.

'use strict';

const data = require('./mobileData');

// ---- in-memory store -------------------------------------------------------

let store = seed();

function seed() {
  return {
    // work-order runtime state keyed by id
    workOrders: data.workOrders.map(w => ({
      id: w.id,
      status: 'scheduled',        // scheduled → on_the_way → arrived_gps → started_by_first_qr → in_progress → completed
      departedAt: null,
      arrivedGpsAt: null,
      realWorkStartedAt: null,    // set by the FIRST qr scan — the audit-grade start time
      completedAt: null,
    })),
    inspections: [],              // { id, workOrderId, stationCode, status, pestType, activityCount, notes, scannedAt, mobileEventId }
    events: [],                   // work_order_logs equivalent (departed, arrived_gps, first_qr_scanned, ...)
    seenEventIds: new Set(),      // idempotency guard for mobileEventId
  };
}

function woState(id) {
  return store.workOrders.find(w => w.id === id);
}
function woSeed(id) {
  return data.workOrders.find(w => w.id === id);
}

// ---- helpers ---------------------------------------------------------------

function nowIso() { return new Date().toISOString(); }

// Great-circle distance in metres (Haversine).
function distanceM(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some(v => typeof v !== 'number' || Number.isNaN(v))) return null;
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function logEvent(workOrderId, eventType, extra = {}) {
  const ev = { id: `EV-${store.events.length + 1}`, workOrderId, eventType, eventTime: nowIso(), ...extra };
  store.events.push(ev);
  return ev;
}

// Public shape of a work order: seed + runtime + the site (with stations and
// their QR tokens) the technician needs to do the job offline.
function serializeWorkOrder(id) {
  const s = woSeed(id);
  const rt = woState(id);
  if (!s || !rt) return null;
  const site = data.sites.find(x => x.id === s.siteId);
  return {
    id: s.id,
    title: s.title,
    priority: s.priority,
    visitType: s.visitType,
    dueAt: s.dueAt,
    description: s.description,
    status: rt.status,
    departedAt: rt.departedAt,
    arrivedGpsAt: rt.arrivedGpsAt,
    realWorkStartedAt: rt.realWorkStartedAt,
    completedAt: rt.completedAt,
    site: {
      id: site.id,
      company: site.company,
      name: site.name,
      city: site.city,
      sector: site.sector,
      address: site.address,
      lat: site.lat,
      lng: site.lng,
      geofenceRadiusM: site.geofenceRadiusM,
      contact: site.contact,
      stations: site.stations.map(st => ({
        code: st.code,
        type: st.type,
        pestType: st.pestType,
        qrToken: data.qrTokenFor(site.id, st.code),
      })),
    },
    inspections: store.inspections.filter(i => i.workOrderId === id)
      .map(i => ({ stationCode: i.stationCode, status: i.status, pestType: i.pestType, activityCount: i.activityCount, scannedAt: i.scannedAt })),
  };
}

function routeForTech(email) {
  return data.workOrders.filter(w => w.techEmail === email).map(w => serializeWorkOrder(w.id));
}

// Latest real GPS fix per technician, derived from the arrival events the
// phones reported. Keyed by technician *name* because that is what the ops
// dashboard's field map uses to identify its markers.
function livePositions() {
  const byTech = new Map();
  for (const ev of store.events) {
    if (!ev.location) continue;
    const lat = Number(ev.location.lat);
    const lng = Number(ev.location.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const w = woSeed(ev.workOrderId);
    if (!w) continue;
    const tech = data.technicians.find(t => t.email === w.techEmail);
    if (!tech) continue;
    const site = data.sites.find(x => x.id === w.siteId);
    const dist = typeof ev.distanceM === 'number' ? ev.distanceM : null;
    const radiusM = site ? site.geofenceRadiusM : null;
    // events are appended chronologically, so a later fix simply replaces.
    byTech.set(tech.name, {
      techName: tech.name,
      techEmail: tech.email,
      lat,
      lng,
      at: ev.eventTime,
      workOrderId: ev.workOrderId,
      siteId: w.siteId,
      siteName: site ? site.name : null,
      siteCompany: site ? site.company : null,
      distanceM: dist,
      radiusM,
      // null = unknown (an offline record synced without a distance). The
      // dashboard only raises a mismatch on an explicit false.
      insideGeofence: (dist != null && radiusM != null) ? dist <= radiusM : null,
    });
  }
  return Array.from(byTech.values());
}

// ---- request plumbing ------------------------------------------------------

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    // The Flutter app runs from a different origin (device / web build), so the
    // demo API is intentionally open. Not production posture.
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch { resolve(null); }
    });
  });
}

// Bearer token is just the technician email in this demo (base64 for looks).
function techFromAuth(req) {
  const h = req.headers['authorization'] || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  let email;
  try { email = Buffer.from(m[1], 'base64').toString('utf8'); } catch { return null; }
  return data.technicians.find(t => t.email === email) || null;
}

// ---- the handler -----------------------------------------------------------

async function handleMobileApi(req, res) {
  const url = (req.url || '').split('?')[0];
  if (!url.startsWith('/api/mobile')) return false;

  // CORS preflight
  if (req.method === 'OPTIONS') { sendJson(res, 204, {}); return true; }

  const route = url.replace(/^\/api\/mobile/, '') || '/';

  // ---- auth: login ----
  if (route === '/auth/login' && req.method === 'POST') {
    const body = await readBody(req);
    if (!body) return (sendJson(res, 400, { error: 'invalid_json' }), true);
    const tech = data.technicians.find(t => t.email === String(body.email || '').toLowerCase().trim());
    // Demo auth: known email + any non-empty password (or the shared demo pin).
    if (!tech || !String(body.password || '').length) {
      sendJson(res, 401, { error: 'invalid_credentials' });
      return true;
    }
    const token = Buffer.from(tech.email, 'utf8').toString('base64');
    sendJson(res, 200, { token, technician: tech });
    return true;
  }

  // ---- reset (demo convenience) ----
  if (route === '/reset' && req.method === 'POST') {
    store = seed();
    sendJson(res, 200, { ok: true, resetAt: nowIso() });
    return true;
  }

  // ---- live technician positions (read-only, for the ops dashboard) ----
  // Deliberately above the auth gate: the dashboard is a separate app with no
  // mobile token. It exposes nothing the phone did not already report.
  if (route === '/live-positions' && req.method === 'GET') {
    sendJson(res, 200, { serverTime: nowIso(), positions: livePositions() });
    return true;
  }

  // Everything below requires a token.
  const tech = techFromAuth(req);
  if (!tech) { sendJson(res, 401, { error: 'unauthorized' }); return true; }

  // ---- bootstrap: full day snapshot for offline-first sync ----
  if (route === '/bootstrap' && req.method === 'GET') {
    sendJson(res, 200, {
      technician: tech,
      serverTime: nowIso(),
      inspectionForm: data.inspectionForm,
      route: routeForTech(tech.email),
    });
    return true;
  }

  // ---- today route ----
  if (route === '/today-route' && req.method === 'GET') {
    sendJson(res, 200, { route: routeForTech(tech.email) });
    return true;
  }

  // ---- depart: "yola çıktım" ----
  let m;
  if ((m = route.match(/^\/work-orders\/([^/]+)\/depart$/)) && req.method === 'POST') {
    const rt = woState(m[1]);
    if (!rt) return (sendJson(res, 404, { error: 'not_found' }), true);
    if (rt.status === 'scheduled') { rt.status = 'on_the_way'; rt.departedAt = nowIso(); }
    logEvent(m[1], 'departed');
    sendJson(res, 200, { workOrder: serializeWorkOrder(m[1]) });
    return true;
  }

  // ---- arrive: GPS-verified arrival (NOT work start) ----
  if ((m = route.match(/^\/work-orders\/([^/]+)\/arrive$/)) && req.method === 'POST') {
    const body = await readBody(req);
    if (!body) return (sendJson(res, 400, { error: 'invalid_json' }), true);
    const rt = woState(m[1]);
    const s = woSeed(m[1]);
    if (!rt || !s) return (sendJson(res, 404, { error: 'not_found' }), true);
    const site = data.sites.find(x => x.id === s.siteId);
    const dist = distanceM(Number(body.lat), Number(body.lng), site.lat, site.lng);
    const insideGeofence = dist != null && dist <= site.geofenceRadiusM;
    if (rt.status === 'scheduled' || rt.status === 'on_the_way') {
      rt.status = 'arrived_gps';
      rt.arrivedGpsAt = nowIso();
    }
    if (insideGeofence) {
      logEvent(m[1], 'entered_geofence', { location: { lat: body.lat, lng: body.lng } });
    } else {
      // Arrival was reported from outside the geofence. The status still moves
      // to arrived_gps (the technician said they are there), but the
      // discrepancy is recorded so the office can challenge it — this is the
      // audit trail that makes a false "vardım" tap visible.
      logEvent(m[1], 'gps_mismatch', {
        location: { lat: body.lat, lng: body.lng },
        distanceM: dist,
        radiusM: site.geofenceRadiusM,
      });
    }
    logEvent(m[1], 'arrived_gps', { location: { lat: body.lat, lng: body.lng }, distanceM: dist });
    sendJson(res, 200, {
      workOrder: serializeWorkOrder(m[1]),
      geofence: { insideGeofence, distanceM: dist, radiusM: site.geofenceRadiusM },
      // The whole point of the product: arrival is not work start.
      message: 'GPS konumu doğrulandı. İş henüz gerçek olarak başlamadı — ilk QR bekleniyor.',
    });
    return true;
  }

  // ---- QR scan: first scan is the audit-grade real work start ----
  if (route === '/qr/scan' && req.method === 'POST') {
    const body = await readBody(req);
    if (!body) return (sendJson(res, 400, { error: 'invalid_json' }), true);
    const rt = woState(body.workOrderId);
    const s = woSeed(body.workOrderId);
    if (!rt || !s) return (sendJson(res, 404, { error: 'not_found' }), true);
    const site = data.sites.find(x => x.id === s.siteId);
    const raw = String(body.code || '').trim();
    // Accept either the full QR token or a bare station code typed manually.
    const station = site.stations.find(st =>
      data.qrTokenFor(site.id, st.code) === raw || st.code.toLowerCase() === raw.toLowerCase());
    if (!station) {
      sendJson(res, 422, { error: 'unknown_qr', message: 'Bu QR bu iş emrine ait bir istasyonla eşleşmiyor.' });
      return true;
    }
    const isFirst = !rt.realWorkStartedAt;
    if (isFirst) {
      rt.realWorkStartedAt = nowIso();
      rt.status = 'started_by_first_qr';
      logEvent(body.workOrderId, 'first_qr_scanned', { stationCode: station.code });
    } else {
      if (rt.status === 'started_by_first_qr') rt.status = 'in_progress';
      logEvent(body.workOrderId, 'station_qr_scanned', { stationCode: station.code });
    }
    sendJson(res, 200, {
      stationCode: station.code,
      stationType: station.type,
      isFirstScan: isFirst,
      realWorkStartedAt: rt.realWorkStartedAt,
      workOrder: serializeWorkOrder(body.workOrderId),
      message: isFirst
        ? 'Gerçek iş başlangıcı kaydedildi ✓'
        : `${station.code} istasyonu tarandı.`,
    });
    return true;
  }

  // ---- inspection (single, idempotent) ----
  if (route === '/inspections' && req.method === 'POST') {
    const body = await readBody(req);
    if (!body) return (sendJson(res, 400, { error: 'invalid_json' }), true);
    const result = applyInspection(body);
    if (result.error) return (sendJson(res, result.status || 400, result), true);
    sendJson(res, 200, { inspection: result.inspection, workOrder: serializeWorkOrder(body.workOrderId), deduped: result.deduped });
    return true;
  }

  // ---- complete visit ----
  if ((m = route.match(/^\/work-orders\/([^/]+)\/complete$/)) && req.method === 'POST') {
    const rt = woState(m[1]);
    if (!rt) return (sendJson(res, 404, { error: 'not_found' }), true);
    if (!rt.realWorkStartedAt) {
      sendJson(res, 409, { error: 'not_started', message: 'İş tamamlanamaz — ilk QR henüz okutulmadı.' });
      return true;
    }
    rt.status = 'completed';
    rt.completedAt = nowIso();
    logEvent(m[1], 'completed');
    sendJson(res, 200, { workOrder: serializeWorkOrder(m[1]) });
    return true;
  }

  // ---- batch sync: drain the mobile outbox, idempotently ----
  if (route === '/sync' && req.method === 'POST') {
    const body = await readBody(req);
    if (!body || !Array.isArray(body.events)) return (sendJson(res, 400, { error: 'invalid_body' }), true);
    const results = body.events.map(processSyncEvent);
    sendJson(res, 200, {
      accepted: results.filter(r => r.ok).length,
      results,
      route: routeForTech(tech.email),
    });
    return true;
  }

  // ---- audit timeline for a work order (for the admin/demo story) ----
  if ((m = route.match(/^\/work-orders\/([^/]+)\/timeline$/)) && req.method === 'GET') {
    sendJson(res, 200, { events: store.events.filter(e => e.workOrderId === m[1]) });
    return true;
  }

  sendJson(res, 404, { error: 'no_such_route', route });
  return true;
}

// ---- inspection + sync internals ------------------------------------------

function applyInspection(body) {
  const rt = woState(body.workOrderId);
  const s = woSeed(body.workOrderId);
  if (!rt || !s) return { error: 'not_found', status: 404 };
  // Idempotency: a retried offline record must not write twice.
  if (body.mobileEventId && store.seenEventIds.has(body.mobileEventId)) {
    const existing = store.inspections.find(i => i.mobileEventId === body.mobileEventId);
    return { deduped: true, inspection: existing };
  }
  const insp = {
    id: `INSP-${store.inspections.length + 1}`,
    workOrderId: body.workOrderId,
    stationCode: String(body.stationCode || ''),
    status: String(body.status || 'clean'),
    pestType: String(body.pestType || 'none'),
    activityCount: Number(body.activityCount || 0),
    notes: String(body.notes || ''),
    photoCount: Number(body.photoCount || 0),
    scannedAt: body.scannedAt || nowIso(),   // preserve original capture time from offline records
    mobileEventId: body.mobileEventId || null,
  };
  store.inspections.push(insp);
  if (body.mobileEventId) store.seenEventIds.add(body.mobileEventId);
  if (rt.status === 'started_by_first_qr') rt.status = 'in_progress';
  logEvent(body.workOrderId, 'inspection_saved', { stationCode: insp.stationCode, status: insp.status });
  return { inspection: insp, deduped: false };
}

// One offline outbox entry → its real side effect. Everything is keyed on
// mobileEventId so replays are safe.
function processSyncEvent(ev) {
  const id = ev.mobileEventId;
  if (id && store.seenEventIds.has(id)) return { mobileEventId: id, ok: true, deduped: true };
  try {
    switch (ev.type) {
      case 'inspection': {
        // The outbox entry carries the idempotency id; thread it into the
        // payload so applyInspection's dedup and the event guard agree.
        const payload = { ...(ev.payload || {}), mobileEventId: id, scannedAt: ev.capturedAt || (ev.payload && ev.payload.scannedAt) };
        const r = applyInspection(payload);
        if (r.error) return { mobileEventId: id, ok: false, error: r.error };
        return { mobileEventId: id, ok: true, deduped: !!r.deduped };
      }
      case 'qr_scan': {
        const p = ev.payload || {};
        const rt = woState(p.workOrderId);
        if (rt && !rt.realWorkStartedAt) {
          rt.realWorkStartedAt = ev.capturedAt || nowIso();
          rt.status = 'started_by_first_qr';
          logEvent(p.workOrderId, 'first_qr_scanned', { stationCode: p.stationCode, offline: true });
        } else if (rt) {
          logEvent(p.workOrderId, 'station_qr_scanned', { stationCode: p.stationCode, offline: true });
        }
        if (id) store.seenEventIds.add(id);
        return { mobileEventId: id, ok: true };
      }
      case 'arrive': {
        const p = ev.payload || {};
        const rt = woState(p.workOrderId);
        if (rt && (rt.status === 'scheduled' || rt.status === 'on_the_way')) {
          rt.status = 'arrived_gps';
          rt.arrivedGpsAt = ev.capturedAt || nowIso();
        }
        // Keep the coordinates captured offline — the dashboard's live map
        // reads positions back out of the event log, so dropping them here
        // would make a synced arrival invisible on the map.
        const extra = { offline: true };
        const lat = Number(p.lat);
        const lng = Number(p.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) extra.location = { lat, lng };
        logEvent(p.workOrderId, 'arrived_gps', extra);
        if (id) store.seenEventIds.add(id);
        return { mobileEventId: id, ok: true };
      }
      default:
        return { mobileEventId: id, ok: false, error: 'unknown_type' };
    }
  } catch (e) {
    return { mobileEventId: id, ok: false, error: 'exception' };
  }
}

module.exports = { handleMobileApi };
