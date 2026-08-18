// Demo presentation controls (Phase 5 — tasks 4-4, 5-2, 5-3, 5-4).
//
// Everything a presenter needs to drive the pitch smoothly, kept out of the
// view modules so nothing here collides with parallel work:
//   4-4  notification centre with a simulated "report emailed" event + bell badge
//   5-2  one-click reset to a pristine seed
//   5-3  guided tour that walks the pitch narrative
//   5-4  the role-switch click handler (the switch itself lives in core/auth.js)
//
// No backend: the reset rewrites the very seed the app boots from, and the
// simulated e-mail is a client-side notification. All state is in-memory and
// session-scoped, so a reset genuinely returns the demo to zero.

import { $, $$, toast } from '../core/dom.js';
import { state, save, visibleSites } from '../core/state.js';
import { recommendationsForSite } from '../data/history.js';
import { nextVisitFor } from '../data/schedule.js';
import { initial } from '../data/seed.js';
import { setView } from '../core/router.js';
import { ui } from '../core/session.js';
import { showCompanyDetail } from '../views/companyDetail.js';
import { switchRole } from '../core/auth.js';
import { getGpsAlerts } from '../core/gpsAlerts.js';
import { notificationsFor, relativeTime, pendingByTech, markReadFor, unreadFor } from '../core/notify.js';

// Session-lifetime demo events (e.g. an emailed report). Deliberately not
// persisted — a reset should wipe them, and it does.
window.__DEMO_NOTIFS__ = window.__DEMO_NOTIFS__ || [];

/* ---------------------------------------------------------- notifications */

// Operational alerts derived from live state. Mirrors the shape the older
// dialog produced so the existing `.notification-row` click handler in app.js
// keeps working via the shared window.__ACTIVE_NOTIFS__ list.
function operationalNotifs() {
  const list = [];

  // A technician's feed is their own dispatched assignments — what to do, when,
  // and where — and nothing else. Office alerts below would be noise on a
  // field phone, and the roadmap (§1) keeps commercial detail off it entirely.
  const user = state.currentUser;
  if (user && user.role === 'tech') {
    for (const n of notificationsFor(user.name)) {
      list.push({
        title: n.title,
        desc: `${n.desc}${(n.tasks || []).length ? ` · Yapılacaklar: ${n.tasks.join(', ')}` : ''}`,
        time: relativeTime(n.sentAt),
        type: n.read ? 'info' : 'alert',
        action: () => setView('work')
      });
    }
    return list;
  }

  // A customer's feed is strictly their own facilities. Without this branch the
  // client fell through to the office alerts below and was shown other
  // companies' work orders and the whole portfolio's stock levels.
  if (user && user.role === 'client') {
    for (const site of visibleSites()) {
      if (site.state === 'risk') list.push({
        title: `Kritik aktivite: ${site.name}`,
        desc: `Tesis sağlık skoru ${site.score}/100. Detaylar ve önerilen aksiyonlar tesis sayfanızda.`,
        time: 'Bugün', type: 'alert',
        action: () => showCompanyDetail(site.id)
      });
    }
    // Findings the customer still has to act on (§9 closed loop).
    for (const site of visibleSites()) {
      const open = recommendationsForSite(site.id)
        .filter((r) => r.stage === 'raised' || r.stage === 'rejected');
      if (open.length) list.push({
        title: `${open.length} aksiyon bekliyor · ${site.name}`,
        desc: 'Tarafınızdan tamamlanması gereken öneriler var. Aksiyonu bildirip fotoğraf yükleyebilirsiniz.',
        time: 'Bugün', type: 'warning',
        action: () => showCompanyDetail(site.id)
      });
    }
    // The next visit they can expect, from the contract-derived plan.
    const next = nextVisitFor(visibleSites().map((s) => s.id));
    if (next) list.push({
      title: `Sonraki servis: ${next.date} ${next.time}`,
      desc: `${next.siteName} · ${next.teamLabel}`,
      time: 'Planlandı', type: 'info',
      action: () => setView('sites')
    });
    return list;
  }

  // Office view: how many assignments are still unacknowledged in the field.
  for (const [tech, count] of pendingByTech()) {
    list.push({
      title: `Görev bildirimi bekliyor: ${tech}`,
      desc: `${count} atanmış ziyaret teknisyen tarafından henüz görüntülenmedi.`,
      time: 'Bugün', type: 'warning',
      action: () => setView('team')
    });
  }

  // Location-mismatch alerts come first: a technician reporting an arrival they
  // are not actually at is the most actionable thing the office can see. These
  // are real device fixes from the mobile app, not simulation.
  getGpsAlerts().forEach(a => {
    const dist = a.distanceM >= 1000
      ? `${(a.distanceM / 1000).toFixed(a.distanceM >= 100000 ? 0 : 1)} km`
      : `${a.distanceM} m`;
    list.push({
      title: `Konum uyuşmazlığı: ${a.techName}`,
      desc: `${a.siteCompany || 'Tesis'} için "tesise varıldı" bildirildi, ancak cihaz konumu ${dist} uzakta (geofence ${a.radiusM} m). İlk QR okutulmadan iş gerçek olarak başlamaz.`,
      time: new Date(a.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      type: 'alert',
      action: () => setView('team')
    });
  });
  state.sites.forEach(s => {
    if (s.state === 'risk') list.push({
      title: `Kritik Risk: ${s.company}`,
      desc: `${s.name} güvenlik skoru kritik seviyede (${s.score}/100).`,
      time: '3 saat önce', type: 'alert',
      action: () => showCompanyDetail(s.id)
    });
  });
  (state.inventory || []).forEach(item => {
    if (item.qty <= item.minQty) list.push({
      title: `Stok İkazı: ${item.name}`,
      desc: `Kritik depo seviyesi — kalan ${item.qty} ${item.unit} (eşik ${item.minQty}).`,
      time: 'Bugün', type: 'warning',
      action: () => setView('inventory')
    });
  });
  (state.work || []).forEach(w => {
    if (w.priority === 'critical' && !w.completed) list.push({
      title: `Acil İş Emri: ${w.id}`,
      desc: `${w.title} · Teknisyen: ${w.tech}`,
      time: '2 saat önce', type: 'info',
      action: () => { state.selectedWork = w.id; save(); setView('work'); }
    });
  });
  return list;
}

// Demo events (newest first) sit above the operational alerts.
function allNotifs() {
  return [...window.__DEMO_NOTIFS__, ...operationalNotifs()];
}

const ICON = { alert: '!', warning: '⚠', info: '✓', success: '📧' };

export function updateNotifBadge() {
  const bell = $('.topbar .notification');
  if (!bell) return;
  // A technician's feed keeps every assignment, but the badge must mean "new" —
  // otherwise it never clears after they read them. Office roles have no
  // read-state, so there the badge is the count of live alerts.
  const user = state.currentUser;
  const n = user && user.role === 'tech'
    ? unreadFor(user.name)
    : allNotifs().length;
  let badge = bell.querySelector('.notif-badge');
  if (n > 0) {
    if (!badge) { badge = document.createElement('span'); badge.className = 'notif-badge'; bell.appendChild(badge); }
    badge.textContent = n > 9 ? '9+' : String(n);
  } else if (badge) {
    badge.remove();
  }
}

export function openNotificationCenter() {
  const list = allNotifs();
  // The existing row handler in app.js reads actions from this global.
  window.__ACTIVE_NOTIFS__ = list;

  const content = $('#modalContent');
  const modalEl = $('#modal');
  if (!content || !modalEl) return;

  const rows = list.map((n, i) => `
    <div class="notification-row" data-notif-idx="${i}" style="padding:10px; background:var(--soft); border:1px solid var(--line); border-radius:8px; cursor:pointer; display:flex; gap:10px; align-items:start;">
      <span class="feed-icon ${n.type}" style="margin:0; font-size:12px; width:22px; height:22px; display:flex; align-items:center; justify-content:center; border-radius:50%;">${ICON[n.type] || '•'}</span>
      <div style="flex:1;">
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; font-weight:700;">
          <span>${n.title}</span>
          <span class="text-muted" style="font-size:10px; font-weight:normal;">${n.time}</span>
        </div>
        <p style="font-size:11px; color:var(--muted); margin-top:2px;">${n.desc}</p>
      </div>
    </div>
  `).join('') || '<p class="empty" style="text-align:center; padding:16px;">Şu anda operasyonel bildiriminiz bulunmuyor.</p>';

  content.innerHTML = `
    <h2>Bildirim Merkezi</h2>
    <p class="text-muted" style="margin-bottom:14px;">Operasyonel riskler, stok uyarıları ve müşteri iletişimi tek yerde.</p>
    <div style="display:grid; gap:10px; max-height:340px; overflow:auto;">${rows}</div>
    <div style="margin-top:14px; display:flex; justify-content:flex-end; border-top:1px solid var(--line); padding-top:12px;">
      <button class="secondary-btn" data-demo="simulate-email">📧 Müşteriye rapor gönder (simülasyon)</button>
    </div>
  `;
  modalEl.classList.remove('hidden');

  // Opening the feed is the acknowledgement. Marked after rendering so the
  // technician still sees which rows were new, then the badge clears.
  const user = state.currentUser;
  if (user && user.role === 'tech' && markReadFor(user.name)) {
    updateNotifBadge();
  }
}

// The simulated Stage-2 "report emailed to customer" event (task 4-4).
function simulateReportEmail() {
  // Prefer the site the presenter is currently viewing; fall back to the first.
  const site = state.sites.find(s => s.id === ui.activeSiteId) || state.sites[0];
  const to = site.contact?.email || 'müşteri temsilcisi';
  window.__DEMO_NOTIFS__.unshift({
    title: 'Rapor müşteriye e-postalandı',
    desc: `${site.company} · ${site.name} aylık servis raporu ${to} adresine gönderildi.`,
    time: 'Az önce', type: 'success',
    action: () => showCompanyDetail(site.id)
  });
  updateNotifBadge();
  openNotificationCenter();
  toast(`Aylık servis raporu ${site.company} müşterisine e-postalandı (simülasyon).`);
}

/* ---------------------------------------------------------------- reset */

function confirmReset() {
  const content = $('#modalContent');
  const modalEl = $('#modal');
  if (!content || !modalEl) return;
  content.innerHTML = `
    <h2>Demoyu sıfırla</h2>
    <p class="text-muted" style="margin-bottom:16px;">Tüm yerel değişiklikler (oluşturulan iş emirleri, kayıtlar, oturum) silinip uygulama başlangıç verisine dönecek. Bu işlem geri alınamaz.</p>
    <div style="display:flex; gap:10px; justify-content:flex-end;">
      <button class="secondary-btn" data-demo="reset-cancel">Vazgeç</button>
      <button class="primary-btn" data-demo="reset-confirm" style="background:var(--red); border-color:var(--red);">↻ Evet, sıfırla</button>
    </div>
  `;
  modalEl.classList.remove('hidden');
}

async function doReset() {
  $('#modal')?.classList.add('hidden');
  toast('Demo sıfırlanıyor…');
  // Overwrite the server-side state (data/state.json + state.js) with the fresh
  // seed. On the reload below, state.js provides the pristine seed and the empty
  // localStorage means the app boots straight from it — no half-finished work
  // orders survive.
  try {
    await fetch('./api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(initial)
    });
  } catch { /* offline / no server — localStorage clear + reload still resets */ }
  localStorage.clear();
  location.reload();
}

/* ----------------------------------------------------------------- tour */

// The pitch narrative, in order. Each step lands on the view that proves it.
const TOUR = [
  { view: 'dashboard', title: '1 · Komuta merkezi', body: 'Tüm portföy, saha ekibi ve riskler tek ekranda. Sunumu buradan açıyoruz — müşteri ilk bakışta kontrolün sizde olduğunu görüyor.' },
  { view: 'work', title: '2 · İlk QR kilidi', body: 'Servis, teknisyen tesiste ilk QR kodunu okuttuğu an başlar. Uzaktan "yaptım" denemez; başlangıç saati sahadan doğrulanır. Rakibin anlatmadığı denetim hikâyesi burada başlıyor.' },
  { view: 'work', title: '3 · Denetim uyarıları', body: 'GPS var ama QR yok, geofence dışında okutma, şüpheli kısa ziyaret — sistem bunları otomatik işaretler. Sahtecilik değil, güven veren şeffaflık.' },
  { view: 'reports', title: '4 · Denetime hazır raporlar', body: 'Ziyaret, trend, karşılaştırma, uygunsuzluk ve audit paketi — hepsi tek tıkla PDF. Müşteri BRCGS/AIB denetimine bu çıktılarla giriyor.' },
  { view: 'reports', title: '5 · Uyumluluk rozetleri', body: 'BRCGS, ISO 22000, FSSC 22000, SALSA, AIB hazırlık durumu gerçek veriden hesaplanır — dekoratif değil. Eksik varsa dürüstçe gösterilir.' },
  { view: 'insights', title: '6 · Risk trendleri', body: '12 aylık mevsimsel trend, lokasyon karşılaştırması ve öneri istatistikleri. Uçan haşere yazın zirve yapıyor — veriler mevsimi biliyor. Tur burada tamamlanıyor.' }
];
let tourIdx = 0;

function renderTour() {
  const step = TOUR[tourIdx];
  setView(step.view);
  // Spotlight the matching sidebar item so the eye follows the narrative.
  $$('.nav-item').forEach(b => b.classList.toggle('tour-lit', b.dataset.view === step.view));

  let overlay = $('#tourOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'tourOverlay';
    overlay.className = 'tour-overlay';
    document.body.appendChild(overlay);
  }
  const last = tourIdx === TOUR.length - 1;
  overlay.innerHTML = `
    <div class="tour-card">
      <div class="tour-progress">${TOUR.map((_, i) => `<i class="${i === tourIdx ? 'active' : ''}"></i>`).join('')}</div>
      <span class="tour-step-count">Adım ${tourIdx + 1} / ${TOUR.length}</span>
      <h3>${step.title}</h3>
      <p>${step.body}</p>
      <div class="tour-nav">
        <button class="text-btn" data-demo="tour-end">Turu kapat</button>
        <div style="display:flex; gap:8px;">
          ${tourIdx > 0 ? '<button class="secondary-btn" data-demo="tour-prev">← Önceki</button>' : ''}
          <button class="primary-btn" data-demo="${last ? 'tour-end' : 'tour-next'}">${last ? 'Bitir ✓' : 'Sonraki →'}</button>
        </div>
      </div>
    </div>
  `;
  overlay.classList.remove('hidden');
}

function startTour() { tourIdx = 0; renderTour(); }

function endTour() {
  $('#tourOverlay')?.classList.add('hidden');
  $$('.nav-item').forEach(b => b.classList.remove('tour-lit'));
  toast('Tanıtım turu tamamlandı.');
}

/* --------------------------------------------------------- presenter bar */

// A compact always-available control strip for the presenter: instant role
// switch (5-4), tour launch (5-3) and reset (5-2). Mounted inside .app-shell so
// it inherits the shell's show/hide — logging out hides it with no extra hook.
export function mountPresenterBar() {
  const shell = $('.app-shell');
  if (!shell) return;
  const role = state.currentUser?.role || 'admin';

  let bar = $('#presenterBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'presenterBar';
    bar.className = 'presenter-bar';
    shell.appendChild(bar);
  }
  bar.innerHTML = `
    <span class="presenter-tag">SUNUM</span>
    <div class="role-switch" role="group" aria-label="Rol değiştir">
      <button data-switch-role="admin"${role === 'admin' ? ' class="active"' : ''}>Yönetici</button>
      <button data-switch-role="tech"${role === 'tech' ? ' class="active"' : ''}>Teknisyen</button>
      <button data-switch-role="client"${role === 'client' ? ' class="active"' : ''}>Müşteri</button>
    </div>
    <button class="presenter-btn" data-demo="start-tour">🎬 Tur</button>
    <button class="presenter-btn" data-demo="open-reset">↻ Sıfırla</button>
  `;
}

/* ------------------------------------------------------- click handling */

// Single delegated handler for every demo control. Registered once in the
// app.js CLICK_CHAIN so parallel sessions only ever see one new line there.
export function demoClicks(e) {
  const roleBtn = e.target.closest('[data-switch-role]');
  if (roleBtn) {
    switchRole(roleBtn.dataset.switchRole);
    // switchRole repaints views but not our shell-level extras.
    mountPresenterBar();
    updateNotifBadge();
    return true;
  }

  const el = e.target.closest('[data-demo]');
  if (!el) return false;

  switch (el.dataset.demo) {
    case 'start-tour':    startTour();          return true;
    case 'tour-next':     tourIdx = Math.min(TOUR.length - 1, tourIdx + 1); renderTour(); return true;
    case 'tour-prev':     tourIdx = Math.max(0, tourIdx - 1); renderTour();  return true;
    case 'tour-end':      endTour();            return true;
    case 'open-reset':    confirmReset();       return true;
    case 'reset-cancel':  $('#modal')?.classList.add('hidden'); return true;
    case 'reset-confirm': doReset();            return true;
    case 'simulate-email': simulateReportEmail(); return true;
    default: return false;
  }
}
