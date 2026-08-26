// Operational service calendar (task 7-2 / 7-3).
//
// Replaces the original fixed grid (31 cells, "day 13" hardcoded as today, July
// only) with a real month calendar: correct weekday alignment, month
// navigation, and per-day entries that come from the planner in
// data/schedule.js — completed visits for days already served, contract-derived
// planned visits for days still to come.
//
// The calendar is also where the office dispatches work: opening a day shows
// what is to be done and who is assigned, and publishes that assignment to the
// technicians' phones via core/notify.js.

import { $, $$, toast } from '../core/dom.js';
import { state } from '../core/state.js';
import { visibleSites } from '../core/state.js';
import { demoToday, getVisits } from '../data/history.js';
import { monthEntries, daysInMonth } from '../data/schedule.js';
import { notifyTechnicians } from '../core/notify.js';
import { visitTypes } from '../data/catalog.js';
import { openReport } from '../views/reports.js';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const MONTH_LONG = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

const visitTypeName = (code) => (visitTypes.find((v) => v.code === code) || {}).name || code;

// Which month the board is showing. Seeded to the dataset's own "today" so the
// calendar opens on a month that has both served and pending days.
const cal = { year: null, month: null };

function cursor() {
  if (cal.year === null) {
    const t = demoToday();
    cal.year = t.year;
    cal.month = t.month;
  }
  return cal;
}

/* --------------------------------------------------------------- scoping */

// A technician's board shows only their own assignments — that is the whole
// point of "what do I have to do". Office roles see everything they can see.
function scopedEntries(year, month) {
  const allowed = new Set(visibleSites().map((s) => s.id));
  const list = monthEntries(year, month, (s) => allowed.has(s.id));
  const user = state.currentUser;
  if (user && user.role === 'tech') {
    return list.filter((e) => (e.team || []).includes(user.name));
  }
  return list;
}

function scopedByDay(year, month) {
  const map = new Map();
  for (const e of scopedEntries(year, month)) {
    if (!map.has(e.day)) map.set(e.day, []);
    map.get(e.day).push(e);
  }
  return map;
}

/* --------------------------------------------------------------- rendering */

const chipClassFor = (e) =>
  e.kind === 'completed' ? 'cal-done'
    : e.confirmed ? 'cal-planned'
    : 'cal-tentative';

export function renderCalendarGrid() {
  const grid = $('#calendarGrid');
  if (!grid) return;

  const { year, month } = cursor();
  const today = demoToday();
  const byDay = scopedByDay(year, month);
  const total = daysInMonth(year, month);

  // Monday-first offset: JS getDay() is Sunday-based.
  const firstDow = new Date(year, month, 1).getDay();
  const lead = (firstDow + 6) % 7;

  const label = $('#calendarMonthLabel');
  if (label) label.textContent = `${MONTH_LONG[month]} ${year}`;

  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<div class="calendar-cell empty-cell"></div>');

  for (let day = 1; day <= total; day++) {
    const entries = byDay.get(day) || [];
    const isToday = year === today.year && month === today.month && day === today.day;
    const visible = entries.slice(0, 3);
    const rest = entries.length - visible.length;

    cells.push(`
      <div class="calendar-cell${isToday ? ' cal-today' : ''}${entries.length ? '' : ' cal-empty-day'}"
           data-cal-day="${day}" role="button" tabindex="0"
           title="${entries.length ? `${entries.length} ziyaret` : 'Planlanmış ziyaret yok'}">
        <span class="cal-daynum">${day}${isToday ? '<em>bugün</em>' : ''}</span>
        ${visible.map((e) => `
          <span class="cal-chip ${chipClassFor(e)}">
            <b>${esc(e.time || '')}</b> ${esc(e.company)}
          </span>`).join('')}
        ${rest > 0 ? `<span class="cal-more">+${rest} daha</span>` : ''}
      </div>`);
  }

  // Trailing blanks so the last week is a full row.
  while (cells.length % 7 !== 0) {
    cells.push('<div class="calendar-cell empty-cell"></div>');
  }

  grid.innerHTML = cells.join('');
  renderCalendarSummary(year, month);
}

function renderCalendarSummary(year, month) {
  const host = $('#calendarSummary');
  if (!host) return;
  const entries = scopedEntries(year, month);
  const done = entries.filter((e) => e.kind === 'completed').length;
  const planned = entries.filter((e) => e.kind === 'planned');
  const tentative = planned.filter((e) => !e.confirmed).length;
  const crew = new Set(entries.flatMap((e) => e.team || []));

  host.innerHTML = `
    <div class="rep-stat"><span>Tamamlanan</span><strong style="color:var(--green)">${done}</strong></div>
    <div class="rep-stat"><span>Planlı</span><strong style="color:var(--blue)">${planned.length}</strong></div>
    <div class="rep-stat"><span>Teyit bekleyen</span><strong style="color:var(--amber)">${tentative}</strong></div>
    <div class="rep-stat"><span>Görevli personel</span><strong>${crew.size}</strong></div>`;
}

/* ------------------------------------------------------------- day detail */

export function openDayPlan(day) {
  const { year, month } = cursor();
  const entries = (scopedByDay(year, month).get(day) || []);
  const content = $('#modalContent');
  const modalEl = $('#modal');
  if (!content || !modalEl) return;

  const dateLabel = `${day} ${MONTH_LONG[month]} ${year}`;

  const rows = entries.map((e) => {
    const badge = e.kind === 'completed'
      ? `<span class="status-chip healthy">Tamamlandı</span>`
      : e.confirmed
        ? `<span class="status-chip blue">Planlı</span>`
        : `<span class="status-chip warning">Teyit bekliyor</span>`;

    const work = e.kind === 'completed'
      ? `<p class="cal-row-desc">${esc(e.description || '')}${e.findings ? ` · <b style="color:var(--red)">${e.findings} bulgu</b>` : ' · bulgu yok'}</p>`
      : `<ul class="cal-task-list">${(e.tasks || []).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;

    return `
      <div class="cal-day-row">
        <div class="cal-row-head">
          <div>
            <b>${esc(e.time || '')} · ${esc(e.company)}</b>
            <small>${esc(e.siteName)} · ${esc(e.city)} · ${esc(visitTypeName(e.visitType))}</small>
          </div>
          ${badge}
        </div>
        ${work}
        <div class="cal-row-team">
          <span>👷 ${esc(e.teamLabel || (e.team || []).join(', '))}</span>
          ${e.kind === 'completed' && e.visitId
            ? `<button class="text-btn" data-cal-open-visit="${esc(e.visitId)}">Raporu aç →</button>`
            : `<button class="text-btn" data-cal-notify-entry="${esc(e.id)}" data-cal-day="${day}">🔔 Ekibi bilgilendir</button>`}
        </div>
      </div>`;
  }).join('');

  const pendingCount = entries.filter((e) => e.kind === 'planned').length;

  content.innerHTML = `
    <h2>${esc(dateLabel)}</h2>
    <p class="text-muted" style="margin-bottom:14px;">
      ${entries.length
        ? `${entries.length} ziyaret · sözleşme kapsamına göre yapılacak işler aşağıda.`
        : 'Bu güne planlanmış ziyaret bulunmuyor.'}
    </p>
    <div class="cal-day-list">${rows || '<p class="rep-empty">Bu güne planlanmış ziyaret bulunmuyor.</p>'}</div>
    ${pendingCount ? `
      <div class="cal-day-actions">
        <button class="primary-btn" data-cal-notify-day="${day}">🔔 Günün planını ekibe gönder (${pendingCount})</button>
      </div>` : ''}
  `;
  modalEl.classList.remove('hidden');
}

/* ------------------------------------------------------------- dispatching */

// Turn planned entries into notifications on the assigned technicians' phones.
// Commercial terms are stripped by notify.js, per §1.
function dispatch(entries) {
  let sent = 0;
  const people = new Set();
  for (const e of entries) {
    if (e.kind !== 'planned') continue;
    const created = notifyTechnicians(e.team || [], {
      title: `Yeni görev · ${e.date} ${e.time}`,
      desc: `${e.company} — ${e.siteName} (${e.city})`,
      date: e.date,
      time: e.time,
      siteId: e.siteId,
      company: e.company,
      siteName: e.siteName,
      tasks: e.tasks || [],
      visitType: e.visitType,
      planId: e.id
    });
    sent += created.length;
    (e.team || []).forEach((t) => people.add(t));
  }
  return { sent, people: [...people] };
}

/* ---------------------------------------------------------------- handlers */

export function calendarClicks(e) {
  // Jump from a served day straight to its printable service report.
  const openVisit = e.target.closest('[data-cal-open-visit]');
  if (openVisit) {
    const visit = getVisits().find((v) => v.id === openVisit.dataset.calOpenVisit);
    if (visit) openReport('visit', { siteId: visit.siteId, visit });
    return true;
  }

  const nav = e.target.closest('[data-cal-nav]');
  if (nav) {
    const c = cursor();
    const delta = Number(nav.dataset.calNav);
    if (delta === 0) {
      const t = demoToday();
      c.year = t.year; c.month = t.month;
    } else {
      c.month += delta;
      while (c.month < 0) { c.month += 12; c.year -= 1; }
      while (c.month > 11) { c.month -= 12; c.year += 1; }
    }
    renderCalendarGrid();
    return true;
  }

  // Dispatch the whole day. Checked before the day-open handler so the button
  // inside the modal does not also re-open the day.
  const notifyDay = e.target.closest('[data-cal-notify-day]');
  if (notifyDay) {
    const day = Number(notifyDay.dataset.calNotifyDay);
    const { year, month } = cursor();
    const entries = (scopedByDay(year, month).get(day) || []);
    const { sent, people } = dispatch(entries);
    toast(sent
      ? `${sent} görev bildirimi gönderildi → ${people.join(', ')}`
      : 'Bu günde gönderilecek planlı görev yok.');
    if (sent) openDayPlan(day);
    return true;
  }

  const notifyEntry = e.target.closest('[data-cal-notify-entry]');
  if (notifyEntry) {
    const day = Number(notifyEntry.dataset.calDay);
    const { year, month } = cursor();
    const entry = (scopedByDay(year, month).get(day) || [])
      .find((x) => x.id === notifyEntry.dataset.calNotifyEntry);
    if (entry) {
      const { sent, people } = dispatch([entry]);
      toast(sent ? `Bildirim gönderildi → ${people.join(', ')}` : 'Gönderilecek görev bulunamadı.');
    }
    return true;
  }

  const publish = e.target.closest('[data-cal-publish]');
  if (publish) {
    const { year, month } = cursor();
    const { sent, people } = dispatch(scopedEntries(year, month));
    toast(sent
      ? `${MONTH_LONG[month]} planı yayınlandı · ${sent} bildirim → ${people.length} personel`
      : 'Bu ayda gönderilecek planlı görev yok.');
    return true;
  }

  const day = e.target.closest('[data-cal-day]');
  if (day && !e.target.closest('[data-cal-notify-entry]')) {
    openDayPlan(Number(day.dataset.calDay));
    return true;
  }

  return false;
}

export function currentCalendarMonth() {
  const c = cursor();
  return { year: c.year, month: c.month, label: `${MONTH_LONG[c.month]} ${c.year}` };
}
