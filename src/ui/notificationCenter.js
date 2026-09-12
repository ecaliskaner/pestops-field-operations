// The bell icon's notification centre — real operational alerts only.
//
// This used to be half of src/ui/demo.js, sharing a file with a floating
// "SUNUM" bar (role switch, a guided sales tour, and a "Sıfırla" button that
// overwrote the server's saved state and reloaded), plus a fake
// "Müşteriye rapor gönder (simülasyon)" button that injected a client-only
// notification claiming an email had been sent. None of that belongs in front
// of a paying customer, and it was mounted unconditionally on every boot — see
// git history for the removal. Everything below it was already real.

import { $ } from '../core/dom.js';
import { state, visibleSites } from '../core/state.js';
import { recommendationsForSite } from '../data/history.js';
import { nextVisitFor } from '../data/schedule.js';
import { setView } from '../core/router.js';
import { showCompanyDetail } from '../views/companyDetail.js';
import { getGpsAlerts } from '../core/gpsAlerts.js';
import { notificationsFor, relativeTime, pendingByTech, markReadFor, unreadFor } from '../core/notify.js';

// Alerts derived from live state, scoped by who is looking.
function operationalNotifs() {
  const list = [];

  // A technician's feed is their own dispatched assignments — what to do, when,
  // and where — and nothing else. Office alerts below would be noise on a
  // field phone, and the roadmap keeps commercial detail off it entirely.
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
    // Findings the customer still has to act on.
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
  // are real device fixes from the mobile app.
  getGpsAlerts().forEach((a) => {
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
  state.sites.forEach((s) => {
    if (s.state === 'risk') list.push({
      title: `Kritik Risk: ${s.company}`,
      desc: `${s.name} güvenlik skoru kritik seviyede (${s.score}/100).`,
      time: '3 saat önce', type: 'alert',
      action: () => showCompanyDetail(s.id)
    });
  });
  (state.inventory || []).forEach((item) => {
    if (item.qty <= item.minQty) list.push({
      title: `Stok İkazı: ${item.name}`,
      desc: `Kritik depo seviyesi — kalan ${item.qty} ${item.unit} (eşik ${item.minQty}).`,
      time: 'Bugün', type: 'warning',
      action: () => setView('inventory')
    });
  });
  (state.work || []).forEach((w) => {
    if (w.priority === 'critical' && !w.completed) list.push({
      title: `Acil İş Emri: ${w.id}`,
      desc: `${w.title} · Teknisyen: ${w.tech}`,
      time: '2 saat önce', type: 'info',
      action: () => { state.selectedWork = w.id; setView('work'); }
    });
  });
  return list;
}

const ICON = { alert: '!', warning: '⚠', info: '✓' };

export function updateNotifBadge() {
  const bell = $('.topbar .notification');
  if (!bell) return;
  // A technician's feed keeps every assignment, but the badge must mean "new" —
  // otherwise it never clears after they read them. Office roles have no
  // read-state, so there the badge is the count of live alerts.
  const user = state.currentUser;
  const n = user && user.role === 'tech'
    ? unreadFor(user.name)
    : operationalNotifs().length;
  let badge = bell.querySelector('.notif-badge');
  if (n > 0) {
    if (!badge) { badge = document.createElement('span'); badge.className = 'notif-badge'; bell.appendChild(badge); }
    badge.textContent = n > 9 ? '9+' : String(n);
  } else if (badge) {
    badge.remove();
  }
}

export function openNotificationCenter() {
  const list = operationalNotifs();
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
  `;
  modalEl.classList.remove('hidden');

  // Opening the feed is the acknowledgement. Marked after rendering so the
  // technician still sees which rows were new, then the badge clears.
  const user = state.currentUser;
  if (user && user.role === 'tech' && markReadFor(user.name)) {
    updateNotifBadge();
  }
}
