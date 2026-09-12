// Customer overview — the screen a customer actually opens the portal for.
//
// Until now the client role landed straight inside one facility's detail page.
// That answers "what is the state of this building?" but not the three
// questions a customer actually has:
//
//   1. When are you coming next, and who?          (§1 — the agreed visit plan)
//   2. What do I still have to do?                 (§9 — the closed action loop)
//   3. How do I get you here sooner?               (§1 — ek servis / acil çağrı)
//
// The third had no answer at all: the contract prices call-outs and extra
// visits, but the portal had no way to ask for one. That is what makes this a
// portal rather than a report viewer.

import { $, toast, esc } from '../core/dom.js';
import { state, visibleSites, replaceWork } from '../core/state.js';
import { fetchWorkOrders } from '../data/repo/work.js';
import { ui } from '../core/session.js';
import { fetchRecommendations, fetchContracts, requestService, customerOwes, stillOpen } from '../data/repo/customer.js';
import { visitTypes } from '../data/catalog.js';
import { showCompanyDetail } from './companyDetail.js';
import { setView } from '../core/router.js';

const visitTypeName = (code) => (visitTypes.find((v) => v.code === code) || {}).name || code;

// recommendations.due_on is a plain `date` (2026-09-11); an unset termin shows
// as a dash rather than "Invalid Date".
const formatDue = (d) =>
  d ? new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/* --------------------------------------------------------------- gathering */

// Real findings and contracts, loaded once when the portal first renders.
// Both were previously generated: recommendationsForSite() invented findings
// per site and contractFor() invented prices, which meant a customer could be
// quoted a call-out fee that appears in no contract they ever signed.
let recommendations = [];
let contractsBySite = {};
let portalLoaded = false;

async function loadPortalData() {
  if (portalLoaded) return;
  portalLoaded = true;
  try {
    recommendations = await fetchRecommendations();
  } catch (err) {
    console.error('[repellent] oneriler yuklenemedi', err);
  }
  try {
    contractsBySite = await fetchContracts();
  } catch (err) {
    console.error('[repellent] sozlesmeler yuklenemedi', err);
  }
  renderCustomerHome();
}

const recsForSite = (siteId) => recommendations.filter((r) => r.siteId === siteId);

// Findings the customer owes an action on, across every site they can see.
function pendingActions() {
  const siteName = new Map(visibleSites().map((s) => [s.id, s.name]));
  return customerOwes(recommendations)
    .filter((r) => siteName.has(r.siteId))
    .map((r) => ({ ...r, siteName: siteName.get(r.siteId) }));
}

// The customer's own next scheduled visit: the soonest work order that is not
// finished yet. state.work already holds only their sites' orders (RLS), so
// this reads the same rows the office board does rather than a parallel
// schedule generator.
function nextVisit() {
  const now = Date.now();
  const open = (state.work || [])
    .filter((w) => !w.completed && w.dueAt && new Date(w.dueAt).getTime() >= now)
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
  if (!open.length) return null;

  const w = open[0];
  const site = visibleSites().find((s) => s.id === w.siteId);
  const due = new Date(w.dueAt);
  const assigned = w.tech && w.tech !== 'Atanmadı';
  return {
    date: due.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }),
    time: due.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    siteName: site ? site.name : '',
    city: site ? site.city : '',
    // "Confirmed" means a named technician is actually assigned to it. A visit
    // still sitting unassigned is exactly what the customer should see as
    // pending rather than as a promise.
    confirmed: assigned,
    teamLabel: assigned ? w.tech : 'Ekip henüz atanmadı',
    tasks: [visitTypeName(w.visitType), w.title].filter(Boolean)
  };
}

// The most recent completed service across the customer's sites.
function lastVisitAcross() {
  const done = (state.work || [])
    .filter((w) => w.completed && w.completedAt)
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  if (!done.length) return null;
  const w = done[0];
  const site = visibleSites().find((s) => s.id === w.siteId);
  return {
    date: new Date(w.completedAt).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }),
    siteName: site ? site.name : '',
    tech: w.tech
  };
}

/* --------------------------------------------------------------- rendering */

export function renderCustomerHome() {
  const host = $('#customerHomeBody');
  if (!host) return;

  loadPortalData();

  const sites = visibleSites();
  const user = state.currentUser;
  const next = nextVisit();
  const actions = pendingActions();
  const last = lastVisitAcross();

  $('#customerHomeGreeting') && ($('#customerHomeGreeting').textContent =
    `${user ? user.name : 'Hoş geldiniz'} · ${user && user.company ? user.company : ''}`);

  host.innerHTML = `
    ${nextVisitCard(next)}
    ${actionsCard(actions)}
    ${sitesGrid(sites, last)}
  `;
}

// The single most-asked question gets the most prominent card, and it is
// answered with a real planned date, crew and scope — not a placeholder.
function nextVisitCard(next) {
  if (!next) {
    return `
      <article class="panel ch-card ch-next ch-empty-card">
        <p class="overline">SONRAKİ SERVİS</p>
        <h2>Planlanmış ziyaret bulunmuyor</h2>
        <p class="ch-empty-text">
          Sözleşmenizde tanımlı periyodik ziyaretler planlandığında burada tarih,
          saat ve gelecek ekip bilgisiyle görünür.
        </p>
        <button class="primary-btn" data-ch-request="ES">Ek servis talebi oluştur</button>
      </article>`;
  }
  return `
    <article class="panel ch-card ch-next">
      <div class="ch-next-head">
        <div>
          <p class="overline">SONRAKİ SERVİS</p>
          <h2>${esc(next.date)} · ${esc(next.time)}</h2>
          <p class="ch-next-site">${esc(next.siteName)} · ${esc(next.city)}</p>
        </div>
        <span class="status-chip ${next.confirmed ? 'healthy' : 'warning'}">
          ${next.confirmed ? '✓ Teyitli' : '⏳ Teyit bekliyor'}
        </span>
      </div>
      <div class="ch-next-body">
        <div class="ch-next-crew">
          <span class="ch-label">Gelecek ekip</span>
          <b>${esc(next.teamLabel)}</b>
        </div>
        <div class="ch-next-tasks">
          <span class="ch-label">Yapılacak kontroller</span>
          <ul>${next.tasks.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
        </div>
      </div>
      <div class="ch-next-actions">
        <button class="secondary-btn" data-ch-request="TZ">Takip ziyareti iste</button>
        <button class="primary-btn" data-ch-request="AC">🚨 Acil çağrı oluştur</button>
      </div>
    </article>`;
}

function actionsCard(actions) {
  if (!actions.length) {
    return `
      <article class="panel ch-card ch-actions ch-empty-card">
        <p class="overline">SİZDEN BEKLENEN AKSİYONLAR</p>
        <h2>✓ Bekleyen aksiyonunuz yok</h2>
        <p class="ch-empty-text">
          Saha ekibimiz bir uygunsuzluk tespit ettiğinde burada listelenir; fotoğraf
          yükleyerek kapattığınızı bildirebilirsiniz.
        </p>
      </article>`;
  }
  return `
    <article class="panel ch-card ch-actions">
      <p class="overline">SİZDEN BEKLENEN AKSİYONLAR</p>
      <h2>${actions.length} açık madde</h2>
      <div class="ch-action-list">
        ${actions.slice(0, 4).map((a) => `
          <button class="ch-action-row" data-ch-site="${esc(a.siteId)}">
            <span class="ch-action-badge ${a.rework ? 'warn' : ''}">
              ${a.rework ? '↩ Tekrar' : '● Açık'}
            </span>
            <span class="ch-action-text">
              <b>${esc(a.desc)}</b>
              <small>${esc(a.siteName)}${a.category ? ` · ${esc(a.category)}` : ''} · termin ${esc(formatDue(a.dueOn))}</small>
            </span>
            <span class="ch-action-go">→</span>
          </button>`).join('')}
      </div>
      ${actions.length > 4 ? `<p class="ch-more">+${actions.length - 4} madde daha</p>` : ''}
    </article>`;
}

function sitesGrid(sites, last) {
  return `
    <article class="panel ch-card ch-sites">
      <p class="overline">TESİSLERİNİZ</p>
      <h2>${sites.length} lokasyon</h2>
      ${last ? `<p class="ch-last">Son servis: <b>${esc(last.date)}</b> · ${esc(last.siteName)} · ${esc(last.tech)}</p>` : ''}
      <div class="ch-site-grid">
        ${sites.map((s) => {
          const recs = stillOpen(recsForSite(s.id)).length;
          const tone = s.state === 'risk' ? 'critical' : s.state === 'watch' ? 'warning' : 'healthy';
          const label = s.state === 'risk' ? 'Riskli' : s.state === 'watch' ? 'İzlenmeli' : 'Sağlıklı';
          return `
            <button class="ch-site-card" data-ch-site="${esc(s.id)}">
              <div class="ch-site-head">
                <b>${esc(s.name)}</b>
                <span class="status-chip ${tone}">${label}</span>
              </div>
              <div class="ch-site-meta">${esc(s.city)} · ${(s.stations || []).length} kontrol noktası</div>
              <div class="ch-site-stats">
                <span><i>Skor</i><b>${s.score}/100</b></span>
                <span><i>Açık öneri</i><b>${recs}</b></span>
                <span><i>Son servis</i><b>${esc(String(s.last).split(' · ')[0])}</b></span>
              </div>
            </button>`;
        }).join('')}
      </div>
    </article>`;
}

/* --------------------------------------------------- service request (§1) */

const REQUEST_KINDS = {
  AC: { label: 'Acil çağrı', desc: 'Aktivite gördüm, en kısa sürede gelinsin.', priceKey: 'emergencyCallPrice', priority: 'critical' },
  ES: { label: 'Ek servis', desc: 'Sözleşme dışı ilave bir ziyaret istiyorum.', priceKey: 'extraVisitPrice', priority: 'high' },
  TZ: { label: 'Takip ziyareti', desc: 'Önceki bulgunun kontrol edilmesini istiyorum.', priceKey: null, priority: 'high' }
};

function openRequestModal(kind) {
  const sites = visibleSites();
  const content = $('#modalContent');
  const modalEl = $('#modal');
  if (!content || !modalEl || !sites.length) return;

  const meta = REQUEST_KINDS[kind] || REQUEST_KINDS.ES;
  // Quote a price only when this site's real contract carries one. Inventing
  // a call-out fee the customer never agreed to would be worse than showing
  // no figure at all.
  const contract = contractsBySite[sites[0].id] || null;
  const price = meta.priceKey && contract ? contract[meta.priceKey] : null;

  content.innerHTML = `
    <h2>${esc(meta.label)} talebi</h2>
    <p class="text-muted" style="margin-bottom:14px;">${esc(meta.desc)}</p>
    <form id="serviceRequestForm" style="display:grid; gap:12px;">
      <input type="hidden" name="kind" value="${esc(kind)}" />
      <label class="form-label">
        <span>Tesis</span>
        <select name="siteId">
          ${sites.map((s) => `<option value="${esc(s.id)}">${esc(s.name)} · ${esc(s.city)}</option>`).join('')}
        </select>
      </label>
      <label class="form-label">
        <span>Ne gözlemlediniz?</span>
        <textarea name="note" rows="3" placeholder="Örn: Depo girişinde kemirgen dışkısı görüldü." required></textarea>
      </label>
      <label class="form-label">
        <span>Tercih ettiğiniz zaman</span>
        <select name="window">
          <option value="En kısa sürede">En kısa sürede</option>
          <option value="Bugün içinde">Bugün içinde</option>
          <option value="Yarın sabah">Yarın sabah</option>
          <option value="Bu hafta içinde">Bu hafta içinde</option>
        </select>
      </label>
      ${price ? `
        <p class="ch-price-note">
          ℹ️ Sözleşmenize göre bu ziyaretin bedeli <b>${esc(price.toLocaleString('tr-TR'))} ₺</b>
          olarak faturalandırılır. Talebiniz onaylandıktan sonra planlanır.
        </p>` : meta.priceKey ? `
        <p class="ch-price-note">
          ℹ️ Bu ziyaretin ücreti sözleşmenizde tanımlı değil. Talebiniz operasyon
          ekibine iletilir ve planlanmadan önce bedeli sizinle teyit edilir.
        </p>` : `
        <p class="ch-price-note">
          ℹ️ Takip ziyaretleri sözleşme kapsamındadır, ek ücret yansıtılmaz.
        </p>`}
      <div style="display:flex; gap:8px; justify-content:flex-end;">
        <button type="button" class="secondary-btn" data-ch-cancel="1">Vazgeç</button>
        <button type="submit" class="primary-btn">Talebi Gönder</button>
      </div>
    </form>`;
  modalEl.classList.remove('hidden');
}

export function serviceRequestSubmit(e) {
  if (e.target.id !== 'serviceRequestForm') return false;
  e.preventDefault();

  const f = new FormData(e.target);
  const kind = String(f.get('kind') || 'ES');
  const siteId = String(f.get('siteId'));
  const note = String(f.get('note') || '').trim();
  const when = String(f.get('window') || '');
  const site = visibleSites().find((s) => s.id === siteId);
  const meta = REQUEST_KINDS[kind] || REQUEST_KINDS.ES;
  if (!site) return true;

  const button = e.target.querySelector('button[type="submit"]');
  if (button) { button.disabled = true; button.textContent = 'Gönderiliyor…'; }

  // The request becomes a real work order the office can see and assign. A
  // client has no INSERT policy on work_orders, so this goes through the
  // request_service() RPC — see data/repo/customer.js.
  requestService({ siteId, kind, note, window: when })
    .then(({ code }) => {
      $('#modal').classList.add('hidden');
      // Reload the board so the new request shows up in the portal (and in the
      // office view) without a refresh.
      return refreshWorkOrders().then(() => {
        renderCustomerHome();
        toast(`${meta.label} talebiniz alındı${code ? ` (${code})` : ''}. Operasyon ekibi en kısa sürede dönüş yapacak.`);
      });
    })
    .catch((err) => {
      toast(err.message || 'Talebiniz gönderilemedi. Lütfen tekrar deneyin.');
    })
    .finally(() => {
      if (button) { button.disabled = false; button.textContent = 'Talebi Gönder'; }
    });

  return true;
}

// Pull the work-order board again after a request is raised. Failing here is
// not fatal — the request is already recorded server-side; the customer just
// would not see it until the next load.
async function refreshWorkOrders() {
  try {
    replaceWork(await fetchWorkOrders());
  } catch (err) {
    console.error('[repellent] is emirleri yenilenemedi', err);
  }
}

/* ---------------------------------------------------------------- handlers */

export function customerHomeClicks(e) {
  const req = e.target.closest('[data-ch-request]');
  if (req) { openRequestModal(req.dataset.chRequest); return true; }

  if (e.target.closest('[data-ch-cancel]')) {
    $('#modal').classList.add('hidden');
    return true;
  }

  const siteBtn = e.target.closest('[data-ch-site]');
  if (siteBtn) {
    ui.activeSiteId = siteBtn.dataset.chSite;
    showCompanyDetail(siteBtn.dataset.chSite);
    return true;
  }

  return false;
}
