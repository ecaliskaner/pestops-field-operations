// Ladybug Operations — application shell.
//
// Owns only bootstrap, a few shell-level handlers (auth, nav, search,
// notifications), and the handler chains below. Every other handler lives
// with the view that owns it, so parallel sessions do not collide here.

import { $, $$, toast } from './core/dom.js';
import { save, state } from './core/state.js';
import { users } from './core/auth.js';
import { ui } from './core/session.js';
import { checkSession, logout } from './core/roles.js';
import { techSites } from './data/seed.js';
import { render, setView } from './core/router.js';
import { modal } from './ui/modal.js';
import { dashboardRangeClicks } from './views/dashboard.js';
import { renderSites } from './views/sites.js';
import { renderInsights } from './views/insights.js';
import {
  workListClicks, workCardClicks, completeWorkClicks, calendarToggleClicks,
  taskChemDeleteClicks, createWorkSubmit, taskChemicalSubmit, renderWork
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
import { mobileClicks, mobileChemDeleteClicks, mobChemicalSubmit, chemicalDocClicks } from './views/mobile.js';
import { insightsClicks } from './views/insights.js';
import { invoiceActionClicks, invoiceFilterClicks, billingClicks } from './views/finance.js';
import { stockRefillSubmit } from './views/inventory.js';
import { createSiteSubmit } from './views/sites.js';
import { demoClicks, openNotificationCenter, updateNotifBadge, mountPresenterBar } from './ui/demo.js';
import { visitReportClicks, bindVisitReportFilters } from './views/visitReports.js';
import { calendarClicks } from './ui/calendar.js';

// Clean stale data from previous versions
localStorage.removeItem("ladybug-product-demo"); localStorage.removeItem("insectram-product-demo"); localStorage.removeItem("insectram-ops");

export function shellClicks(e) {
    if (e.target.id === 'btnLogOut') {
      logout();
      return true;
    }
    
    const quickLogin = e.target.closest('.quick-login-btn');
    if (quickLogin) {
      const roleKey = quickLogin.dataset.loginAs;
      let email = 'admin@ladybug.com';
      if (roleKey === 'tech') email = 'ayse@ladybug.com';
      if (roleKey === 'client') email = 'acme@client.com';
      
      state.currentUser = users[email];
      localStorage.setItem("ladybug-user", JSON.stringify(state.currentUser));
      checkSession();
      render();
      mountPresenterBar();
      updateNotifBadge();
      toast(`Hoş geldiniz, ${state.currentUser.name}!`);
      return true;
    }

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
      const password = $('#inpLoginPassword').value.trim();
      
      const user = users[email];
      if (user && password === '123') {
        state.currentUser = user;
        localStorage.setItem("ladybug-user", JSON.stringify(state.currentUser));
        checkSession();
        render();
        mountPresenterBar();
        updateNotifBadge();
        toast(`Başarıyla giriş yapıldı. Hoş geldiniz, ${user.name}!`);
      } else {
        toast('Hata: Geçersiz e-posta veya şifre (Şifre: 123)');
      }
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
  visitReportClicks,
  planToolbarClicks,
  reportModalClicks,
  reportCardClicks,
  mobileMenuClicks,
  lifecycleClicks,
  planCanvasClicks,
  mobileClicks,
  companyTabClicks,
  insightsClicks,
  invoiceActionClicks,
  billingClicks,
  chemicalDocClicks,
  mobileChemDeleteClicks,
  taskChemDeleteClicks,
  invoiceFilterClicks,
  fileDownloadClicks
];

const SUBMIT_CHAIN = [
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
  taskChemicalSubmit,
  mobChemicalSubmit
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

  document.addEventListener('submit', e => {
    for (const handle of SUBMIT_CHAIN) if (handle(e)) return;
  });
}

// Inline onclick handlers in generated markup need global scope.
Object.assign(window, { showStationDetail, switchCompanyTab });

bind();
checkSession();
render();
mountPresenterBar();
updateNotifBadge();
