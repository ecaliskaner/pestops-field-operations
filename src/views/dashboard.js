// Extracted from app.js (Phase 0a-3).

import { $, $$, esc } from '../core/dom.js';
import { recalculateSiteStats, state } from '../core/state.js';
import { getVisits } from '../data/history.js';

export function riskRows(){
  return state.work.filter(w => !w.completed).slice(0,3).map(w=>`
    <div class="risk-item" data-work-id="${w.id}" style="cursor:pointer;">
      <span class="risk-bar ${w.priority}"></span>
      <div><b>${w.title}</b><small>${w.site}</small></div>
      <p class="risk-desc">${w.description.slice(0,67)}…</p>
      <div><span class="status-chip ${w.priority}">${w.type}</span><small>${w.due}</small></div>
    </div>
  `).join('');
}

// ---- range control (Bugün / Bu hafta / Bu ay) ----
//
// The seeded history's window ends on the in-universe "today" (12 Tem 2026,
// the last generated day of the last month — see data/history.js). Widening
// the range pulls in more of that same real, deterministic visit history
// instead of inventing a second data source, so the numbers stay consistent
// with every other view that reads getVisits().
const RANGE_DAYS = { today: 1, week: 7, month: 30 };
let currentRange = 'today'; // module-local; never persisted, same pattern as team.js routeOptimized

function visitTypeIcon(v) {
  if (v.visitType === 'AC') return ['alert', '!'];
  if (v.recommendationsRaised.length) return ['alert', '!'];
  return ['done', '✓'];
}

// Real completed visits within the trailing window, newest first — used to
// both widen the activity feed and scale the completed-service metric when a
// wider range is selected.
function recentVisits(days) {
  const visits = getVisits();
  const lastMonthIndex = Math.max(...visits.map(v => v.monthIndex));
  const lastDay = Math.max(...visits.filter(v => v.monthIndex === lastMonthIndex).map(v => v.day));
  return visits
    .filter(v => v.monthIndex === lastMonthIndex && v.day > lastDay - days)
    .sort((a, b) => b.day - a.day)
    .slice(0, 8);
}

export function renderDashboard(range){
  if (range) currentRange = range;
  $$('.range-control button[data-range]').forEach(b => b.classList.toggle('active', b.dataset.range === currentRange));

  // Recalculate all sites stats to ensure dashboard represents fresh data
  state.sites.forEach(recalculateSiteStats);

  $('#riskList').innerHTML=riskRows();
  $('#criticalMetric').textContent=state.sites.reduce((n,s)=>n+s.issues,0);

  const days = RANGE_DAYS[currentRange] || 1;
  const historic = currentRange === 'today' ? [] : recentVisits(days);
  $('#completedMetric').textContent = state.completed + historic.length;
  const workComp = $('#workCompleted');
  if (workComp) workComp.textContent = state.completed + historic.length;

  const curated = [
    ['done','✓','Servis raporu onaylandı','Novatek · Çayırova Ar-Ge Merkezi','10:42', 's5'],
    ['alert','!','Kritik aktivite kaydedildi','Acme Foods · R-12 istasyonu','10:18', 's1'],
    ['','⌖','Teknisyen tesise ulaştı','Ayşe Demir · Gebze Üretim Tesisi','10:05', 's1'],
    ['','↗','Müşteri raporu paylaşıldı','Orion Hotels · Taksim Otel','09:48', 's6']
  ];
  const historicRows = historic.map(v => {
    const [kind, icon] = visitTypeIcon(v);
    return [kind, icon, `Ziyaret tamamlandı — ${v.tech}`, `${v.company} · ${v.siteName}`, v.date, v.siteId];
  });

  $('#activityFeed').innerHTML=[...curated, ...historicRows].map(x=>`
    <div class="activity-item" data-site-id="${x[5]}" style="cursor:pointer;">
      <span class="feed-icon ${x[0]}">${x[1]}</span>
      <div><b>${x[2]}</b><p>${x[3]}</p></div>
      <time>${x[4]}</time>
    </div>
  `).join('');

  $('#scheduleList').innerHTML=[
    ['14:30','Acme Foods','Gebze Üretim Tesisi','AD', 's1'],
    ['16:00','Kuzey Lojistik','Hadımköy DM','MK', 's2'],
    ['17:15','Orion Hotels','Taksim Otel','EY', 's6']
  ].map(x=>`
    <div class="schedule-item" data-site-id="${x[4]}" style="cursor:pointer;">
      <span class="schedule-time">${x[0]}</span>
      <div><b>${x[1]}</b><p>${x[2]}</p></div>
      <span class="schedule-avatar">${x[3]}</span>
    </div>
  `).join('');

  // Update Portfolio donut score dynamically
  const avgScore = Math.round(state.sites.reduce((sum, s) => sum + s.score, 0) / state.sites.length);
  const healthyCount = state.sites.filter(s => s.state === 'healthy').length;
  const watchCount = state.sites.filter(s => s.state === 'watch').length;
  const riskCount = state.sites.filter(s => s.state === 'risk').length;

  const scoreEl = $('#portfolioScore');
  if (scoreEl) scoreEl.textContent = avgScore;
  
  const donut = $('.donut');
  if (donut) {
    const totalSites = state.sites.length;
    const hDeg = Math.round((healthyCount / totalSites) * 360);
    const wDeg = Math.round(((healthyCount + watchCount) / totalSites) * 360);
    donut.style.background = `conic-gradient(var(--green) 0deg ${hDeg}deg, #f0bd4a ${hDeg}deg ${wDeg}deg, #e05a54 ${wDeg}deg 360deg)`;
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
