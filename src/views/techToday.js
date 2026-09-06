// The technician's own day.
//
// A field technician opening the app has a very short list of questions, and
// none of them were answered on the work board, which showed the same generic
// list an office user sees:
//
//   1. How many jobs today, how many left?
//   2. Where am I going next, at what time, and how do I get there?
//   3. Who do I call if the gate is locked?
//   4. Are my own certificates still valid?   (§11 — the documents a customer
//      can inspect are the technician's problem before they are the office's)
//
// Everything here is read-only and derived: the route comes from the same
// contract-driven planner the office publishes from, so what the technician
// sees is exactly what was dispatched.

import { $, esc } from '../core/dom.js';
import { state } from '../core/state.js';
import { allSites } from '../core/state.js';
import { nextVisitFor, plannedVisits } from '../data/schedule.js';
import { demoToday, technicianStats } from '../data/history.js';
import { getCredential } from '../data/credentials.js';
import { notificationsFor, unreadFor } from '../core/notify.js';

const siteById = (id) => allSites().find((s) => s.id === id);

// Certificates inside this window are surfaced as a warning rather than left
// for the technician to discover when a customer refuses them entry.
const EXPIRY_WARN_DAYS = 90;

const MONTHS_TR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

// "09 Şub 2027" -> Date. Returns null for anything unparseable so a bad string
// simply does not raise a warning.
function parseTrDate(s) {
  const m = String(s).match(/^(\d{1,2})\s+(\S+)\s+(\d{4})$/);
  if (!m) return null;
  const idx = MONTHS_TR.indexOf(m[2]);
  if (idx < 0) return null;
  return new Date(Number(m[3]), idx, Number(m[1]));
}

function daysUntil(dateStr) {
  const d = parseTrDate(dateStr);
  if (!d) return null;
  const t = demoToday();
  const now = new Date(t.year, t.month, t.day);
  return Math.round((d - now) / 86400000);
}

export function renderTechToday() {
  const host = $('#techTodayPanel');
  if (!host) return;

  const user = state.currentUser;
  // Office roles get the normal board; this panel is the technician's own view.
  if (!user || user.role !== 'tech') {
    host.classList.add('hidden');
    host.innerHTML = '';
    return;
  }
  host.classList.remove('hidden');

  const t = demoToday();
  const mine = plannedVisits(t.year, t.month)
    .filter((p) => (p.team || []).includes(user.name));
  const todays = mine.filter((p) => p.day === t.day);
  const next = nextVisitFor(allSites().map((s) => s.id).filter((id) =>
    mine.some((p) => p.siteId === id))) || null;

  // The technician's own next assignment, not just the portfolio's.
  const myNext = mine
    .filter((p) => p.day >= t.day)
    .sort((a, b) => a.day - b.day || String(a.time).localeCompare(String(b.time)))[0] || next;

  const openJobs = (state.work || []).filter((w) => w.tech === user.name && !w.completed);
  const doneJobs = (state.work || []).filter((w) => w.tech === user.name && w.completed);

  host.innerHTML = `
    <div class="tt-grid">
      ${nextStopCard(myNext, openJobs)}
      ${dayStatsCard(todays.length, openJobs.length, doneJobs.length, unreadFor(user.name))}
      ${credentialsCard(user.name)}
    </div>`;
}

function nextStopCard(next, openJobs) {
  if (!next) {
    // An empty state that still offers the next useful action, rather than a
    // blank card.
    return `
      <article class="panel tt-card tt-next tt-empty">
        <p class="overline">SIRADAKİ DURAK</p>
        <h3>Planlanmış ziyaretiniz yok</h3>
        <p class="tt-empty-text">
          ${openJobs.length
            ? `Size atanmış ${openJobs.length} açık iş emri var — listeden birini seçerek başlayabilirsiniz.`
            : 'Yeni görev atandığında bildirim alırsınız ve burada görünür.'}
        </p>
      </article>`;
  }

  const site = siteById(next.siteId);
  const contact = (site && site.contact) || {};
  const address = (site && site.address) || `${next.siteName} · ${next.city}`;
  // Search the real street address when we have one — a site name alone often
  // lands the driver in the wrong district.
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    site && site.address ? `${site.address}` : `${next.siteName} ${next.city}`)}`;

  return `
    <article class="panel tt-card tt-next">
      <div class="tt-next-head">
        <div>
          <p class="overline">SIRADAKİ DURAK</p>
          <h3>${esc(next.company)}</h3>
          <p class="tt-site">${esc(next.siteName)} · ${esc(next.city)}</p>
        </div>
        <span class="tt-time">${esc(next.time)}<small>${esc(next.date)}</small></span>
      </div>

      <p class="tt-address">📍 ${esc(address)}</p>

      <div class="tt-tasks">
        <span class="tt-label">Yapılacak kontroller</span>
        <ul>${(next.tasks || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      </div>

      <div class="tt-actions">
        <a class="secondary-btn tt-btn" href="${esc(mapsUrl)}" target="_blank" rel="noopener noreferrer">🧭 Yol tarifi</a>
        ${contact.phone
          ? `<a class="secondary-btn tt-btn" href="tel:${esc(String(contact.phone).replace(/\s/g, ''))}">📞 ${esc(contact.name || 'Yetkili')}</a>`
          : ''}
        <button class="primary-btn tt-btn" data-view-target="mobileSim">📱 İşe başla</button>
      </div>
    </article>`;
}

function dayStatsCard(todayCount, open, done, unread) {
  const stat = (label, value, tone) => `
    <div class="tt-stat">
      <span>${esc(label)}</span>
      <strong${tone ? ` style="color:var(--${tone})"` : ''}>${value}</strong>
    </div>`;
  return `
    <article class="panel tt-card tt-stats">
      <p class="overline">BUGÜN</p>
      <div class="tt-stat-grid">
        ${stat('Planlı ziyaret', todayCount, todayCount ? 'blue' : null)}
        ${stat('Açık iş emri', open, open ? 'amber' : 'green')}
        ${stat('Tamamlanan', done, 'green')}
        ${stat('Okunmamış görev', unread, unread ? 'red' : null)}
      </div>
    </article>`;
}

function credentialsCard(tech) {
  const c = getCredential(tech);
  const rows = [
    { label: 'İş güvenliği belgesi', date: c.certExp },
    { label: 'Sağlık raporu (portör)', date: c.health }
  ];

  const items = rows.map((r) => {
    const left = daysUntil(r.date);
    // Colour alone must not carry the status, so each row states its condition
    // in words as well.
    const state = left === null ? { cls: '', text: r.date }
      : left < 0 ? { cls: 'expired', text: `Süresi doldu · ${r.date}` }
      : left <= EXPIRY_WARN_DAYS ? { cls: 'soon', text: `${left} gün kaldı · ${r.date}` }
      : { cls: 'ok', text: `Geçerli · ${r.date}` };
    return `
      <li class="tt-cred ${state.cls}">
        <span class="tt-cred-name">${esc(r.label)}</span>
        <span class="tt-cred-state">${esc(state.text)}</span>
      </li>`;
  }).join('');

  return `
    <article class="panel tt-card tt-creds">
      <p class="overline">BELGELERİM</p>
      <ul class="tt-cred-list">${items}</ul>
      <p class="tt-cred-note">Bu belgeler hizmet verdiğiniz müşterilerin portalında görüntülenebilir.</p>
    </article>`;
}
