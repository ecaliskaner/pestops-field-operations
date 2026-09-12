// Extracted from app.js (Phase 0a-3).

import { $, $$, esc } from '../core/dom.js';
import { recalculateSiteStats, state } from '../core/state.js';

export function riskRows(){
  return state.work.filter(w => !w.completed).slice(0,3).map(w=>`
    <div class="risk-item" data-work-id="${esc(w.id)}" style="cursor:pointer;">
      <span class="risk-bar ${esc(w.priority)}"></span>
      <div><b>${esc(w.title)}</b><small>${esc(w.site)}</small></div>
      <p class="risk-desc">${esc(String(w.description || '').slice(0,67))}…</p>
      <div><span class="status-chip ${esc(w.priority)}">${esc(w.type)}</span><small>${esc(w.due)}</small></div>
    </div>
  `).join('') || '<p class="empty">Açık iş emri bulunmuyor.</p>';
}

// ---- range control (Bugün / Bu hafta / Bu ay) ----
//
// This used to widen a window over the seeded 12-month demo history. It now
// filters the org's real completed work orders by their actual completion
// timestamp, so the number a customer sees is one they can reconcile against
// their own job list.
const RANGE_DAYS = { today: 1, week: 7, month: 30 };
let currentRange = 'today'; // module-local; never persisted, same pattern as team.js routeOptimized

// Start of the trailing window, anchored to local midnight so "Bugün" means
// today's calendar day rather than the last 24 hours.
function rangeStart(days) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start;
}

function completedInRange(days) {
  const from = rangeStart(days);
  return state.work.filter((w) => {
    if (!w.completed) return false;
    // A work order completed through the office button has no real
    // completed_at yet; counting it in every window would inflate the metric,
    // so it only counts once the database records when it happened.
    if (!w.completedAt) return false;
    return new Date(w.completedAt) >= from;
  });
}

export function renderDashboard(range){
  if (range) currentRange = range;
  $$('.range-control button[data-range]').forEach(b => b.classList.toggle('active', b.dataset.range === currentRange));

  // Recalculate all sites stats to ensure dashboard represents fresh data
  state.sites.forEach(recalculateSiteStats);

  // Identity + headline counters. These lived as literals in index.html
  // ("Apex Operations", "12 müşteri · 34 tesis", "Aktif tesis 34",
  // "Sahadaki teknisyen 11/14", "13 TEMMUZ 2026") — numbers no real account
  // could reconcile. They now read the signed-in org's own data.
  const orgName = state.currentUser?.orgName || state.currentUser?.company || 'Repellent';
  const customerCount = new Set(state.sites.map(s => s.company).filter(Boolean)).size;
  const setText = (sel, value) => { const el = $(sel); if (el) el.textContent = value; };

  setText('#workspaceName', orgName);
  setText('#orgCrumb', orgName);
  setText('#workspaceMeta', `${customerCount} müşteri · ${state.sites.length} tesis`);
  setText('#activeSitesMetric', state.sites.length);
  setText('#fieldTechMetric', state.technicians.length);
  setText('#dashDate', `${new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).toLocaleUpperCase('tr')} · OPERASYON ÖZETİ`);

  $('#riskList').innerHTML=riskRows();
  $('#criticalMetric').textContent=state.sites.reduce((n,s)=>n+s.issues,0);

  const days = RANGE_DAYS[currentRange] || 1;
  const completedCount = completedInRange(days).length;
  $('#completedMetric').textContent = completedCount;
  const workComp = $('#workCompleted');
  if (workComp) workComp.textContent = completedCount;

  // The activity feed is the real work_order_events audit trail (loaded in
  // core/auth.js). It replaced a hardcoded four-row demo list — a customer
  // must never see fabricated events attributed to their own sites.
  $('#activityFeed').innerHTML = state.activity.map(ev => `
    <div class="activity-item" data-site-id="${esc(ev.siteId)}" style="cursor:pointer;">
      <span class="feed-icon ${esc(ev.kind)}">${esc(ev.icon)}</span>
      <div><b>${esc(ev.title)}${ev.tech ? ` — ${esc(ev.tech)}` : ''}</b><p>${esc(ev.where)}</p></div>
      <time>${esc(ev.time)}</time>
    </div>
  `).join('') || '<p class="empty">Henüz saha hareketi kaydedilmedi. Teknisyenler mobil uygulamadan ziyarete başladıkça buraya düşecek.</p>';

  // Today's schedule: the org's own open work orders due today, earliest
  // first — previously three hardcoded rows naming customers that do not
  // exist in this account.
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const scheduled = state.work
    .filter(w => !w.completed && w.dueAt && new Date(w.dueAt) >= todayStart && new Date(w.dueAt) <= todayEnd)
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))
    .slice(0, 5);

  $('#scheduleList').innerHTML = scheduled.map(w => {
    const [company, siteName] = String(w.site).split(' · ');
    const time = new Date(w.dueAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const avatar = String(w.tech || '')
      .split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toLocaleUpperCase('tr')).join('') || '—';
    return `
    <div class="schedule-item" data-site-id="${esc(w.siteId)}" style="cursor:pointer;">
      <span class="schedule-time">${esc(time)}</span>
      <div><b>${esc(company || '')}</b><p>${esc(siteName || '')}</p></div>
      <span class="schedule-avatar" title="${esc(w.tech)}">${esc(avatar)}</span>
    </div>`;
  }).join('') || '<p class="empty">Bugün için planlanmış ziyaret yok.</p>';

  // Update Portfolio donut score dynamically. A brand-new account has zero
  // sites, and dividing by that produced a literal "NaN" on the first screen
  // the customer ever sees — the empty portfolio renders as a neutral, empty
  // ring with a dash instead.
  const totalSites = state.sites.length;
  const avgScore = totalSites
    ? Math.round(state.sites.reduce((sum, s) => sum + s.score, 0) / totalSites)
    : null;
  const healthyCount = state.sites.filter(s => s.state === 'healthy').length;
  const watchCount = state.sites.filter(s => s.state === 'watch').length;
  const riskCount = state.sites.filter(s => s.state === 'risk').length;

  const scoreEl = $('#portfolioScore');
  if (scoreEl) scoreEl.textContent = avgScore === null ? '—' : avgScore;

  const donut = $('.donut');
  if (donut) {
    if (!totalSites) {
      donut.style.background = 'conic-gradient(var(--line) 0deg 360deg)';
    } else {
      const hDeg = Math.round((healthyCount / totalSites) * 360);
      const wDeg = Math.round(((healthyCount + watchCount) / totalSites) * 360);
      donut.style.background = `conic-gradient(var(--green) 0deg ${hDeg}deg, #f0bd4a ${hDeg}deg ${wDeg}deg, #e05a54 ${wDeg}deg 360deg)`;
    }
  }

  const legend = $('.score-legend');
  if (legend) {
    legend.innerHTML = `
      <p><i class="legend-dot good"></i><b>${esc(healthyCount)}</b> Sağlıklı</p>
      <p><i class="legend-dot watch"></i><b>${esc(watchCount)}</b> İzlenmeli</p>
      <p><i class="legend-dot risk"></i><b>${esc(riskCount)}</b> Riskli</p>
    `;
  }
}

export function dashboardRangeClicks(e) {
  const btn = e.target.closest('.range-control button[data-range]');
  if (!btn) return false;
  renderDashboard(btn.dataset.range);
  return true;
}
