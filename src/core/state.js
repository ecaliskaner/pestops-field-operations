// App state: load, persist, derived stats. Extracted from app.js (Phase 0a-2).

import { initial } from '../data/seed.js';

export function load(){
  try {
    const saved = window.__REPELLENT_STATE__ || JSON.parse(localStorage.getItem("repellent-ops"));
    if (!saved) return structuredClone(initial);
    // Detect stale data missing new fields and reset
    if (!saved.inventory || (saved.sites && saved.sites[0] && !saved.sites[0].chemicalsUsed)) {
      localStorage.removeItem("repellent-ops");
      return structuredClone(initial);
    }
    // Initialize recommendations and new arrays for all sites if missing
    saved.sites.forEach((s) => {
      if (!s.recommendations) {
        s.recommendations = [
          { id: "r1", desc: `${s.name} dış çevre kapı eşiğindeki conta yıpranmış, kemirgen geçişini önlemek için yenilenmeli.`, category: "BRCGS", assignee: "Tesis Bakım Departmanı", date: "10 Haz 2026", due: "25 Tem 2026", status: "open" },
          { id: "r2", desc: "Üretim holü sevkiyat rampası A-2 kapısına hava perdesi veya pvc şerit bariyer takılmalı.", category: "AIB", assignee: "Operasyon Yöneticisi", date: "05 Tem 2026", due: "10 Ağu 2026", status: "open" }
        ];
      }
      if (!s.chemicalsUsed) s.chemicalsUsed = [];
      if (s.serviceScope === undefined) s.serviceScope = null;
      if (s.contract === undefined) s.contract = null;
    });
    // Ensure all work orders have visitType
    if (saved.work) {
      saved.work.forEach(w => {
        if (!w.visitType) w.visitType = 'RZ';
      });
    }
    const merged = {...structuredClone(initial), ...saved};
    // Reconcile against the seed: it may have gained sites since this session
    // was persisted (e.g. new customer locations). Append any seed site the
    // saved portfolio is missing, so the demo picks them up without forcing a
    // manual localStorage reset. Existing (possibly edited) sites are untouched.
    const have = new Set((merged.sites || []).map((s) => s.id));
    for (const seedSite of initial.sites) {
      if (!have.has(seedSite.id)) merged.sites.push(structuredClone(seedSite));
    }

    // Backfill fields the seed has gained since this session was saved (e.g.
    // `address`). Only *missing* keys are filled, so anything the user edited in
    // the app is never overwritten — without this, a saved session keeps showing
    // gaps for data the seed already provides.
    const seedById = new Map(initial.sites.map((s) => [s.id, s]));
    for (const site of merged.sites) {
      const seedSite = seedById.get(site.id);
      if (!seedSite) continue;
      for (const [key, value] of Object.entries(seedSite)) {
        if (site[key] === undefined) site[key] = structuredClone(value);
      }
    }
    return merged;
  } catch { return structuredClone(initial); }
}

export const state = load();

/**
 * Every site in the live portfolio.
 *
 * `initial.sites` is the *frozen seed* the deterministic history generator is
 * calibrated against, and generation must keep reading it so the seeded numbers
 * never move. Everything else — planning, reports, rankings, lookups — must read
 * this instead, or a facility created through the UI is invisible to half the
 * product (it appeared in the sites list but had no plan, no report scope and no
 * ranking row).
 *
 * There is deliberately no fallback to the seed. It used to return
 * `initial.sites` whenever the live list was empty, which on a real account
 * with no facilities yet meant the seeded demo customers (Acme Foods, Kuzey
 * Lojistik...) leaked into the site ranking, the report scopes and the
 * insights charts. An empty portfolio is a real state and must render as one.
 */
export const allSites = () => state.sites || [];

// Sites the current user is allowed to see. A customer (client role) is scoped
// to their own company's locations only — the roadmap (§11) is explicit that a
// customer must never see another company's data. Admin and technician roles
// see the whole portfolio. This is the single source of truth for site
// visibility; insights and the sites list both defer to it.
export function visibleSites() {
  const u = state.currentUser;
  if (u && u.role === 'client' && u.company) {
    return allSites().filter((s) => s.company === u.company);
  }
  return allSites();
}

/**
 * Replace the seeded demo portfolio with real sites loaded from Supabase, in
 * place — every view holds `state.sites` by reference (visibleSites(),
 * allSites(), the sites/dashboard/team renderers), so mutating the existing
 * array's contents is what makes the swap visible everywhere without each
 * view needing to re-subscribe to anything.
 *
 * @param {object[]} sites
 */
export function replaceSites(sites) {
  state.sites.splice(0, state.sites.length, ...sites);
}

/**
 * Replace the demo work-order board with real orders loaded from Supabase, in
 * place — same reasoning as replaceSites() above: every view holds
 * `state.work` by reference.
 *
 * @param {object[]} work
 */
export function replaceWork(work) {
  state.work.splice(0, state.work.length, ...work);
}

// Real technicians loaded from Supabase for pickers outside the Ekip (team)
// page — see src/data/repo/technicians.js for why the team simulation itself
// is not wired here. The seed has no equivalent array, so this starts empty
// rather than being backfilled by load()'s seed-reconciliation logic.
if (!state.technicians) state.technicians = [];

// The real work_order_events audit trail behind the dashboard activity feed.
// Like `technicians` above, the seed has no equivalent — the feed used to be a
// hardcoded four-row array in views/dashboard.js.
if (!state.activity) state.activity = [];

/**
 * Replace the activity feed in place — same pattern as replaceSites().
 *
 * @param {object[]} events
 */
export function replaceActivity(events) {
  state.activity.splice(0, state.activity.length, ...events);
}

/**
 * Replace the real-technician list in place — same pattern as replaceSites().
 *
 * @param {object[]} technicians
 */
export function replaceTechnicians(technicians) {
  state.technicians.splice(0, state.technicians.length, ...technicians);
}

// Real stock and the org's licensed product list. The seed shipped five
// invented products; `chemicals` starts empty because a company's licensed
// range is its own, not a catalogue we can guess at.
if (!state.chemicals) state.chemicals = [];

/** Replace stock on hand in place — same pattern as replaceSites(). */
export function replaceInventory(items) {
  if (!state.inventory) state.inventory = [];
  state.inventory.splice(0, state.inventory.length, ...items);
}

/** Replace the licensed product list in place. */
export function replaceChemicals(chemicals) {
  state.chemicals.splice(0, state.chemicals.length, ...chemicals);
}

export function save(){
  localStorage.setItem("repellent-ops",JSON.stringify(state));
  const persistableState = structuredClone(state);
  delete persistableState.currentUser;
  // fetch only rejects on a network failure, so a 403 from the server lands in
  // the success branch. Checking res.ok is what stops a rejected write from
  // looking identical to a successful one — the browser copy above still holds
  // the data, but nothing reached the server.
  fetch("./api/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(persistableState)
  }).then((res) => {
    if (!res.ok) {
      console.warn(
        `[repellent] Sunucuya kayit reddedildi (HTTP ${res.status}). ` +
        'Veri yalnizca bu tarayicida tutuluyor. Gelistirme icin ALLOW_LEGACY_STATE_WRITE=1 gerekir.'
      );
    }
  }).catch(() => { /* offline — localStorage copy above is the fallback */ });
}

export function recalculateSiteStats(site) {
  if (!site.stations) site.stations = [];
  const total = site.stations.length;
  if (total === 0) return;
  const checked = site.stations.filter(s => s.checked).length;
  const activityCount = site.stations.filter(s => s.checked && s.status === 'activity').reduce((sum, s) => sum + (s.pestCount || 0), 0);
  const damagedCount = site.stations.filter(s => s.checked && (s.status === 'damaged' || s.status === 'missing')).length;
  
  site.issues = site.stations.filter(s => s.status === 'activity' || s.status === 'damaged' || s.status === 'missing').length;
  
  // Base score 100, drops by pest activity and physical damage
  let score = 100 - (activityCount * 8) - (damagedCount * 15);
  site.score = Math.max(10, Math.min(100, score));
  
  if (site.score >= 85) site.state = 'healthy';
  else if (site.score >= 70) site.state = 'watch';
  else site.state = 'risk';
}
