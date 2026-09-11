// View routing and the top-level render pass.
// Extracted from app.js (Phase 0a-3).

import { $, $$ } from '../core/dom.js';
import { save, state } from '../core/state.js';
import { names } from '../data/catalog.js';
import { applyRoleAccess } from '../core/roles.js';
import { renderDashboard } from '../views/dashboard.js';
import { renderSites } from '../views/sites.js';
import { renderWork } from '../views/work.js';
import { renderTeam, startFieldTracking, stopFieldTracking } from '../views/team.js';
import { renderAiPredictions, renderInsights } from '../views/insights.js';
import { renderReports } from '../views/reports.js';
import { renderInventory } from '../views/inventory.js';
import { renderFinance } from '../views/finance.js';
import { renderVisitReports } from '../views/visitReports.js';
import { renderCustomerHome } from '../views/customerHome.js';
import { renderTechToday } from '../views/techToday.js';

export function setView(view){
  state.view=view;
  save();
  $$('.view').forEach(x=>x.classList.toggle('active',x.id===view));
  $$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.view===view));
  $('#pageCrumb').textContent=names[view] || "Genel bakış";
  window.scrollTo({top:0,behavior:'smooth'});
  
  if (view === 'sites') {
    renderSites();
  } else if (view === 'work') {
    renderWork();
    renderTechToday();
  } else if (view === 'inventory') {
    renderInventory();
  } else if (view === 'finance') {
    renderFinance();
  } else if (view === 'visitReports') {
    renderVisitReports();
  } else if (view === 'customerHome') {
    renderCustomerHome();
  } else if (view === 'insights') {
    // Re-render on entry so the charts mount into the now-visible container and
    // re-scope to the current user (a customer sees only their own locations).
    renderInsights();
    renderAiPredictions();
  } else if (view === 'team') {
    // The map is built once during the initial render() while #team is hidden
    // (zero size). Re-entering the view must re-measure it, or the tiles render
    // grey. startFieldTracking() is idempotent and calls invalidateSize().
    startFieldTracking();
  } else {
    // Leaving Ekip stops the live_positions() poll. Without this it keeps
    // querying every 15 seconds for the rest of the session while nobody is
    // looking at the map.
    stopFieldTracking();
  }
}

// One panel must never be able to take the application down with it.
//
// render() paints every view in turn, so an exception in any one of them used
// to abort the whole pass: the screens after it never painted and the shell
// was left half-drawn and unresponsive. That is exactly what a real account
// hit on its first load — an empty site list made renderWork() throw, and the
// app froze on a partly-rendered dashboard.
//
// Each panel is now isolated. A failure is logged loudly (it is still a bug to
// fix, not something to swallow quietly) but the rest of the app still paints.
function paint(name, fn) {
  try {
    fn();
  } catch (err) {
    console.error(`[repellent] ${name} cizilemedi`, err);
  }
}

export function render(){
  paint('dashboard', renderDashboard);
  paint('sites', renderSites);
  paint('work', renderWork);
  paint('team', renderTeam);
  paint('insights', renderInsights);
  paint('reports', renderReports);
  paint('aiPredictions', renderAiPredictions);
  paint('inventory', renderInventory);
  paint('finance', renderFinance);
  paint('visitReports', renderVisitReports);
  paint('customerHome', renderCustomerHome);
  paint('techToday', renderTechToday);
  paint('view', () => setView(state.view));
  paint('roleAccess', applyRoleAccess);
}

// Company Detail Page & Tabs Management
