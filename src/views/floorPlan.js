// Facility plan management: upload a real floor plan and place monitoring
// points on it (tasks 8-4 / 8-5).
//
// Roadmap §3: "Her bir zararlı kontrol noktası ... her bir noktaya bir numara
// verilir ve barkod ve konum bilgisi ile tanımlanır. Buna sistem kurulumu denir
// ve ... tesisin bir haritası oluşmuş olur." That founding workflow — upload the
// plan, place the points, get a map — could not be performed in the app at all:
// every facility rendered the same built-in five-room SVG, and stations only
// ever came from the seed.
//
// Everything here writes to `site.floorPlan` / `site.stations` and persists via
// the normal save(), so a placed point is immediately real to the rest of the
// product: it appears on the plan, in the placement list, in the QR sheet and in
// the reports.

import { $, $$, toast } from '../core/dom.js';
import { state, save, recalculateSiteStats } from '../core/state.js';
import { ui } from '../core/session.js';
import { equipmentTypes, getPlacementSchema } from '../data/catalog.js';
import { barcodeFor } from '../data/history.js';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const activeSite = () => state.sites.find((s) => s.id === ui.activeSiteId);
const isAdmin = () => state.currentUser && state.currentUser.role === 'admin';

// Placement mode + drag bookkeeping. View-local: nothing outside this module
// reads it.
const mode = { placing: false, drag: null, movedDuringDrag: false };

/* ------------------------------------------------------------ plan image */

// Uploaded plans are downscaled before they are stored. State is persisted to
// localStorage *and* PUT to the server on every save(), so a 6 MB phone photo
// would blow the quota and stall each write. 1400 px is plenty to place points
// against and keeps a typical plan under ~300 KB.
const MAX_PLAN_WIDTH = 1400;
const PLAN_QUALITY = 0.72;

function downscale(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read-failed'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('decode-failed'));
      img.onload = () => {
        const scale = Math.min(1, MAX_PLAN_WIDTH / img.width);
        // An SVG has no useful raster size and stays crisp at any zoom, so it is
        // stored as-is rather than rasterised into a blurry PNG.
        if (file.type === 'image/svg+xml') {
          resolve({ dataUrl: reader.result, width: img.width, height: img.height });
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({
          dataUrl: canvas.toDataURL('image/jpeg', PLAN_QUALITY),
          width: canvas.width,
          height: canvas.height
        });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/** Show the site's uploaded plan, or fall back to the built-in blueprint. */
export function renderFloorPlan(site) {
  const img = $('#floorPlanImage');
  const svg = $('.blueprint-svg');
  const removeBtn = $('#btnRemovePlan');
  const note = $('#planSourceNote');
  if (!img || !svg) return;

  const plan = site && site.floorPlan;
  if (plan && plan.dataUrl) {
    img.src = plan.dataUrl;
    img.classList.remove('hidden');
    svg.classList.add('hidden');
    removeBtn?.classList.remove('hidden');
    if (note) note.textContent = `${plan.name || 'Yüklenen plan'} · ${plan.uploadedAt || ''}`;
  } else {
    img.removeAttribute('src');
    img.classList.add('hidden');
    svg.classList.remove('hidden');
    removeBtn?.classList.add('hidden');
    if (note) note.textContent = 'Örnek şablon plan — kendi kat planınızı yükleyebilirsiniz.';
  }

  // Only an admin may reshape a facility. Gated here as well as in
  // applyRoleAccess() because this runs on every facility open, which can
  // happen after role access has already been applied.
  const admin = isAdmin();
  $('#btnAddStation')?.classList.toggle('hidden', !admin);
  $('#planUploadLabel')?.classList.toggle('hidden', !admin);
  $('#btnDeleteStation')?.classList.toggle('hidden', !admin);
  if (!admin) removeBtn?.classList.add('hidden');
}

export function bindFloorPlanInputs() {
  $('#floorPlanInput')?.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';                       // allow re-picking the same file
    if (!file) return;

    const site = activeSite();
    if (!site) return;
    if (!/^image\//.test(file.type)) { toast('Lütfen bir görsel dosyası seçin (PNG, JPG veya SVG).'); return; }
    if (file.size > 12 * 1024 * 1024) { toast('Dosya çok büyük (en fazla 12 MB).'); return; }

    try {
      const { dataUrl, width, height } = await downscale(file);
      site.floorPlan = {
        dataUrl,
        name: file.name,
        width,
        height,
        uploadedAt: new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
      };
      save();
      renderFloorPlan(site);
      // The zone column is plan-dependent: with a custom plan the built-in room
      // names no longer apply, so the tables have to be rebuilt too.
      refreshPlanViews(site);
      toast(`Kat planı yüklendi — ${file.name}. Artık istasyonları plan üzerine yerleştirebilirsiniz.`);
    } catch {
      toast('Kat planı okunamadı. Farklı bir dosya deneyin.');
    }
  });
}

/* ---------------------------------------------------- station code helper */

/**
 * Next free code for an equipment type at a site: R-01, R-02, … Codes are the
 * permanent identity a point's history hangs off (§8), so a code is never
 * reused even after a point is removed — the highest existing number wins.
 */
export function nextStationCode(site, type) {
  const prefix = (equipmentTypes[type] || {}).prefix || 'P';
  let max = 0;
  for (const s of site.stations || []) {
    const m = String(s.code).match(new RegExp(`^${prefix}-(\\d+)$`));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${String(max + 1).padStart(2, '0')}`;
}

/* ------------------------------------------------------------- placement */

function openPlacementForm(site, x, y) {
  const content = $('#modalContent');
  const modalEl = $('#modal');
  if (!content || !modalEl) return;

  const defaultType = 'rodent_bait';
  const types = Object.entries(equipmentTypes)
    // The legacy aliases duplicate the roadmap types under old keys; offering
    // both would put "Kemirgen Yem İstasyonu" in the list twice.
    .filter(([key]) => !['rodent', 'crawler', 'flying', 'insect_light_trap'].includes(key));

  content.innerHTML = `
    <h2>Yeni Kontrol Noktası</h2>
    <p class="text-muted" style="margin-bottom:14px;">
      Plan üzerinde seçilen konum: <b>%${x.toFixed(1)} / %${y.toFixed(1)}</b>.
      Noktaya otomatik numara ve barkod atanır.
    </p>
    <form id="newStationForm" class="form-grid" style="display:grid; gap:12px;">
      <input type="hidden" name="x" value="${x}" />
      <input type="hidden" name="y" value="${y}" />
      <label class="form-label">
        <span>Ekipman Türü</span>
        <select name="type" id="newStationType">
          ${types.map(([key, t]) =>
            `<option value="${esc(key)}"${key === defaultType ? ' selected' : ''}>${esc(t.icon)} ${esc(t.name)}</option>`).join('')}
        </select>
      </label>
      <label class="form-label">
        <span>Nokta Numarası</span>
        <input type="text" name="code" id="newStationCode" value="${esc(nextStationCode(site, defaultType))}" required />
      </label>
      <label class="form-label">
        <span>Bölge Adı</span>
        <input type="text" name="areaName" placeholder="Örn: Hammadde Deposu" />
      </label>
      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:6px;">
        <button type="button" class="secondary-btn" data-plan-cancel="1">Vazgeç</button>
        <button type="submit" class="primary-btn">Noktayı Ekle</button>
      </div>
    </form>`;

  // Keep the suggested code in step with the chosen equipment type.
  $('#newStationType')?.addEventListener('change', (e) => {
    const codeInput = $('#newStationCode');
    if (codeInput) codeInput.value = nextStationCode(site, e.target.value);
  });

  modalEl.classList.remove('hidden');
}

export function newStationSubmit(e) {
  if (e.target.id !== 'newStationForm') return false;
  e.preventDefault();

  const site = activeSite();
  if (!site) return true;

  const f = new FormData(e.target);
  const code = String(f.get('code') || '').trim();
  const type = String(f.get('type') || 'rodent_bait');
  const areaName = String(f.get('areaName') || '').trim();

  if (!code) { toast('Nokta numarası zorunludur.'); return true; }
  if ((site.stations || []).some((s) => s.code === code)) {
    toast(`"${code}" bu tesiste zaten kullanılıyor.`);
    return true;
  }

  if (!site.stations) site.stations = [];
  site.stations.push({
    code,
    type,
    // Rounded to 0.1% like a drag does — raw pointer maths yields 16 decimals,
    // which then leaks into state, the CSV exports and the placement sheet.
    x: Math.round(Number(f.get('x')) * 10) / 10,
    y: Math.round(Number(f.get('y')) * 10) / 10,
    checked: false,
    status: 'unchecked',
    baitStatus: 'intact',
    pestType: 'none',
    pestCount: 0,
    notes: '',
    placement: areaName ? { areaName, pointNo: code.replace(/^\D+-?/, '') } : undefined,
    plantedDate: new Date().toLocaleDateString('tr-TR')
  });

  recalculateSiteStats(site);
  save();
  $('#modal').classList.add('hidden');
  mode.placing = false;
  $('#blueprintWrapper')?.classList.remove('placing');
  $('#btnAddStation')?.classList.remove('active');

  refreshPlanViews(site);
  toast(`${code} eklendi · barkod ${barcodeFor(site.id, code, 1)}`);
  return true;
}

// Re-render the surfaces that list stations, so a placed point is immediately
// real rather than appearing only after a reload.
//
// Deliberately not showCompanyDetail(): that re-renders the whole facility page
// and resets the tab to "Genel Bakış", throwing the user off the plan they are
// working on. The counters are recomputed here because they live inline in
// showCompanyDetail and have no separate renderer to call.
function refreshPlanViews(site) {
  const stations = site.stations || [];
  const counts = {
    facilityTotalStations: stations.length,
    facilityCheckedClean: stations.filter((s) => s.checked && s.status === 'clean').length,
    facilityCheckedActivity: stations.filter((s) => s.checked && s.status === 'activity').length,
    facilityDamaged: stations.filter((s) => s.checked && (s.status === 'damaged' || s.status === 'missing')).length,
    facilityUnchecked: stations.filter((s) => !s.checked).length
  };
  for (const [id, value] of Object.entries(counts)) {
    const el = document.querySelector(`#paneCompMap #${id}`);
    if (el) el.textContent = value;
  }

  // Dynamic import keeps this module out of an import cycle with companyDetail,
  // which imports floorPlan for renderFloorPlan(). Resolves from the module
  // registry, so it is a cache hit after first use.
  import('./companyDetail.js').then((m) => {
    m.renderStationMarkers(stations, $('[data-station-filter].active')?.dataset.stationFilter || 'all');
    m.renderCompanyStationsTable(site);
  }).catch(() => { /* renderers live in companyDetail; ignore if unavailable */ });
}

/* ------------------------------------------------------------- dragging */

// Percentage coordinates of a pointer event inside the plan wrapper.
function pointPercent(evt, wrapper) {
  const r = wrapper.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(100, ((evt.clientX - r.left) / r.width) * 100)),
    y: Math.max(0, Math.min(100, ((evt.clientY - r.top) / r.height) * 100))
  };
}

export function planPointerDown(e) {
  if (!isAdmin()) return;
  const marker = e.target.closest('.station-marker');
  const wrapper = $('#blueprintWrapper');
  if (!marker || !wrapper || mode.placing) return;

  const site = activeSite();
  const station = site && (site.stations || []).find((s) => s.code === marker.dataset.stationCode);
  if (!station) return;

  mode.drag = { code: station.code, marker, wrapper, startX: e.clientX, startY: e.clientY };
  mode.movedDuringDrag = false;
  marker.setPointerCapture?.(e.pointerId);
  marker.classList.add('dragging');
}

export function planPointerMove(e) {
  const d = mode.drag;
  if (!d) return;
  if (Math.abs(e.clientX - d.startX) < 4 && Math.abs(e.clientY - d.startY) < 4) return;

  mode.movedDuringDrag = true;
  const p = pointPercent(e, d.wrapper);
  d.marker.style.left = `${p.x}%`;
  d.marker.style.top = `${p.y}%`;
}

export function planPointerUp(e) {
  const d = mode.drag;
  if (!d) return;
  d.marker.classList.remove('dragging');
  mode.drag = null;

  if (!mode.movedDuringDrag) return;   // a plain click: let selection handle it

  const site = activeSite();
  const station = site && (site.stations || []).find((s) => s.code === d.code);
  if (station) {
    const p = pointPercent(e, d.wrapper);
    station.x = Math.round(p.x * 10) / 10;
    station.y = Math.round(p.y * 10) / 10;
    save();
    toast(`${station.code} yeni konuma taşındı.`);
  }
}

/* ------------------------------------------------------------- handlers */

export function floorPlanClicks(e) {
  // Swallow the click that ends a drag, so releasing over the plan does not
  // also re-select or place a point.
  if (mode.movedDuringDrag) {
    mode.movedDuringDrag = false;
    return true;
  }

  if (e.target.closest('[data-plan-cancel]')) {
    $('#modal').classList.add('hidden');
    return true;
  }

  if (e.target.closest('#btnAddStation')) {
    const site = activeSite();
    if (!site) return true;
    mode.placing = !mode.placing;
    $('#blueprintWrapper')?.classList.toggle('placing', mode.placing);
    $('#btnAddStation')?.classList.toggle('active', mode.placing);
    toast(mode.placing
      ? 'Yerleştirme modu açık — plan üzerinde noktayı işaretleyin.'
      : 'Yerleştirme modu kapatıldı.');
    return true;
  }

  if (e.target.closest('#btnRemovePlan')) {
    const site = activeSite();
    if (!site || !site.floorPlan) return true;
    delete site.floorPlan;
    save();
    renderFloorPlan(site);
    refreshPlanViews(site);
    toast('Yüklenen plan kaldırıldı, şablon plana dönüldü. İstasyon konumları korundu.');
    return true;
  }

  if (e.target.closest('#btnDeleteStation')) {
    const site = activeSite();
    const code = ui.activeStationCode;
    if (!site || !code) { toast('Önce plan üzerinden bir istasyon seçin.'); return true; }
    const idx = (site.stations || []).findIndex((s) => s.code === code);
    if (idx < 0) return true;
    site.stations.splice(idx, 1);
    ui.activeStationCode = null;
    recalculateSiteStats(site);
    save();
    refreshPlanViews(site);
    $('#stationDetailsEmpty')?.classList.remove('hidden');
    $('#stationDetailsContent')?.classList.add('hidden');
    toast(`${code} silindi. Geçmiş okuma kayıtları raporlarda korunur.`);
    return true;
  }

  // Placement click on the plan itself.
  if (mode.placing) {
    const wrapper = $('#blueprintWrapper');
    if (wrapper && wrapper.contains(e.target)) {
      const site = activeSite();
      if (!site) return true;
      const p = pointPercent(e, wrapper);
      openPlacementForm(site, p.x, p.y);
      return true;
    }
  }

  return false;
}
