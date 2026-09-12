// Role-based access gating and session check.
// Extracted from app.js (Phase 0a-3).

import { $, $$, toast, esc } from '../core/dom.js';
import { state } from '../core/state.js';
import { ui } from '../core/session.js';
import { setView } from '../core/router.js';
import { showCompanyDetail } from '../views/companyDetail.js';
import { renderCustomerHome } from '../views/customerHome.js';

export function applyRoleAccess() {
  if (!state.currentUser) return;
  
  const role = state.currentUser.role;
  const appShell = $('.app-shell');
  const viewLogin = $('#viewLogin');
  
  if (appShell) appShell.classList.remove('hidden');
  if (viewLogin) viewLogin.classList.add('hidden');
  
  const footerBlock = $('#sidebarUserProfileBlock');
  if (footerBlock) {
    footerBlock.innerHTML = `
      <div class="avatar" style="background:${esc(role === 'tech' ? '#f4c7a9' : (role === 'client' ? '#d6e7f9' : '#efe5d8'))}; color:#18181b; font-weight:700; width:30px; height:30px; border-radius:50%; display:grid; place-items:center; font-size:10px;">${esc(state.currentUser.avatar)}</div>
      <div style="flex:1; text-align:left; min-width:0; overflow:hidden;">
        <b style="font-size:12px; display:block; color:#fff; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${esc(state.currentUser.name)}</b>
        <small style="font-size:10px; color:#aeb8c1; display:block; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${esc(state.currentUser.title)}</small>
      </div>
      <button class="secondary-btn" id="btnLogOut" style="height:26px; padding:0 8px; font-size:9px; border-color:rgba(255,255,255,0.2); background:rgba(255,255,255,0.05); color:#fff; font-weight:700; border-radius:6px; cursor:pointer;">Çıkış</button>
    `;
  }

  if (role === 'admin') {
    // "Genel Durum" is the customer's own overview; the office has its own
    // dashboard and two similarly-named entries would just be confusing.
    $$('.sidebar .nav button').forEach(b =>
      b.classList.toggle('hidden', b.dataset.view === 'customerHome'));
    $$('.sidebar .nav-label').forEach(l => l.classList.remove('hidden'));
    $('#addSite')?.classList.remove('hidden');
    $('#newWorkOrder')?.classList.remove('hidden');
    $('#newWorkOrderSecondary')?.classList.remove('hidden');
    $('#backToSitesFromCompBtn')?.classList.remove('hidden');
    $('#companyFileUploadForm')?.classList.remove('hidden');
    $('#companyRecommendationForm')?.classList.remove('hidden');
    $('#adminInspectionForm')?.classList.remove('hidden');
    $('#printStationQrBtn')?.classList.remove('hidden');
    $('#btnEditSiteContract')?.classList.remove('hidden');
    // Facility setup (§3) is an admin action: upload the plan, place and remove
    // the monitoring points.
    $('#btnAddStation')?.classList.remove('hidden');
    $('#planUploadLabel')?.classList.remove('hidden');
    $('#btnDeleteStation')?.classList.remove('hidden');
  }
  else if (role === 'tech') {
    $$('.sidebar .nav button').forEach(b => {
      const view = b.dataset.view;
      b.classList.toggle('hidden', view !== 'work' && view !== 'mobileSim');
    });
    $$('.sidebar .nav-label').forEach(l => l.classList.add('hidden'));
    
    $('#addSite')?.classList.add('hidden');
    $('#newWorkOrder')?.classList.add('hidden');
    $('#newWorkOrderSecondary')?.classList.add('hidden');
    $('#backToSitesFromCompBtn')?.classList.add('hidden');
    $('#companyFileUploadForm')?.classList.add('hidden');
    $('#companyRecommendationForm')?.classList.add('hidden');
    $('#adminInspectionForm')?.classList.remove('hidden');
    $('#printStationQrBtn')?.classList.add('hidden');
    $('#btnEditSiteContract')?.classList.add('hidden');
    $('#btnAddStation')?.classList.add('hidden');
    $('#planUploadLabel')?.classList.add('hidden');
    $('#btnDeleteStation')?.classList.add('hidden');
    
    if (state.view !== 'work' && state.view !== 'mobileSim') {
      setView('work');
    }
  } 
  else if (role === 'client') {
    // The customer gets three entry points, all company-scoped via
    // visibleSites(): "Tesisler" (their own locations), "Ziyaret Raporları"
    // (§11 — which dates and time slots they were serviced on, by whom) and
    // "Analizler" (cross-location comparison). Everything else stays hidden.
    const CLIENT_VIEWS = new Set(['customerHome', 'sites', 'visitReports', 'insights']);
    $$('.sidebar .nav button').forEach(b => {
      b.classList.toggle('hidden', !CLIENT_VIEWS.has(b.dataset.view));
    });
    $$('.sidebar .nav-label').forEach(l => l.classList.add('hidden'));

    $('#addSite')?.classList.add('hidden');
    $('#newWorkOrder')?.classList.add('hidden');
    $('#newWorkOrderSecondary')?.classList.add('hidden');

    // `setView` only toggles which section is visible — it does not populate
    // the facility page. The client role starts here, so it has to be rendered
    // explicitly or the customer lands on an empty screen. `showCompanyDetail`
    // scopes to their own primary site.
    // Land on the portfolio overview, not inside one building: the customer's
    // first questions are "when are you coming" and "what do I owe you",
    // neither of which a single facility page answers.
    ui.activeSiteId = state.currentUser.siteId || 's1';
    renderCustomerHome();
    setView('customerHome');
    
    $('#backToSitesFromCompBtn')?.classList.add('hidden');
    $('#companyFileUploadForm')?.classList.add('hidden');
    $('#companyRecommendationForm')?.classList.add('hidden');
    $('#adminInspectionForm')?.classList.add('hidden');
    $('#printStationQrBtn')?.classList.add('hidden');
    $('#btnEditSiteContract')?.classList.add('hidden');
    $('#btnAddStation')?.classList.add('hidden');
    $('#planUploadLabel')?.classList.add('hidden');
    $('#btnDeleteStation')?.classList.add('hidden');
  }
}

export function checkSession() {
  const savedUser = localStorage.getItem("repellent-user");
  const appShell = $('.app-shell');
  const viewLogin = $('#viewLogin');
  
  if (savedUser) {
    state.currentUser = JSON.parse(savedUser);
    if (appShell) appShell.classList.remove('hidden');
    if (viewLogin) viewLogin.classList.add('hidden');
    applyRoleAccess();
  } else {
    state.currentUser = null;
    if (appShell) appShell.classList.add('hidden');
    if (viewLogin) viewLogin.classList.remove('hidden');
  }
}

// logout() used to live here and only cleared the local profile cache. That is
// no longer a complete sign-out — it would leave the Supabase session (and its
// still-valid token) alive — so it has been removed rather than left as a
// tempting one-liner. Use signOut() from core/auth.js.


// Mobile app workflow states
