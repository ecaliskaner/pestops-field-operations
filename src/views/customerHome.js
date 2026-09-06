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
import { state, save, visibleSites } from '../core/state.js';
import { ui } from '../core/session.js';
import { recommendationsForSite, visitsForSite } from '../data/history.js';
import { nextVisitFor, plannedVisits } from '../data/schedule.js';
import { contractFor } from '../data/billing.js';
import { visitTypes } from '../data/catalog.js';
import { showCompanyDetail } from './companyDetail.js';
import { setView } from '../core/router.js';

const visitTypeName = (code) => (visitTypes.find((v) => v.code === code) || {}).name || code;

/* --------------------------------------------------------------- gathering */

// Findings the *customer* owes an action on. `raised` is waiting on them and
// `rejected` came back for rework; `customer_actioned` is already with us.
function pendingActions() {
  return visibleSites().flatMap((site) =>
    recommendationsForSite(site.id)
      .filter((r) => r.stage === 'raised' || r.stage === 'rejected')
      .map((r) => ({ ...r, siteName: site.name, siteId: site.id })));
}

function lastVisitAcross() {
  const all = visibleSites().flatMap((s) => visitsForSite(s.id));
  if (!all.length) return null;
  // Visit ids are generated in chronological order per site, so the highest
  // month/day pair across the set is the most recent service.
  return all.reduce((best, v) =>
    (!best || v.monthIndex > best.monthIndex ||
      (v.monthIndex === best.monthIndex && v.day > best.day)) ? v : best, null);
}

/* --------------------------------------------------------------- rendering */

export function renderCustomerHome() {
  const host = $('#customerHomeBody');
  if (!host) return;

  const sites = visibleSites();
  const user = state.currentUser;
  const next = nextVisitFor(sites.map((s) => s.id));
  const actions = pendingActions();
  const last = lastVisitAcross();
  const openTotal = sites.reduce((n, s) => n + recommendationsForSite(s.id).filter((r) => r.status === 'open').length, 0);

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
            <span class="ch-action-badge ${a.stage === 'rejected' ? 'warn' : ''}">
              ${a.stage === 'rejected' ? '↩ Tekrar' : '● Açık'}
            </span>
            <span class="ch-action-text">
              <b>${esc(a.desc)}</b>
              <small>${esc(a.siteName)} · ${esc(a.category)} · termin ${esc(a.dueDate || '—')}</small>
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
          const recs = recommendationsForSite(s.id).filter((r) => r.status === 'open').length;
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
  const contract = contractFor(sites[0]);
  const price = meta.priceKey ? contract[meta.priceKey] : null;

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
          ℹ️ Sözleşmenize göre bu ziyaretin bedeli <b>${price.toLocaleString('tr-TR')} ₺</b>
          olarak faturalandırılır. Talebiniz onaylandıktan sonra planlanır.
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

  // A customer request becomes a real, assignable work order — the same object
  // the operations board and the technician's day are built from. Marked
  // `requestedByCustomer` so the office can see where it came from.
  const id = `WO-${Math.floor(Math.random() * 9000) + 1000}`;
  state.work.unshift({
    id,
    siteId: site.id,
    title: `${meta.label} — ${site.name}`,
    site: `${site.company} · ${site.name}`,
    priority: meta.priority,
    type: 'Müşteri talebi',
    visitType: kind,
    due: when,
    tech: 'Atanmadı',
    description: note,
    requestedByCustomer: true,
    requestedAt: new Date().toLocaleString('tr-TR')
  });
  save();

  $('#modal').classList.add('hidden');
  renderCustomerHome();
  toast(`${meta.label} talebiniz alındı (${id}). Operasyon ekibi en kısa sürede dönüş yapacak.`);
  return true;
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
