// Worker notification queue (task 7-3).
//
// When the office publishes a day's or a month's plan, the assigned technicians
// have to be told — roadmap §1: "Sisteme tanımlanan müşteri bilgileri; sorumlu
// çalışanın telefonuna ticari bilgiler hariç, yüklenir. Böylelikle servise
// gidecek çalışan ne zaman gideceğini ve ne gibi işler yapacağından haberdar
// olur." Note the exclusion: the technician is sent the schedule and the work to
// do, never the commercial terms.
//
// Unlike the presenter's demo events (window.__DEMO_NOTIFS__, session-only),
// these live in `state` so a dispatched assignment survives a reload — a
// notification the worker loses on refresh would not be a notification. The
// one-click demo reset clears them along with the rest of state.

import { state, save } from './state.js';

const store = () => (state.techNotifications ||= []);

/** Commercial fields a technician must never receive (§1). */
const withheld = ['annualPrice', 'monthlyPrice', 'extraVisitPrice', 'emergencyCallPrice', 'taxNo', 'taxOffice'];

/**
 * Queue one notification per technician. Returns the created records.
 * `payload` carries title/desc/date/time/tasks — deliberately no pricing.
 */
export function notifyTechnicians(techs, payload) {
  const clean = { ...payload };
  for (const key of withheld) delete clean[key];

  const stamp = Date.now();
  const created = (techs || []).map((tech, i) => ({
    id: `TN-${stamp}-${i}-${Math.random().toString(36).slice(2, 7)}`,
    tech,
    read: false,
    sentAt: new Date().toISOString(),
    ...clean
  }));

  if (created.length) {
    store().unshift(...created);
    save();
  }
  return created;
}

export const notificationsFor = (tech) =>
  store().filter((n) => n.tech === tech);

export const unreadFor = (tech) =>
  store().filter((n) => n.tech === tech && !n.read).length;

export function markReadFor(tech) {
  let touched = 0;
  for (const n of store()) {
    if (n.tech === tech && !n.read) { n.read = true; touched++; }
  }
  if (touched) save();
  return touched;
}

export function clearFor(tech) {
  state.techNotifications = store().filter((n) => n.tech !== tech);
  save();
}

/** "3 dk önce" / "2 sa önce" / "5 gün önce" for a stored ISO stamp. */
export function relativeTime(iso) {
  const then = Date.parse(iso);
  if (!isFinite(then)) return '—';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return 'Az önce';
  if (mins < 60) return `${mins} dk önce`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} sa önce`;
  return `${Math.round(hrs / 24)} gün önce`;
}

/** Everyone currently holding at least one unread assignment. */
export function pendingByTech() {
  const out = new Map();
  for (const n of store()) {
    if (n.read) continue;
    out.set(n.tech, (out.get(n.tech) || 0) + 1);
  }
  return out;
}
