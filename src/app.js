// Repellent Operations — application shell.
//
// Owns only bootstrap, a few shell-level handlers (auth, nav, search,
// notifications), and the handler chains below. Every other handler lives
// with the view that owns it, so parallel sessions do not collide here.

import { $, $$, toast } from './core/dom.js';
import { save, state } from './core/state.js';
import { signIn, signOut, restoreSession, watchSession } from './core/auth.js';
import { ui } from './core/session.js';
import { checkSession } from './core/roles.js';
import { techSites } from './data/seed.js';
import { render, setView } from './core/router.js';
import { modal } from './ui/modal.js';
import { dashboardRangeClicks } from './views/dashboard.js';
import { renderSites } from './views/sites.js';
import { renderInsights } from './views/insights.js';
import {
  workListClicks, workCardClicks, completeWorkClicks, calendarToggleClicks,
  createWorkSubmit, taskChemicalSubmit, renderWork
} from './views/work.js';
import { teamRosterClicks } from './views/team.js';
import {
  siteCardClicks, backNavClicks, planToolbarClicks, planCanvasClicks,
  companyTabClicks, fileDownloadClicks, editSiteSubmit, adminInspectionSubmit,
  fileUploadSubmit, recommendationSubmit, chemicalUsageSubmit, placementSubmit,
  deviceReplacementSubmit, lifecycleClicks, recCustomerResponseSubmit, recApprovalSubmit,
  showStationDetail, switchCompanyTab, showCompanyDetail
} from './views/companyDetail.js';
import { reportCardClicks, reportModalClicks, generateReportSubmit } from './views/reports.js';
import { insightsClicks } from './views/insights.js';
import { invoiceActionClicks, invoiceFilterClicks, billingClicks } from './views/finance.js';
import { stockRefillSubmit } from './views/inventory.js';
import { createSiteSubmit } from './views/sites.js';
import { demoClicks, openNotificationCenter, updateNotifBadge, mountPresenterBar } from './ui/demo.js';
import { visitReportClicks, bindVisitReportFilters } from './views/visitReports.js';
import { calendarClicks } from './ui/calendar.js';
import { customerHomeClicks, serviceRequestSubmit } from './views/customerHome.js';
import {
  floorPlanClicks, newStationSubmit, bindFloorPlanInputs,
  planPointerDown, planPointerMove, planPointerUp
} from './views/floorPlan.js';

// Clean stale data from previous versions
localStorage.removeItem("repellent-product-demo"); localStorage.removeItem("ladybug-product-demo"); localStorage.removeItem("insectram-product-demo"); localStorage.removeItem("ladybug-ops"); localStorage.removeItem("ladybug-user"); localStorage.removeItem("insectram-ops");

export function shellClicks(e) {
    if (e.target.id === 'btnLogOut') {
      // signOut() rather than the old roles.js:logout(): clearing the local
      // profile cache without ending the Supabase session would leave a live,
      // still-usable token behind on a shared machine.
      signOut().then(() => {
        render();
        toast('Oturum kapatıldı.');
      });
      return true;
    }
    
    // The one-click "log in as admin/tech/client" buttons that used to live
    // here are gone. They bypassed authentication entirely, and there is no
    // version of them that is safe once this app holds real customer data.

    // data-action click event bindings
    const actionEl = e.target.closest('[data-action]');
    if (actionEl) {
      const action = actionEl.dataset.action;
      
      if (action === 'search') {
        modal('search');
        return true;
      }
      if (action === 'notifications') {
        openNotificationCenter();
        return true;
      }
      if (action === 'workspace') {
        toast("Aktif Çalışma Alanı: Apex Operations (12 Müşteri, 34 Tesis)");
        return true;
      }
      if (action === 'portfolio') {
        toast("Sistem genelinde ortalama tesis güvenlik skoru: %87 (İyi)");
        return true;
      }
      if (action === 'filters') {
        toast("Gelişmiş filtreleme seçenekleri: Şehir, Sektör ve Risk seviyesi filtreleri uygulandı.");
        return true;
      }
      if (action === 'sort') {
        state.workSortAsc = !state.workSortAsc;
        save();
        // Toggle sort order of work list
        state.work.sort((a, b) => {
          const priorityWeight = { critical: 3, high: 2, normal: 1 };
          const wa = priorityWeight[a.priority] || 0;
          const wb = priorityWeight[b.priority] || 0;
          return state.workSortAsc ? (wa - wb) : (wb - wa);
        });
        renderWork();
        toast(`İş emirleri öncelik sırasına göre ${state.workSortAsc ? 'artan' : 'azalan'} sıralandı.`);
        return true;
      }
      if (action === 'route') {
        toast("Yapay zeka rota optimizasyon algoritması çalıştırılıyor...");
        setTimeout(() => {
          toast("Saha teknisyenleri için en verimli 4 rota optimize edildi ve güncellendi!");
        }, 1200);
        return true;
      }
      if (action === 'facilityMap') {
        const siteId = techSites[state.selectedTech] || 's1';
        showCompanyDetail(siteId);
        // Switch to map tab
        setTimeout(() => {
          const mapTab = $('[data-comp-tab="map"]');
          if (mapTab) mapTab.click();
        }, 100);
        return true;
      }
    }

    // Clicking Search Results row
    const searchSiteRow = e.target.closest('.search-site-row');
    if (searchSiteRow) {
      const siteId = searchSiteRow.dataset.siteId;
      showCompanyDetail(siteId);
      $('#modal').classList.add('hidden');
      return true;
    }
    const searchWorkRow = e.target.closest('.search-work-row');
    if (searchWorkRow) {
      const workId = searchWorkRow.dataset.workId;
      state.selectedWork = workId;
      save();
      setView('work');
      $('#modal').classList.add('hidden');
      return true;
    }

    // Clicking Notification row
    const notifRow = e.target.closest('.notification-row');
    if (notifRow) {
      const idx = parseInt(notifRow.dataset.notifIdx);
      if (window.__ACTIVE_NOTIFS__ && window.__ACTIVE_NOTIFS__[idx]) {
        window.__ACTIVE_NOTIFS__[idx].action();
      }
      $('#modal').classList.add('hidden');
      return true;
    }

    const nav=e.target.closest('[data-view]');
    if(nav) {
      setView(nav.dataset.view);
      $('.sidebar').classList.remove('open');
    }
    
    if ($('.sidebar').classList.contains('open') && !e.target.closest('.sidebar') && !e.target.closest('#mobileMenu')) {
      $('.sidebar').classList.remove('open');
    }

    const target=e.target.closest('[data-view-target]');
    if(target) {
      setView(target.dataset.viewTarget);
      $('.sidebar').classList.remove('open');
    }
  return false;
}

export function modalOpenerClicks(e) {
    if(e.target.closest('#newWorkOrder')||e.target.closest('#newWorkOrderSecondary')) modal('work');
    if(e.target.closest('#addSite')) modal('site');
    if(e.target.closest('#btnEditSiteContract')) {
      if (ui.activeSiteId) {
        modal('editSite', ui.activeSiteId);
      } else {
        toast("Hata: Aktif seçili tesis bulunamadı.");
      }
    }
    if(e.target.closest('#createReport')) modal('report');
    if(e.target.closest('#btnInviteTechnician')) modal('inviteTechnician');

    if(e.target.closest('.modal-close')||e.target.id==='modal') $('#modal').classList.add('hidden');
    
    if(e.target.closest('#optionalDownload')){
      toast('Tesis planı offline kullanım için indirildi.');
    }
  return false;
}

export function mobileMenuClicks(e) {
    if(e.target.id==='mobileMenu') $('.sidebar').classList.toggle('open');
    
    // Station marker dot clicked in facility plan
  return false;
}

export function loginSubmit(e) {
    if (e.target.id === 'loginForm') {
      e.preventDefault();
      const email = $('#inpLoginEmail').value.trim();
      const password = $('#inpLoginPassword').value;
      const button = e.target.querySelector('button[type="submit"], .primary-btn');

      // The network round-trip is real now, so the button has to say so —
      // otherwise an impatient double-click fires two sign-in requests.
      const restore = button ? button.textContent : null;
      if (button) { button.disabled = true; button.textContent = 'Giriş yapılıyor…'; }

      signIn(email, password)
        .then((result) => {
          if (result.ok) {
            render();
            updateNotifBadge();
            toast(`Hoş geldiniz, ${state.currentUser.name}!`);
          } else {
            toast(result.message);
          }
        })
        .catch(() => toast('Giriş yapılamadı. Bağlantınızı kontrol edin.'))
        .finally(() => {
          if (button) { button.disabled = false; button.textContent = restore; }
        });
      return true;
    }
  return false;
}

// Handler chains. Order is significant: it reproduces the sequence of the
// original single delegator, including blocks that deliberately fall through
// to later ones. A handler returns true to stop processing the event.
const CLICK_CHAIN = [
  demoClicks,
  dashboardRangeClicks,
  shellClicks,
  workListClicks,
  teamRosterClicks,
  siteCardClicks,
  workCardClicks,
  modalOpenerClicks,
  completeWorkClicks,
  backNavClicks,
  calendarToggleClicks,
  calendarClicks,
  customerHomeClicks,
  visitReportClicks,
  planToolbarClicks,
  reportModalClicks,
  reportCardClicks,
  mobileMenuClicks,
  lifecycleClicks,
  // Before planCanvasClicks: placement-mode clicks and the click that ends a
  // marker drag must not also fall through to station selection.
  floorPlanClicks,
  planCanvasClicks,
  companyTabClicks,
  insightsClicks,
  invoiceActionClicks,
  billingClicks,
  invoiceFilterClicks,
  fileDownloadClicks
];

const SUBMIT_CHAIN = [
  newStationSubmit,
  serviceRequestSubmit,
  loginSubmit,
  createWorkSubmit,
  editSiteSubmit,
  createSiteSubmit,
  generateReportSubmit,
  placementSubmit,
  deviceReplacementSubmit,
  recCustomerResponseSubmit,
  recApprovalSubmit,
  adminInspectionSubmit,
  fileUploadSubmit,
  recommendationSubmit,
  chemicalUsageSubmit,
  stockRefillSubmit,
  taskChemicalSubmit
];

function bind() {
  document.addEventListener('click', e => {
    for (const handle of CLICK_CHAIN) if (handle(e)) return;
  });

  $('#siteSearch')?.addEventListener('input', renderSites);
  $$('[data-site-filter]').forEach(b => b.addEventListener('click', () => {
    $$('[data-site-filter]').forEach(x => x.classList.toggle('active', x === b));
    renderSites();
  }));

  $('#trendFilter')?.addEventListener('change', renderInsights);

  bindVisitReportFilters();
  bindFloorPlanInputs();

  // Drag-to-reposition for station markers. Bound on document so markers
  // re-rendered after every save keep working without rebinding.
  document.addEventListener('pointerdown', planPointerDown);
  document.addEventListener('pointermove', planPointerMove);
  document.addEventListener('pointerup', planPointerUp);

  document.addEventListener('submit', e => {
    for (const handle of SUBMIT_CHAIN) if (handle(e)) return;
  });
}

// Inline onclick handlers in generated markup need global scope.
Object.assign(window, { showStationDetail, switchCompanyTab });

bind();

// Boot. checkSession() paints the shell or the login screen from the cached
// profile immediately, so the page is never blank while the network is slow;
// restoreSession() then confirms the cached identity against a real Supabase
// session and clears it if the token is gone. Order matters: without the
// optimistic first paint a refresh flashes the login screen at a signed-in
// user, and without the confirmation an expired token still renders a shell.
checkSession();
render();
mountPresenterBar();
updateNotifBadge();

restoreSession().then((restored) => {
  if (!restored) return;
  render();
  mountPresenterBar();
  updateNotifBadge();
});
watchSession();
