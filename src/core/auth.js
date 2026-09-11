// Authentication against Supabase Auth.
//
// This module replaces the demo directory that used to live here — a hardcoded
// map of users unlocked by the password "123", plus a switchRole() helper that
// let anyone become an admin with one click. Both are gone. Identity now comes
// from a real session, and every query the app makes afterwards is filtered by
// the RLS policies in supabase/migrations against that session's JWT.
//
// One consequence worth understanding: a freshly signed-up account has no
// org_id, and every RLS policy denies a null org_id. So an uninvited signup can
// authenticate and still see nothing at all. Rather than drop such a user into
// an empty dashboard that looks broken, signIn() below refuses the login and
// says why.

import { supabase, run, errorMessage, isConfigured } from './supabase.js';
import { state, replaceSites, replaceWork, replaceTechnicians, replaceActivity } from './state.js';
import { toast } from './dom.js';
import { checkSession } from './roles.js';
import { render } from './router.js';
import { fetchSites } from '../data/repo/sites.js';
import { fetchWorkOrders, fetchRecentEvents } from '../data/repo/work.js';
import { fetchTechnicians } from '../data/repo/technicians.js';
import { fetchVisitHistory } from '../data/repo/visits.js';
import { fetchRecommendations } from '../data/repo/customer.js';
import { setVisitHistory } from '../data/history.js';

const USER_CACHE_KEY = 'repellent-user';

// The columns every screen needs to render the signed-in identity. The joined
// customer name is what the customer portal shows as the company header.
const PROFILE_SELECT =
  'id, role, full_name, title, org_id, customer_id, is_active, customers(name), organizations(name)';

function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toLocaleUpperCase('tr'))
    .join('');
}

/**
 * Map a profiles row + auth user onto the shape the views already expect on
 * `state.currentUser`. Keeping the old shape is deliberate: it means none of
 * the 37 views need to change to work with real accounts.
 *
 * @param {object} profile
 * @param {{ email?: string }} authUser
 */
export function profileToUser(profile, authUser) {
  return {
    id: profile.id,
    email: authUser?.email || '',
    name: profile.full_name || authUser?.email || '',
    role: profile.role,
    title: profile.title || '',
    avatar: initials(profile.full_name),
    orgId: profile.org_id,
    customerId: profile.customer_id,
    company: profile.customers?.name || null,
    // The operating company's own name. The shell used to hard-code
    // "Apex Operations" in index.html; it now shows whoever actually owns
    // this account.
    orgName: profile.organizations?.name || ''
  };
}

async function fetchProfile(userId) {
  return run(supabase.from('profiles').select(PROFILE_SELECT).eq('id', userId).single());
}

// A profile that cannot be used yet. Returning a reason rather than a boolean
// so the login screen can tell the user which of the two situations they are in
// — "wait for an admin" is very different advice from "your account is closed".
function profileProblem(profile) {
  if (!profile) return 'Hesabınız bulunamadı. Yöneticinize başvurun.';
  if (!profile.is_active) return 'Hesabınız devre dışı bırakılmış. Yöneticinize başvurun.';
  if (!profile.org_id || !profile.role) {
    return 'Hesabınız henüz bir kuruma atanmamış. Yöneticinizin yetkilendirmesi gerekiyor.';
  }
  return null;
}

function applyUser(user) {
  state.currentUser = user;
  // roles.js:checkSession reads this key to decide whether to show the shell.
  // It stays the cache of "who is signed in"; the Supabase session remains the
  // actual credential, so editing this in devtools grants nothing.
  localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
  checkSession();
  loadRealData();
}

// Replaces the seeded demo data with the signed-in org's real records.
//
// These used to be four independent fire-and-forget loaders, each calling
// render() as it finished. That produced inconsistent intermediate states:
// on a real account the sites query returned an empty list and re-rendered
// while state.work still held the seeded demo work orders, and a work order
// pointing at a site that no longer existed crashed the render outright. The
// app froze on a half-painted dashboard.
//
// Loading them together and painting once removes that window entirely. A
// fresh org legitimately has zero of everything, so an empty result is the
// correct answer rather than a failure; Promise.allSettled means one failing
// query cannot block the other three.
async function loadRealData() {
  const [sites, work, technicians, activity, visitHistory, findings] = await Promise.allSettled([
    fetchSites(),
    fetchWorkOrders(),
    fetchTechnicians(),
    fetchRecentEvents(),
    fetchVisitHistory(),
    fetchRecommendations()
  ]);

  const apply = (result, label, fn) => {
    if (result.status === 'fulfilled') fn(result.value);
    else console.error(`[repellent] ${label} yuklenemedi`, result.reason);
  };

  apply(sites, 'sahalar', replaceSites);
  apply(work, 'is emirleri', replaceWork);
  apply(technicians, 'teknisyenler', replaceTechnicians);
  apply(activity, 'aktivite akisi', replaceActivity);

  // The reporting layer (reports, insights, finance, the printable bodies)
  // all derive from this one store, so it is installed before the paint.
  // Findings ride along because the report bodies count them per site.
  if (visitHistory.status === 'fulfilled') {
    setVisitHistory({
      months: visitHistory.value.months,
      visits: visitHistory.value.visits,
      recommendations: findings.status === 'fulfilled' ? findings.value : []
    });
  } else {
    console.error('[repellent] ziyaret gecmisi yuklenemedi', visitHistory.reason);
  }

  render();
}

function clearUser() {
  state.currentUser = null;
  localStorage.removeItem(USER_CACHE_KEY);
  checkSession();
}

/**
 * Sign in with email and password.
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ ok: boolean, message?: string }>}
 */
export async function signIn(email, password) {
  if (!isConfigured) {
    return { ok: false, message: 'Sunucu yapılandırması eksik. Yöneticinize başvurun.' };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email || '').trim().toLowerCase(),
    password: String(password || '')
  });
  if (error) return { ok: false, message: errorMessage(error) };

  let profile;
  try {
    profile = await fetchProfile(data.user.id);
  } catch (err) {
    await supabase.auth.signOut();
    return { ok: false, message: err.message };
  }

  const problem = profileProblem(profile);
  if (problem) {
    // Do not leave a usable session behind for an account that cannot be used.
    await supabase.auth.signOut();
    return { ok: false, message: problem };
  }

  applyUser(profileToUser(profile, data.user));
  return { ok: true };
}

/** Sign out and return to the login screen. */
export async function signOut() {
  await supabase.auth.signOut().catch(() => { /* clear locally regardless */ });
  clearUser();
}

/**
 * Restore an existing session on boot. Called once from app.js before the first
 * render, so a refresh does not bounce the user back to the login screen.
 *
 * @returns {Promise<boolean>} whether a usable session was restored
 */
export async function restoreSession() {
  if (!isConfigured) {
    clearUser();
    return false;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    clearUser();
    return false;
  }

  try {
    const profile = await fetchProfile(session.user.id);
    if (profileProblem(profile)) {
      await supabase.auth.signOut();
      clearUser();
      return false;
    }
    applyUser(profileToUser(profile, session.user));
    return true;
  } catch {
    // Expired or revoked token: fall back to the login screen rather than
    // rendering a shell whose every query will fail.
    clearUser();
    return false;
  }
}

// A token can be revoked or expire while the tab is open. Without this the app
// keeps rendering a populated dashboard whose queries have all started failing.
export function watchSession() {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      clearUser();
      render();
      toast('Oturumunuz sona erdi. Lütfen tekrar giriş yapın.');
    }
  });
}
