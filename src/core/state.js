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
 * Falls back to the seed if state is somehow empty, so a lookup never returns
 * an empty portfolio.
 */
export const allSites = () => (state.sites && state.sites.length ? state.sites : initial.sites);

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
