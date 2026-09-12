// Modal dialogs, quick-schedule, QR sticker printing.
// Extracted from app.js (Phase 0a-3).

import { $, toast, esc } from '../core/dom.js';
import { save, state } from '../core/state.js';
import { ui } from '../core/session.js';
import { renderDashboard } from '../views/dashboard.js';
import { renderWork } from '../views/work.js';
import { renderCalendarGrid } from '../ui/calendar.js';
import { supabase } from '../core/supabase.js';

// Click-to-place location picker for the create/edit site forms.
//
// The lat/lng fields used to be plain number inputs with a hint suggesting the
// admin look their own facility's coordinates up on Google Maps and paste them
// in — something nobody actually does. An address is what a real admin has on
// hand (the form already asks for it); a point on a map they can click is the
// only other input that costs them nothing to give. This mirrors team.js's
// ensureMap() pattern (same tiles, same "container must be visible first"
// caveat) but stays local to this file rather than being extracted, since nothing
// else needs a single-pin picker.
function mountSiteLocationPicker(containerId, initialLat, initialLng) {
  const host = document.getElementById(containerId);
  if (!host || typeof L === 'undefined') return;

  // Same provider as team.js's ensureMap() — see that comment for why CARTO's
  // anonymous basemap CDN was dropped in favour of OpenStreetMap's own tiles.
  const map = L.map(containerId, { zoomControl: true, attributionControl: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    subdomains: 'abc', maxZoom: 19
  }).addTo(map);

  const hasInitial = Number.isFinite(initialLat) && Number.isFinite(initialLng);
  map.setView(hasInitial ? [initialLat, initialLng] : [39.5, 33.5], hasInitial ? 14 : 5.5);

  const form = host.closest('form');
  const latInput = form?.querySelector('input[name="lat"]');
  const lngInput = form?.querySelector('input[name="lng"]');
  let marker = hasInitial ? L.marker([initialLat, initialLng]).addTo(map) : null;

  map.on('click', (e) => {
    const { lat, lng } = e.latlng;
    if (marker) marker.setLatLng(e.latlng);
    else marker = L.marker(e.latlng).addTo(map);
    if (latInput) latInput.value = lat.toFixed(6);
    if (lngInput) lngInput.value = lng.toFixed(6);
  });

  // Same fix as team.js: a map built while its container was still settling
  // into the modal's layout measures itself wrong until nudged once more.
  setTimeout(() => map.invalidateSize(), 80);
}

// Set by app.js at boot to views/sites.js's activeSiteFilters(), so the
// siteFilters branch below can prefill the form without modal.js importing
// from sites.js — sites.js already imports `modal` from here, and the reverse
// import would be circular.
// { get, apply, clear } supplied by app.js at boot, wired to views/sites.js's
// activeSiteFilters()/setSiteFilters()/clearSiteFilters(). Avoids modal.js
// importing sites.js directly — sites.js already imports `modal` from here,
// and the reverse import would be circular.
let siteFiltersApi = null;
export function registerSiteFilters(api) { siteFiltersApi = api; }

export function modal(type, siteId = null) {
  const content = $('#modalContent');
  const modalEl = $('#modal');
  if (!content || !modalEl) return;
  
  if (type === 'site') {
    content.innerHTML = `
      <h2>Yeni Tesis & Sözleşme Ekle</h2>
      <p class="text-muted" style="margin-bottom:12px;">Portföyünüze yeni bir müşteri lokasyonu, sözleşme bedeli ve periyotları tanımlayın.</p>
      
      <form class="form-grid" id="createSite" style="max-height:480px; overflow-y:auto; padding-right:6px; display:grid; gap:12px; grid-template-columns: 1fr 1fr;">
        <div style="grid-column: span 2; font-weight:700; font-size:11px; color:var(--muted); border-bottom:1px solid var(--line); padding-bottom:4px; text-transform:uppercase;">FİRMA VE LOKASYON TANIMI</div>
        <label class="form-label">
          Firma Adı (Müşteri)
          <input required type="text" name="company" placeholder="Örn: Acme Foods" class="form-input">
        </label>
        <label class="form-label">
          Tesis / Lokasyon Adı
          <input required type="text" name="siteName" placeholder="Örn: Gebze Üretim Tesisi" class="form-input">
        </label>
        <label class="form-label" style="grid-column: span 2;">
          Bulunduğu Şehir
          <input required type="text" name="city" placeholder="Örn: Kocaeli" class="form-input">
        </label>
        
        <div style="grid-column: span 2; font-weight:700; font-size:11px; color:var(--muted); border-bottom:1px solid var(--line); padding-bottom:4px; text-transform:uppercase; margin-top:6px;">MÜŞTERİ YETKİLİ BİLGİLERİ</div>
        <label class="form-label">
          Yetkili Temsilci
          <input required type="text" name="contactName" placeholder="Örn: Ahmet Yılmaz" class="form-input">
        </label>
        <label class="form-label">
          İletişim Telefonu
          <input required type="text" name="contactPhone" placeholder="Örn: +90 532 123 4567" class="form-input">
        </label>
        <label class="form-label" style="grid-column: span 2;">
          E-Posta Adresi
          <input required type="email" name="contactEmail" placeholder="Örn: ahmet@acmefoods.com" class="form-input">
        </label>
        
        <div style="grid-column: span 2; font-weight:700; font-size:11px; color:var(--muted); border-bottom:1px solid var(--line); padding-bottom:4px; text-transform:uppercase; margin-top:6px;">SÖZLEŞME & ADRES BİLGİLERİ</div>
        <label class="form-label">
          Sözleşme Kapsamı (Tarih Periyodu)
          <input required type="text" name="contractPeriod" placeholder="Örn: 01.01.2026 - 31.12.2026" class="form-input">
        </label>
        <label class="form-label">
          Hizmet Periyodu (Açıklama)
          <input required type="text" name="serviceFrequency" placeholder="Örn: 15 Günde Bir" class="form-input">
        </label>
        <label class="form-label" style="grid-column: span 2;">
          Tesis Adresi
          <input required type="text" name="address" placeholder="Örn: Gebze Organize Sanayi Bölgesi, Kocaeli" class="form-input">
        </label>
        <div class="form-label" style="grid-column: span 2;">
          Harita Konumu (opsiyonel)
          <div id="createSiteMap" class="site-location-picker"></div>
          <small class="text-muted" style="font-weight:normal;">Tesisin bulunduğu noktaya tıklayın. İşaretlenirse tesis Ekip &amp; rota haritasında görünür — işaretlenmezse tesis yine oluşturulur, sadece o haritada görünmez.</small>
          <input type="hidden" name="lat">
          <input type="hidden" name="lng">
        </div>

        <div style="grid-column: span 2; font-weight:700; font-size:11px; color:var(--muted); border-bottom:1px solid var(--line); padding-bottom:4px; text-transform:uppercase; margin-top:6px;">VERGİLENDİRME & MALİ BİLGİLER</div>
        <label class="form-label">
          Vergi Dairesi
          <input type="text" name="taxOffice" placeholder="Örn: Gebze VD" class="form-input">
        </label>
        <label class="form-label">
          Vergi Numarası
          <input type="text" name="taxNo" placeholder="Örn: 1234567890" class="form-input">
        </label>
        
        <label class="form-label">
          Yıllık Bedel (₺)
          <input required type="number" name="annualPrice" placeholder="Örn: 48000" class="form-input">
        </label>
        <label class="form-label">
          Aylık Bedel (₺)
          <input required type="number" name="monthlyPrice" placeholder="Örn: 4000" class="form-input">
        </label>
        <label class="form-label">
          Ek Servis Bedeli (₺)
          <input required type="number" name="extraVisitPrice" placeholder="Örn: 750" class="form-input">
        </label>
        <label class="form-label">
          Acil Çağrı Bedeli (₺)
          <input required type="number" name="emergencyCallPrice" placeholder="Örn: 1500" class="form-input">
        </label>
        
        <div style="grid-column: span 2; font-weight:700; font-size:11px; color:var(--muted); border-bottom:1px solid var(--line); padding-bottom:4px; text-transform:uppercase; margin-top:6px;">HİZMET KAPSAMI FREKANSLARI (AYLIK HEDEF)</div>
        <label class="form-label">
          Dış Alan Kemirgen (Ziyaret/Ay)
          <input required type="number" name="freqOutdoorRodent" value="2" class="form-input">
        </label>
        <label class="form-label">
          İç Alan Kemirgen (Ziyaret/Ay)
          <input required type="number" name="freqIndoorRodent" value="4" class="form-input">
        </label>
        <label class="form-label">
          Yürüyen Haşere (Ziyaret/Ay)
          <input required type="number" name="freqCrawlingPest" value="4" class="form-input">
        </label>
        <label class="form-label">
          Uçan Haşere (Ziyaret/Ay)
          <input required type="number" name="freqFlyingPest" value="4" class="form-input">
        </label>
        <label class="form-label" style="grid-column: span 2;">
          Depo Zararlısı (Ziyaret/Ay)
          <input required type="number" name="freqStoragePest" value="4" class="form-input">
        </label>
        
        <button type="submit" class="primary-btn" style="grid-column: span 2; justify-content:center; margin-top:10px; height:38px;">＋ Tesis Kaydet</button>
      </form>
    `;
    // Leaflet needs the container laid out and visible before it can measure
    // itself; classList.remove('hidden') below runs synchronously right after
    // this branch, so a deferred callback is enough — no need to move it.
    setTimeout(() => mountSiteLocationPicker('createSiteMap', null, null), 30);
  } else if (type === 'editSite') {
    const s = state.sites.find(site => site.id === siteId);
    if (!s) return;
    
    const sc = s.serviceScope || { outdoorRodent: { frequency: 2 }, indoorRodent: { frequency: 4 }, crawlingPest: { frequency: 4 }, flyingPest: { frequency: 4 }, storagePest: { frequency: 4 } };
    const co = s.contract || { taxOffice: '', taxNo: '', annualPrice: 0, monthlyPrice: 0, extraVisitPrice: 0, emergencyCallPrice: 0, period: '' };
    
    content.innerHTML = `
      <h2>Tesis Sözleşme & Kapsam Düzenle</h2>
      <p class="text-muted" style="margin-bottom:12px;">${esc(s.company)} - ${esc(s.name)} sözleşme bedelleri ve periyodik hizmet kapsamları.</p>
      
      <form class="form-grid" id="editSiteForm" data-site-id="${esc(s.id)}" style="max-height:480px; overflow-y:auto; padding-right:6px; display:grid; gap:12px; grid-template-columns: 1fr 1fr;">
        <div style="grid-column: span 2; font-weight:700; font-size:11px; color:var(--muted); border-bottom:1px solid var(--line); padding-bottom:4px; text-transform:uppercase;">MÜŞTERİ YETKİLİ BİLGİLERİ</div>
        <label class="form-label">
          Yetkili Temsilci
          <input required type="text" name="contactName" value="${esc(s.contact?.name || '')}" class="form-input">
        </label>
        <label class="form-label">
          İletişim Telefonu
          <input required type="text" name="contactPhone" value="${esc(s.contact?.phone || '')}" class="form-input">
        </label>
        <label class="form-label" style="grid-column: span 2;">
          E-Posta Adresi
          <input required type="email" name="contactEmail" value="${esc(s.contact?.email || '')}" class="form-input">
        </label>
        
        <div style="grid-column: span 2; font-weight:700; font-size:11px; color:var(--muted); border-bottom:1px solid var(--line); padding-bottom:4px; text-transform:uppercase; margin-top:6px;">SÖZLEŞME & ADRES BİLGİLERİ</div>
        <label class="form-label">
          Sözleşme Kapsamı (Tarih Periyodu)
          <input required type="text" name="contractPeriod" value="${esc(co.period || '')}" placeholder="Örn: 01.01.2026 - 31.12.2026" class="form-input">
        </label>
        <label class="form-label">
          Hizmet Periyodu (Açıklama)
          <input required type="text" name="serviceFrequency" value="${esc(s.serviceFrequency || '15 Günde Bir')}" placeholder="Örn: 15 Günde Bir" class="form-input">
        </label>
        <label class="form-label" style="grid-column: span 2;">
          Tesis Adresi
          <input required type="text" name="address" value="${esc(s.address || '')}" class="form-input">
        </label>
        <div class="form-label" style="grid-column: span 2;">
          Harita Konumu (opsiyonel)
          <div id="editSiteMap" class="site-location-picker"></div>
          <small class="text-muted" style="font-weight:normal;">${s.lat != null && s.lng != null
            ? 'Bu tesis Ekip &amp; rota haritasında görünüyor. Konumu değiştirmek için haritaya yeniden tıklayın.'
            : 'Tesisin bulunduğu noktaya tıklayın — işaretlenirse tesis Ekip &amp; rota haritasında görünmeye başlar.'}</small>
          <input type="hidden" name="lat" value="${s.lat === null || s.lat === undefined ? '' : esc(s.lat)}">
          <input type="hidden" name="lng" value="${s.lng === null || s.lng === undefined ? '' : esc(s.lng)}">
        </div>

        <div style="grid-column: span 2; font-weight:700; font-size:11px; color:var(--muted); border-bottom:1px solid var(--line); padding-bottom:4px; text-transform:uppercase; margin-top:6px;">VERGİLENDİRME & MALİ BİLGİLER</div>
        <label class="form-label">
          Vergi Dairesi
          <input type="text" name="taxOffice" value="${esc(co.taxOffice || '')}" class="form-input">
        </label>
        <label class="form-label">
          Vergi Numarası
          <input type="text" name="taxNo" value="${esc(co.taxNo || '')}" class="form-input">
        </label>
        
        <label class="form-label">
          Yıllık Bedel (₺)
          <input required type="number" name="annualPrice" value="${esc(co.annualPrice || 0)}" class="form-input">
        </label>
        <label class="form-label">
          Aylık Bedel (₺)
          <input required type="number" name="monthlyPrice" value="${esc(co.monthlyPrice || 0)}" class="form-input">
        </label>
        <label class="form-label">
          Ek Servis Bedeli (₺)
          <input required type="number" name="extraVisitPrice" value="${esc(co.extraVisitPrice || 0)}" class="form-input">
        </label>
        <label class="form-label">
          Acil Çağrı Bedeli (₺)
          <input required type="number" name="emergencyCallPrice" value="${esc(co.emergencyCallPrice || 0)}" class="form-input">
        </label>
        
        <div style="grid-column: span 2; font-weight:700; font-size:11px; color:var(--muted); border-bottom:1px solid var(--line); padding-bottom:4px; text-transform:uppercase; margin-top:6px;">HİZMET KAPSAMI FREKANSLARI (AYLIK HEDEF)</div>
        <label class="form-label">
          Dış Alan Kemirgen (Ziyaret/Ay)
          <input required type="number" name="freqOutdoorRodent" value="${esc(sc.outdoorRodent?.frequency || 2)}" class="form-input">
        </label>
        <label class="form-label">
          İç Alan Kemirgen (Ziyaret/Ay)
          <input required type="number" name="freqIndoorRodent" value="${esc(sc.indoorRodent?.frequency || 4)}" class="form-input">
        </label>
        <label class="form-label">
          Yürüyen Haşere (Ziyaret/Ay)
          <input required type="number" name="freqCrawlingPest" value="${esc(sc.crawlingPest?.frequency || 4)}" class="form-input">
        </label>
        <label class="form-label">
          Uçan Haşere (Ziyaret/Ay)
          <input required type="number" name="freqFlyingPest" value="${esc(sc.flyingPest?.frequency || 4)}" class="form-input">
        </label>
        <label class="form-label" style="grid-column: span 2;">
          Depo Zararlısı (Ziyaret/Ay)
          <input required type="number" name="freqStoragePest" value="${esc(sc.storagePest?.frequency || 4)}" class="form-input">
        </label>
        
        <button type="submit" class="primary-btn" style="grid-column: span 2; justify-content:center; margin-top:10px; height:38px;">✓ Değişiklikleri Kaydet</button>
      </form>
    `;
    setTimeout(() => mountSiteLocationPicker('editSiteMap', s.lat, s.lng), 30);
  } else if (type === 'work') {
    const siteOptions = state.sites.map(s => `<option value="${esc(s.name)}">${esc(s.company)} - ${esc(s.name)}</option>`).join('');
    // Real technicians only — no more hardcoded demo names. An org that
    // hasn't invited anyone yet gets a disabled placeholder instead of a
    // silently-fake roster (see src/data/repo/technicians.js).
    const techOptions = state.technicians.length
      ? state.technicians.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')
      : `<option value="" disabled selected>Önce Ekip sayfasından teknisyen davet edin</option>`;
    content.innerHTML = `
      <h2>Yeni İş Emri Oluştur</h2>
      <p class="text-muted">Teknisyenler için periyodik veya acil servis ziyareti planlayın.</p>
      <form class="form-grid" id="createWork">
        <label class="form-label">
          İş Emri Başlığı / Tanımı
          <input required type="text" name="title" placeholder="Örn: Rutin İlaçlama ve UV Cihaz Kontrolü" class="form-input">
        </label>
        <label class="form-label">
          İlgili Tesis
          <select name="site" class="form-select" style="height:37px; padding:0 8px; font-size:12px; border:1px solid var(--line); border-radius:7px;">${siteOptions}</select>
        </label>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          <label class="form-label">
            Ziyaret Zamanı
            <input required type="datetime-local" name="dueDate" class="form-input" style="height:37px; border:1px solid var(--line); border-radius:7px; padding:0 8px; font-size:12px;">
          </label>
          <label class="form-label">
            Öncelik Durumu
            <select name="priority" class="form-select" style="height:37px; padding:0 8px; font-size:12px; border:1px solid var(--line); border-radius:7px;">
              <option value="Normal">Normal</option>
              <option value="Yüksek">Yüksek</option>
              <option value="Kritik">Kritik / Acil</option>
            </select>
          </label>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          <label class="form-label">
            Görevlendirilecek Teknisyen
            <select required name="tech" class="form-select" style="height:37px; padding:0 8px; font-size:12px; border:1px solid var(--line); border-radius:7px;">${techOptions}</select>
          </label>
          <label class="form-label">
            Ziyaret Türü
            <select name="visitType" class="form-select" style="height:37px; padding:0 8px; font-size:12px; border:1px solid var(--line); border-radius:7px;">
              <option value="RZ">Rutin Ziyaret</option>
              <option value="TZ">Takip Ziyareti</option>
              <option value="AC">Acil Çağrı / Call-out</option>
              <option value="IZ">İlaçlama Ziyareti</option>
              <option value="ILK">İlk Ziyaret</option>
              <option value="ES">Ek Servis</option>
              <option value="3G">3. Göz Denetim & Audit</option>
              <option value="DZ">Dezenfeksiyon</option>
            </select>
          </label>
        </div>
        <button type="submit" class="primary-btn" style="width:100%; justify-content:center; margin-top:10px;">＋ İş Emri Planla</button>
      </form>
    `;
  } else if (type === 'report') {
    const siteOptions = state.sites.map(s => `<option value="${esc(s.id)}">${esc(s.company)} - ${esc(s.name)}</option>`).join('');
    content.innerHTML = `
      <h2>Müşteri Raporu Oluştur</h2>
      <p class="text-muted">Tesis denetim verilerinden audit-ready PDF raporu derleyin.</p>
      <form class="form-grid" id="generateReport">
        <label class="form-label">
          İlgili Tesis
          <select name="siteId" class="form-select" style="height:37px; padding:0 8px; font-size:12px; border:1px solid var(--line); border-radius:7px;">${siteOptions}</select>
        </label>
        <label class="form-label">
          Rapor Kapsamı
          <select name="scope" class="form-select" style="height:37px; padding:0 8px; font-size:12px; border:1px solid var(--line); border-radius:7px;">
            <option value="monthly">Aylık Servis Özeti (Sözleşme)</option>
            <option value="audit">Detaylı BRCGS / AIB Denetim Raporu</option>
            <option value="activity">İstasyon Aktivite & Isı Haritası Analizi</option>
          </select>
        </label>
        <button type="submit" class="primary-btn" style="width:100%; justify-content:center; margin-top:10px;">✓ Rapor Derle & Yayınla</button>
      </form>
    `;
  } else if (type === 'search') {
    content.innerHTML = `
      <h2>Sistem Genelinde Arama</h2>
      <p class="text-muted" style="margin-bottom:12px;">Portföyünüzdeki tesisler, aktif iş emirleri veya teknisyenleri arayın.</p>
      <input type="text" id="modalSearchInput" placeholder="Tesis, iş emri, kimyasal veya teknisyen adı..." class="form-input" style="margin-bottom:14px; font-size:13px; height:38px;">
      <div id="modalSearchResults" style="display:grid; gap:8px; max-height:300px; overflow:auto;">
        <p class="text-muted" style="font-size:11px; text-align:center; padding:10px;">Arama yapmak için en az 2 karakter girin.</p>
      </div>
    `;
    setTimeout(() => {
      const input = $('#modalSearchInput');
      input?.focus();
      input?.addEventListener('input', () => {
        const query = input.value.trim().toLocaleLowerCase('tr');
        const resultsDiv = $('#modalSearchResults');
        if (!resultsDiv) return;
        
        if (query.length < 2) {
          resultsDiv.innerHTML = '<p class="text-muted" style="font-size:11px; text-align:center; padding:10px;">Arama yapmak için en az 2 karakter girin.</p>';
          return;
        }
        
        const matchedSites = state.sites.filter(s => s.company.toLowerCase().includes(query) || s.name.toLowerCase().includes(query) || s.city.toLowerCase().includes(query));
        const matchedWork = state.work.filter(w => w.title.toLowerCase().includes(query) || w.tech.toLowerCase().includes(query) || w.id.toLowerCase().includes(query));
        
        let html = '';
        
        if (matchedSites.length > 0) {
          html += `<div style="font-size:10px; font-weight:700; color:var(--muted); margin-top:6px; text-transform:uppercase;">Tesisler (${matchedSites.length})</div>`;
          html += matchedSites.map(s => `
            <div class="search-result-row search-site-row" data-site-id="${s.id}" style="padding:8px; background:var(--soft); border:1px solid var(--line); border-radius:6px; cursor:pointer; font-size:12px; display:flex; justify-content:space-between; align-items:center;">
              <div><b>${s.company}</b><br><small class="text-muted">${s.name} · ${s.city}</small></div>
              <span class="status-chip secondary" style="font-size:9px;">Git ➔</span>
            </div>
          `).join('');
        }
        
        if (matchedWork.length > 0) {
          html += `<div style="font-size:10px; font-weight:700; color:var(--muted); margin-top:10px; text-transform:uppercase;">İş Emirleri (${matchedWork.length})</div>`;
          html += matchedWork.map(w => `
            <div class="search-result-row search-work-row" data-work-id="${w.id}" style="padding:8px; background:var(--soft); border:1px solid var(--line); border-radius:6px; cursor:pointer; font-size:12px; display:flex; justify-content:space-between; align-items:center;">
              <div><b>${w.id}: ${w.title}</b><br><small class="text-muted">Teknisyen: ${w.tech} · Durum: ${w.completed ? 'Tamamlandı' : 'Açık'}</small></div>
              <span class="status-chip secondary" style="font-size:9px;">Git ➔</span>
            </div>
          `).join('');
        }
        
        resultsDiv.innerHTML = html || '<p class="text-muted" style="font-size:11px; text-align:center; padding:10px;">Eşleşen sonuç bulunamadı.</p>';
      });
    }, 100);
  } else if (type === 'siteFilters') {
    // Real Şehir/Sektör filtering — replaces the "⚙ Filtreler" button's old
    // fabricated toast, which claimed these were applied while filtering
    // nothing. Options are only ever the values actually present in the
    // portfolio; a city or sector nobody has yet is not offered.
    const cities = [...new Set(state.sites.map((s) => s.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
    const sectors = [...new Set(state.sites.map((s) => s.sector).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
    const current = siteFiltersApi ? siteFiltersApi.get() : { city: 'all', sector: 'all' };

    content.innerHTML = `
      <h2>Tesisleri Filtrele</h2>
      <p class="text-muted" style="margin-bottom:14px;">Şehir veya sektöre göre daraltın. Bulunduğunuz durum filtresi ve arama ile birlikte uygulanır.</p>
      <form class="form-grid" id="siteFiltersForm">
        <label class="form-label">
          Şehir
          <select name="city" class="form-select">
            <option value="all">Tümü</option>
            ${cities.map((c) => `<option value="${esc(c)}"${c === current.city ? ' selected' : ''}>${esc(c)}</option>`).join('')
              || ''}
          </select>
          ${!cities.length ? '<small class="text-muted" style="font-weight:normal;">Portföyde henüz şehir bilgisi girilmiş tesis yok.</small>' : ''}
        </label>
        <label class="form-label">
          Sektör
          <select name="sector" class="form-select">
            <option value="all">Tümü</option>
            ${sectors.map((sc) => `<option value="${esc(sc)}"${sc === current.sector ? ' selected' : ''}>${esc(sc)}</option>`).join('')}
          </select>
          ${!sectors.length ? '<small class="text-muted" style="font-weight:normal;">Portföyde henüz sektör bilgisi girilmiş tesis yok.</small>' : ''}
        </label>
        <div style="display:flex; gap:8px; margin-top:6px;">
          <button type="button" class="secondary-btn" id="siteFiltersClear" style="flex:1; justify-content:center;">Temizle</button>
          <button type="submit" class="primary-btn" style="flex:1; justify-content:center;">Uygula</button>
        </div>
      </form>
    `;
    modalEl.classList.remove('hidden');

    $('#siteFiltersClear').addEventListener('click', () => {
      siteFiltersApi?.clear();
      modalEl.classList.add('hidden');
    });
    $('#siteFiltersForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      siteFiltersApi?.apply({ city: f.get('city'), sector: f.get('sector') });
      modalEl.classList.add('hidden');
    });
    return;
  } else if (type === 'inviteTechnician') {
    content.innerHTML = `
      <h2>Teknisyen Davet Et</h2>
      <p class="text-muted" style="margin-bottom:12px;">
        Girdiğiniz e-postaya Supabase üzerinden bir davet gönderilir; teknisyen
        kendi şifresini kendisi belirler, siz görmezsiniz.
      </p>
      <form class="form-grid" id="inviteTechnicianForm" style="display:grid; gap:12px;">
        <label class="form-label">
          Ad Soyad
          <input required type="text" name="fullName" placeholder="Örn: Ayşe Demir" class="form-input">
        </label>
        <label class="form-label">
          E-Posta Adresi
          <input required type="email" name="email" placeholder="Örn: ayse@repellent.com" class="form-input">
        </label>
        <label class="form-label">
          Telefon (opsiyonel)
          <input type="text" name="phone" placeholder="Örn: +90 532 000 0000" class="form-input">
        </label>
        <button type="submit" class="primary-btn" style="width:100%; justify-content:center; margin-top:6px; height:38px;">📨 Davet Gönder</button>
      </form>
    `;
    modalEl.classList.remove('hidden');

    const form = $('#inviteTechnicianForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const fullName = form.fullName.value.trim();
      const email = form.email.value.trim();
      const phone = form.phone.value.trim();

      button.disabled = true;
      button.textContent = 'Gönderiliyor…';
      try {
        const { data, error } = await supabase.functions.invoke('admin-invite-technician', {
          body: { email, full_name: fullName, phone: phone || undefined }
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.message || data.error);

        modalEl.classList.add('hidden');
        toast(`${fullName} davet edildi ✓ — kendi şifresini belirlemesi için ${email} adresine e-posta gönderildi.`);
      } catch (err) {
        // FunctionsHttpError carries the function's JSON body as a Response on
        // `context`. clone() matters: supabase-js's own error-construction
        // already reads the body once, so a second .json() on the same
        // Response throws "body stream already read" — clone() gives us a
        // fresh, unread copy to parse.
        let msg = err?.message || 'Davet gönderilemedi.';
        try {
          const body = await err?.context?.clone?.().json();
          if (body?.message) msg = body.message;
          else if (body?.error === 'email_already_registered') msg = 'Bu e-posta zaten kayıtlı.';
          else if (body?.error === 'forbidden') msg = 'Bu işlem için yönetici yetkisi gerekiyor.';
          else if (body?.error === 'invalid_session') msg = 'Oturumunuz geçersiz — lütfen tekrar giriş yapın.';
        } catch { /* keep the fallback message */ }
        toast(msg);
      } finally {
        button.disabled = false;
        button.textContent = '📨 Davet Gönder';
      }
    });
    return;
  }
  // NOTE: the old type === 'notifications' branch was removed in Wave 4. The
  // bell now opens the notification centre owned by ui/notificationCenter.js, so
  // nothing calls modal('notifications') any more.

  modalEl.classList.remove('hidden');
}

// Event bindings

export function openQuickScheduleModal(day) {
  const content = $('#modalContent');
  const modal = $('#modal');
  if (!content || !modal) return;
  
  const sitesOptions = state.sites.map(s => `<option value="${esc(s.id)}">${esc(s.company)} - ${esc(s.name)}</option>`).join('');
  
  content.innerHTML = `
    <h2>Yeni İş Emri Planla</h2>
    <p class="text-muted">Seçilen Tarih: <b>${esc(day)} Temmuz 2026</b></p>
    <form class="form-grid" id="quickScheduleForm">
      <label class="form-label">
        Tesis & Müşteri Seçin
        <select name="siteId" id="inpSchedSiteId" class="form-select" style="height:37px; padding:0 8px; font-size:12px; border:1px solid var(--line); border-radius:7px;">${sitesOptions}</select>
      </label>
      <label class="form-label">
        İş Emri Başlığı
        <input required type="text" name="title" id="inpSchedTitle" placeholder="Örn: Haşere İnceleme / Jel İlaçlama" class="form-input">
      </label>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
        <label class="form-label">
          Ziyaret Saati
          <input required type="time" name="dueTime" id="inpSchedTime" value="09:00" class="form-input" style="height:37px; border:1px solid var(--line); border-radius:7px; padding:0 8px; font-size:12px;">
        </label>
        <label class="form-label">
          Öncelik Seviyesi
          <select name="priority" id="inpSchedPriority" class="form-select" style="height:37px; padding:0 8px; font-size:12px; border:1px solid var(--line); border-radius:7px;">
            <option value="normal">Normal Öncelik</option>
            <option value="high">Yüksek Öncelik</option>
            <option value="critical">Acil / Kritik</option>
          </select>
        </label>
      </div>
      <label class="form-label">
        Görevlendirilecek Teknisyen
        <select name="tech" id="inpSchedTech" class="form-select" style="height:37px; padding:0 8px; font-size:12px; border:1px solid var(--line); border-radius:7px;">
          <option value="Ayşe Demir">Ayşe Demir (Baş Teknisyen)</option>
          <option value="Mert Kaya">Mert Kaya (Teknisyen)</option>
          <option value="Ece Yılmaz">Ece Yılmaz (Dezenfeksiyon Uzmanı)</option>
          <option value="Can Öztürk">Can Öztürk (Saha Ekibi)</option>
        </select>
      </label>
      <button type="submit" class="primary-btn" style="width:100%; justify-content:center; margin-top:10px;">📅 Randevu Oluştur</button>
    </form>
  `;
  
  modal.classList.remove('hidden');
  
  const form = $('#quickScheduleForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const selectedSite = state.sites.find(s => s.id === $('#inpSchedSiteId').value);
    const title = $('#inpSchedTitle').value;
    const priority = $('#inpSchedPriority').value;
    const dueTime = $('#inpSchedTime').value;
    const assignedTech = $('#inpSchedTech').value;
    
    const newWo = {
      id: `WO-${Math.floor(2000 + Math.random() * 1000)}`,
      siteId: selectedSite.id,
      title: title,
      site: `${selectedSite.company} · ${selectedSite.name}`,
      priority: priority,
      type: 'Planlı servis',
      due: `${day} Tem, ${dueTime}`,
      tech: assignedTech,
      description: 'Sözleşme kapsamında periyodik saha denetimi.'
    };
    
    state.work.push(newWo);
    save();
    modal.classList.add('hidden');
    renderWork();
    renderCalendarGrid();
    renderDashboard();
    toast(`İş emri ${day} Temmuz için başarıyla oluşturuldu ve ${assignedTech} personeline atandı.`);
  });
}

export function printQrCodeSticker(code) {
  const content = $('#modalContent');
  const modal = $('#modal');
  if (!content || !modal) return;
  
  const site = state.sites.find(s => s.id === ui.activeSiteId);
  if (!site) return;
  const s = site.stations.find(st => st.code === code);
  if (!s) return;
  
  const typeNames = { rodent: 'Kemirgen İstasyonu', crawler: 'Yürüyen Haşere Monitörü', flying: 'Uçan Haşere Cihazı', insect_light_trap: 'UV Işıklı Cihaz' };
  
  content.innerHTML = `
    <div style="text-align:center; padding:10px;">
      <h2 style="font-size:18px; margin-bottom:4px;">QR Kod Etiket Baskı Önizleme</h2>
      <p class="text-muted" style="font-size:11px; margin-bottom:20px;">Termal rulo etiket yazıcıları için uygundur.</p>
      
      <div id="qrPrintArea" style="width:220px; margin:0 auto; padding:15px; border:3px double #000; border-radius:8px; text-align:center; background:#fff; color:#000;">
        <div style="font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">REPELLENT OPERATIONS</div>
        
        <div style="width:110px; height:110px; margin: 0 auto; border:4px solid #000; padding:4px; display:flex; flex-direction:column; gap:6px; justify-content:center; align-items:center; background:#fff; position:relative;">
          <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:6px; width:90px; height:90px;">
            <div style="background:#000;"></div><div style="background:#000;"></div><div></div><div style="background:#000;"></div>
            <div></div><div style="background:#000;"></div><div style="background:#000;"></div><div></div>
            <div style="background:#000;"></div><div></div><div style="background:#000;"></div><div style="background:#000;"></div>
            <div style="background:#000;"></div><div style="background:#000;"></div><div></div><div style="background:#000;"></div>
          </div>
          <div style="position:absolute; width:25px; height:25px; background:#fff; border:3px solid #000; top:6px; left:6px;"></div>
          <div style="position:absolute; width:25px; height:25px; background:#fff; border:3px solid #000; top:6px; right:6px;"></div>
          <div style="position:absolute; width:25px; height:25px; background:#fff; border:3px solid #000; bottom:6px; left:6px;"></div>
        </div>
        
        <h4 style="font-size:22px; font-weight:900; margin:10px 0 2px;">${esc(s.code)}</h4>
        <div style="font-size:9px; font-weight:700; color:#555; text-transform:uppercase; margin-bottom:4px;">${esc(typeNames[s.type] || s.type)}</div>
        <div style="font-size:8px; color:#888;">${esc(site.company)} - ${esc(site.name)}</div>
        <div style="font-size:7px; color:#aaa; margin-top:2px;">Cihaz ID: INS-ST-${esc(site.id)}-${esc(s.code)}</div>
      </div>
      
      <div style="margin-top:24px; display:flex; gap:10px; justify-content:center;">
        <button class="secondary-btn" onclick="document.querySelector('#modal').classList.add('hidden')">Kapat</button>
        <button class="primary-btn" onclick="window.print()">🖨 Yazdır</button>
      </div>
    </div>
  `;
  
  modal.classList.remove('hidden');
}
