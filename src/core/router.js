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

export function render(){
  renderDashboard();
  renderSites();
  renderWork();
  renderTeam();
  renderInsights();
  renderReports();
  renderAiPredictions();
  renderInventory();
  renderFinance();
  renderVisitReports();
  renderCustomerHome();
  renderTechToday();
  setView(state.view);
  applyRoleAccess();
}

// Company Detail Page & Tabs Management
