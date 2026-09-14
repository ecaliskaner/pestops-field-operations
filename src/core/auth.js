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
import {
  state, replaceSites, replaceWork, replaceTechnicians, replaceActivity,
  replaceInventory, replaceChemicals, replaceStockTransactions,
  replaceInvoices, setOrganization, setTechRates
} from './state.js';
import { $, toast, hideBootSplash } from './dom.js';
import { checkSession } from './roles.js';
import { render } from './router.js';
import { fetchSites, fetchArchivedSites } from '../data/repo/sites.js';
import { fetchWorkOrders, fetchRecentEvents } from '../data/repo/work.js';
import { fetchTechnicians, fetchArchivedTechnicians } from '../data/repo/technicians.js';
import { fetchVisitHistory } from '../data/repo/visits.js';
import { fetchInventory, fetchChemicals, fetchStockTransactions } from '../data/repo/inventory.js';
import { fetchRecommendations, fetchContracts } from '../data/repo/customer.js';
import { fetchInvoices, fetchOrganization, fetchTechnicianRates } from '../data/repo/billing.js';
import { setVisitHistory, setStationReplacements } from '../data/history.js';
import { fetchAllReplacements } from '../data/repo/stations.js';

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
  const [
    sites, work, technicians, activity, visitHistory, findings, inventory, chemicals,
    stockTransactions, contracts, invoices, organization,
    techRates, replacements, archivedSites, archivedTechnicians
  ] = await Promise.allSettled([
    fetchSites(),
    fetchWorkOrders(),
    fetchTechnicians(),
    fetchRecentEvents(),
    fetchVisitHistory(),
    fetchRecommendations(),
    fetchInventory(),
    fetchChemicals(),
    fetchStockTransactions(),
    fetchContracts(),
    fetchInvoices(),
    fetchOrganization(),
    fetchTechnicianRates(),
    fetchAllReplacements(),
    fetchArchivedSites(),
    fetchArchivedTechnicians()
  ]);

  const apply = (result, label, fn) => {
    if (result.status === 'fulfilled') fn(result.value);
    else console.error(`[repellent] ${label} yuklenemedi`, result.reason);
  };

  // Contracts carry the price everything downstream is billed from, so they are
  // attached to their site before the sites list is installed. A site whose
  // contract is missing keeps `contract: null`, and billing.js refuses to
  // invoice it rather than inventing a monthly fee for it.
  if (sites.status === 'fulfilled') {
    const byId = contracts.status === 'fulfilled' ? contracts.value : {};
    for (const site of sites.value) {
      if (site.id && byId[site.id]) site.contract = byId[site.id];
    }
  }
  if (contracts.status === 'rejected') {
    console.error('[repellent] sozlesmeler yuklenemedi', contracts.reason);
  }

  apply(sites, 'sahalar', replaceSites);
  apply(work, 'is emirleri', replaceWork);
  apply(technicians, 'teknisyenler', replaceTechnicians);
  apply(activity, 'aktivite akisi', replaceActivity);
  apply(inventory, 'stok', replaceInventory);
  apply(chemicals, 'kimyasallar', replaceChemicals);
  apply(stockTransactions, 'stok hareketleri', replaceStockTransactions);
  apply(invoices, 'faturalar', replaceInvoices);
  apply(organization, 'kurum bilgisi', setOrganization);
  apply(techRates, 'teknisyen ucretleri', setTechRates);
  apply(replacements, 'cihaz degisimleri', setStationReplacements);
  // Deliberately not merged into state.sites: an archived facility must stay
  // out of the portfolio counts, the Ekip map and the visit planner. The only
  // screen that reads this is the archive list that offers it back.
  apply(archivedSites, 'arsivlenmis tesisler', (rows) => { state.archivedSites = rows; });
  // Same reasoning as archivedSites: kept out of state.technicians so an
  // archived technician cannot leak back into the roster, the assignment
  // picker or the Ekip map. Only the archive list on Ekip reads this.
  apply(archivedTechnicians, 'arsivlenmis teknisyenler', (rows) => { state.archivedTechnicians = rows; });

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

  // Real data is on screen once render() returns, so the placeholders it
  // painted over can no longer be read as fact. The finally matters: this
  // runs even when some queries rejected (the views show an empty state for a
  // missing store) and even if render() itself throws, because the one
  // outcome worse than a wrong number is a splash screen that never lifts.
  try {
    render();
  } finally {
    hideBootSplash();
  }
}

function clearUser() {
  state.currentUser = null;
  checkSession();
  // Signed out — the login screen is the real answer, nothing to wait for.
  hideBootSplash();
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

// Shown while a PASSWORD_RECOVERY session is open — an invite or a password
// reset link that Supabase has already turned into a live session, before the
// person has ever chosen a password of their own.
function showSetPasswordScreen() {
  hideBootSplash();
  $('.app-shell')?.classList.add('hidden');
  $('#viewLogin')?.classList.add('hidden');
  $('#viewSetPassword')?.classList.remove('hidden');
}

/**
 * Finish an invite or password-reset flow: the browser already holds a live
 * session (Supabase signs the link's holder in automatically), this just
 * gives that session a real password and then signs the person into the app
 * the same way signIn() would.
 *
 * @param {string} password
 * @returns {Promise<{ ok: boolean, message?: string }>}
 */
export async function completePasswordSetup(password) {
  const { data, error } = await supabase.auth.updateUser({ password: String(password || '') });
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
    await supabase.auth.signOut();
    return { ok: false, message: problem };
  }

  $('#viewSetPassword')?.classList.add('hidden');
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
    } else if (event === 'PASSWORD_RECOVERY') {
      // Supabase fires this for both a password-reset link and an invite
      // link — either way, the browser now holds a session for someone who
      // has never chosen a password. detectSessionInUrl already parsed the
      // link's tokens into that session by the time this fires; without this
      // branch the person would be silently signed into a populated app,
      // never asked to set a password, and unable to sign back in next time.
      showSetPasswordScreen();
    }
  });
}
