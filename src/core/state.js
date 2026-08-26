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
    return {...structuredClone(initial),...saved};
  } catch { return structuredClone(initial); }
}

export const state = load();

export function save(){
  localStorage.setItem("repellent-ops",JSON.stringify(state));
  const persistableState = structuredClone(state);
  delete persistableState.currentUser;
  fetch("./api/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(persistableState)
  }).catch(() => {});
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
