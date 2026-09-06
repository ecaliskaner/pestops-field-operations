// Mobile technician simulator: route, job detail, QR, inspection.
// Extracted from app.js (Phase 0a-3).

import { $, $$, toast, esc } from '../core/dom.js';
import { state } from '../core/state.js';
import { ui } from '../core/session.js';
import { chemicalDatabase } from '../data/catalog.js';
import { bothSigned, getSignature, initSignaturePads, isSigned, resetSignaturePads, setSignatureChangeHandler } from '../ui/signature.js';
import { render } from '../core/router.js';
import { recalculateSiteStats, save } from '../core/state.js';
import { calculateDosage, getChemicalDocuments, normalizePestCode, pestNameByCode, pestsForEquipment, visitTypes } from '../data/catalog.js';
import { deductStock, renderInventory } from '../views/inventory.js';

// ===== Offline sync simulation (task 3-3) =====
//
// A self-contained, in-memory outbox — deliberately NOT part of core state.
// While the phone is "offline", each record the technician saves is still
// written to local state (as before) but its *server sync* is deferred: it goes
// into this queue and a live badge counts it. Reconnecting visibly drains the
// queue. This is the demo we want; there is no real backend to sync to.
let offlineMode = false;
let syncQueue = [];
let draining = false;

function updateOfflineUi() {
  const label = $('#phoneNetworkState');
  const badge = $('#offlineQueueBadge');
  const toggle = $('#btnToggleOffline');
  if (label) label.textContent = offlineMode ? '✈ Çevrimdışı' : '📶 Online';
  if (toggle) toggle.classList.toggle('offline', offlineMode);
  if (badge) {
    badge.textContent = String(syncQueue.length);
    badge.classList.toggle('hidden', syncQueue.length === 0);
  }
}

// Record that something needs to reach the server. Online → it "syncs"
// immediately; offline → it waits in the outbox with a visible count.
function syncRecord(label) {
  if (offlineMode) {
    syncQueue.push({ label, at: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) });
    updateOfflineUi();
    addTelemetryLog(`ÇEVRİMDIŞI: "${label}" yerel kuyruğa alındı (bekleyen: ${syncQueue.length}).`);
  } else {
    addTelemetryLog(`SENKRON: "${label}" sunucuya iletildi.`);
  }
}

// Drain the outbox one record at a time so the count visibly ticks down.
function drainQueue() {
  if (draining) return;
  if (!syncQueue.length) { updateOfflineUi(); return; }
  draining = true;
  addTelemetryLog(`BAĞLANTI GERİ GELDİ: ${syncQueue.length} bekleyen kayıt senkronize ediliyor...`);
  const step = () => {
    const item = syncQueue.shift();
    if (item) addTelemetryLog(`↑ Senkronize edildi: "${item.label}" (kalan: ${syncQueue.length}).`);
    updateOfflineUi();
    if (syncQueue.length) {
      setTimeout(step, 420);
    } else {
      draining = false;
      toast('Tüm bekleyen kayıtlar sunucuyla senkronize edildi.');
      addTelemetryLog('BAŞARILI: Çevrimdışı kuyruk tamamen boşaltıldı.');
    }
  };
  setTimeout(step, 300);
}

export function toggleOfflineMode() {
  offlineMode = !offlineMode;
  if (offlineMode) {
    addTelemetryLog('UYARI: Cihaz çevrimdışı moda alındı. Kayıtlar yerelde kuyruğa alınacak.');
    toast('Çevrimdışı mod açık — kayıtlar cihazda tutuluyor.');
    updateOfflineUi();
  } else {
    updateOfflineUi();
    drainQueue();
  }
}

export function renderMobileRoute() {
  const container = $('#mobileWorkOrdersList');
  if (!container) return;
  
  let list = state.work;
  if (state.currentUser && state.currentUser.role === 'tech') {
    list = list.filter(w => w.tech === state.currentUser.name);
  }
  
  container.innerHTML = list.map(w => {
    const site = state.sites.find(s => s.id === w.siteId) || state.sites[0];
    const statusText = w.completed ? 'Tamamlandı' : (w.status === 'started_by_first_qr' ? 'Çalışma Başladı' : (w.status === 'arrived_gps' ? 'Tesise Varış' : 'Planlandı'));
    const badgeClass = w.completed ? 'success' : (w.status === 'started_by_first_qr' ? 'info' : 'warning');
    
    return `
      <div class="mob-order-item" data-mob-work-id="${w.id}">
        <div class="mob-order-header">
          <span class="status-chip ${badgeClass}">${statusText}</span>
          <small>${w.due}</small>
        </div>
        <h4>${site.company}</h4>
        <p>${site.name}</p>
        <p style="margin-top:4px; font-size:9px; color:#78828d">Teknisyen: ${w.tech}</p>
      </div>
    `;
  }).join('');
}

// Signatures belong to one visit only — opening a different job must not
// inherit the previous customer's ink.
let signedJobId = null;

export function showMobileJobDetail(work) {
  if (signedJobId !== work.id) {
    resetSignaturePads();
    const nameInput = $('#inpSigCustomerName');
    if (nameInput) nameInput.value = work.customerSignerName || '';
    signedJobId = work.id;
  }
  ui.mobJob = work;
  ui.mobArrived = work.status === 'arrived_gps' || work.status === 'started_by_first_qr' || work.completed;
  ui.mobQrStarted = work.status === 'started_by_first_qr' || work.completed;
  
  const site = state.sites.find(s => s.id === work.siteId) || state.sites[0];
  
  // Reset download state for this job unless downloaded earlier
  if (site.downloaded) ui.mobOfflineReady = true;
  else ui.mobOfflineReady = false;
  
  $('#mobJobCompany').textContent = site.company.toUpperCase();
  $('#mobJobSiteName').textContent = site.name;
  $('#mobJobTime').textContent = `Ziyaret: ${work.due} · Teknisyen: ${work.tech}`;
  
  const statusText = work.completed ? 'Tamamlandı' : (work.status === 'started_by_first_qr' ? 'Çalışma Başladı' : (work.status === 'arrived_gps' ? 'Tesise Varış' : 'Planlandı'));
  const badgeClass = work.completed ? 'success' : (work.status === 'started_by_first_qr' ? 'info' : 'warning');
  
  $('#mobJobStatusBadge').className = `status-chip ${badgeClass}`;
  $('#mobJobStatusBadge').textContent = statusText;
  
  // Refresh steps
  // 1. GPS Arrival
  const btnGps = $('#btnMobArrived');
  const indGps = $('#indicatorGpsVerified');
  if (ui.mobArrived) {
    btnGps.classList.add('hidden');
    indGps.classList.remove('hidden');
    if ($('#gpsCoordsText')) {
      $('#gpsCoordsText').textContent = "(GPS Konumu Kayıtlı)";
    }
  } else {
    btnGps.classList.remove('hidden');
    indGps.classList.add('hidden');
    if ($('#gpsCoordsText')) {
      $('#gpsCoordsText').textContent = "";
    }
  }
  
  // 2. QR / NFC Start
  const cardQr = $('#cardQrStart');
  const btnQr = $('#btnMobScanFirstQr');
  const btnNfc = $('#btnMobScanFirstNfc');
  const indQr = $('#indicatorQrVerified');
  cardQr.classList.toggle('disabled', !ui.mobArrived);
  btnQr.disabled = !ui.mobArrived;
  if (btnNfc) btnNfc.disabled = !ui.mobArrived;
  if (ui.mobQrStarted) {
    btnQr.classList.add('hidden');
    if (btnNfc) btnNfc.classList.add('hidden');
    indQr.classList.remove('hidden');
  } else {
    btnQr.classList.remove('hidden');
    if (btnNfc) btnNfc.classList.remove('hidden');
    indQr.classList.add('hidden');
  }
  
  // 3. Offline Map
  const cardMap = $('#cardOfflineMap');
  const btnViewPlan = $('#btnMobViewPlan');
  const btnDownload = $('#btnMobDownloadOffline');
  const indOffline = $('#indicatorOfflineReady');
  cardMap.classList.toggle('disabled', !ui.mobQrStarted);
  btnViewPlan.disabled = !ui.mobQrStarted;
  btnDownload.disabled = !ui.mobQrStarted;
  if (ui.mobOfflineReady) {
    btnDownload.classList.add('hidden');
    indOffline.classList.remove('hidden');
  } else {
    btnDownload.classList.remove('hidden');
    indOffline.classList.add('hidden');
  }
  $('#mobDownloadProgress').classList.add('hidden');
  
  // 4. Stations List
  const cardStations = $('#cardStationsList');
  cardStations.classList.toggle('disabled', !ui.mobQrStarted);
  
  // 4b. Chemical Usage
  const cardChem = $('#cardMobChemicalUsage');
  if (cardChem) {
    cardChem.classList.toggle('disabled', !ui.mobQrStarted);
  }
  populateChemicalSelect();
  renderMobChemicalsList(site);

  const checked = site.stations.filter(s => s.checked).length;
  const isComplete = ui.mobQrStarted && checked === site.stations.length;
  const cardSig = $('#cardSignature');
  if (cardSig) {
    cardSig.classList.toggle('disabled', !isComplete);
  }
  
  renderMobileMiniGrid(site);
  updateSimStepsHighlight();

  // Initialize signature canvases if unlocked
  if (isComplete && !work.completed) {
    initSignaturePads();
  }
  updateSignatureGate();

  $('#pageMobileRoute').classList.add('hidden');
  $('#pageMobileJobDetail').classList.remove('hidden');
}

// Reflects signature state into the card and gates the save button. Roadmap
// §10 requires both a customer and a technician signature before a visit can
// be closed, so "all stations checked" alone is no longer enough.
// Shared completion for the entry QR / NFC step — both routes register the same
// real-work-start, differing only in the method label they log (task 3-4).
export function startFirstScan(scannedCode, method) {
  // The QR-camera success callback and the NFC button are both async: the job
  // can be cleared (demo reset, role switch, navigating off the sim) between
  // arming the scan and this firing. Without the guard that lands as an
  // "Cannot set properties of null" crash mid-demo.
  if (!ui.mobJob) return;
  ui.mobQrStarted = true;
  ui.mobJob.status = 'started_by_first_qr';
  ui.mobJob.startMethod = method;
  ui.mobJob.realWorkStartedAt = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  ui.mobJob.startedTimestamp = Date.now();
  save();
  showMobileJobDetail(ui.mobJob);
  addTelemetryLog(`İLK ${method} OKUTULDU: ${scannedCode} ile gerçek mesai başlangıcı tescil edildi!`);
  syncRecord(`Mesai başlangıcı (${method}: ${scannedCode})`);
  toast(`Mesai ${method} ile başladı! İstasyonlar kontrol edilebilir.`);
}

export function updateSignatureGate() {
  const stateCust = $('#sigStateCustomer');
  const stateTech = $('#sigStateTech');
  const gate = $('#sigGateNotice');
  const saveBtn = $('#btnMobSaveForm');
  if (!gate || !saveBtn) return;

  const custOk = isSigned('#sigCanvasCustomer');
  const techOk = isSigned('#sigCanvasTech');

  if (stateCust) {
    stateCust.textContent = custOk ? '✓ İmzalandı' : 'Bekliyor';
    stateCust.classList.toggle('signed', custOk);
  }
  if (stateTech) {
    stateTech.textContent = techOk ? '✓ İmzalandı' : 'Bekliyor';
    stateTech.classList.toggle('signed', techOk);
  }

  const job = ui.mobJob;
  const site = job ? state.sites.find(s => s.id === job.siteId) : null;
  const stationsDone = site ? site.stations.every(s => s.checked) : false;
  const ready = ui.mobQrStarted && stationsDone && bothSigned();

  if (job && job.completed) {
    gate.className = 'sig-gate ready';
    gate.textContent = '✓ İş emri imzalanarak kapatıldı.';
  } else if (!stationsDone) {
    gate.className = 'sig-gate pending';
    gate.textContent = 'Önce tüm istasyonların kontrolü tamamlanmalı.';
  } else if (ready) {
    gate.className = 'sig-gate ready';
    gate.textContent = '✓ Her iki imza da alındı — form kapatılabilir.';
  } else {
    gate.className = 'sig-gate pending';
    const missing = [!custOk && 'müşteri', !techOk && 'teknisyen'].filter(Boolean).join(' ve ');
    gate.textContent = `${missing.charAt(0).toUpperCase()}${missing.slice(1)} imzası bekleniyor.`;
  }

  saveBtn.disabled = !ready || (job && job.completed);
}

setSignatureChangeHandler(updateSignatureGate);

export function updateSimStepsHighlight() {
  $$('.sim-steps-list li').forEach(x => x.classList.remove('active-step'));
  if (!ui.mobArrived) {
    $('#step1').classList.add('active-step');
    $('#step2').classList.add('active-step');
  } else if (!ui.mobQrStarted) {
    $('#step3').classList.add('active-step');
  } else {
    const site = state.sites.find(s => s.id === ui.mobJob.siteId);
    const checkedCount = site ? site.stations.filter(s => s.checked).length : 0;
    const totalCount = site ? site.stations.length : 8;
    if (checkedCount < totalCount) {
      $('#step4').classList.add('active-step');
    } else {
      $('#step5').classList.add('active-step');
    }
  }
}

export function renderMobileMiniGrid(site) {
  const grid = $('#mobStationsMiniGrid');
  if (!grid) return;
  
  const total = site.stations.length;
  const checked = site.stations.filter(s => s.checked).length;
  $('#mobCheckedCount').textContent = `${checked}/${total}`;
  
  grid.innerHTML = site.stations.map(s => {
    let btnClass = 'unchecked';
    if (s.checked) {
      btnClass = s.status === 'clean' ? 'checked-clean' : (s.status === 'activity' ? 'checked-activity' : s.status);
    }
    return `<button class="mob-station-mini-btn ${btnClass}" data-mob-station-code="${s.code}">${s.code}</button>`;
  }).join('');
  
  const isComplete = ui.mobQrStarted && checked === total;
  const cardSig = $('#cardSignature');
  if (cardSig) {
    cardSig.classList.toggle('disabled', !isComplete);
    if (isComplete && !ui.mobJob.completed) {
      initSignaturePads();
    }
  }

  // The save button is gated on signatures, not just station coverage.
  updateSignatureGate();
}

export function showMobileMap() {
  $('#pageMobileJobDetail').classList.add('hidden');
  $('#pageMobileMap').classList.remove('hidden');
  
  const site = state.sites.find(s => s.id === ui.mobJob.siteId) || state.sites[0];
  const mobileWrapper = $('#mobileBlueprintWrapper');
  const desktopSvg = $('#blueprintWrapper svg').cloneNode(true);
  
  mobileWrapper.innerHTML = '';
  mobileWrapper.appendChild(desktopSvg);
  
  // Render marker layer
  const markerLayer = document.createElement('div');
  markerLayer.className = 'station-markers-layer';
  mobileWrapper.appendChild(markerLayer);
  
  site.stations.forEach(s => {
    const dot = document.createElement('div');
    dot.className = `station-marker ${s.checked ? s.status : 'unchecked'}`;
    dot.style.left = `${s.x}%`;
    dot.style.top = `${s.y}%`;
    dot.textContent = s.code;
    dot.dataset.stationCode = s.code;
    dot.style.pointerEvents = 'auto';
    markerLayer.appendChild(dot);
  });
  
  addTelemetryLog("Kat planı mobil ekranda yüklendi.");
}

// Working copy of the findings rows for the station currently open in the
// inspection form. Held here rather than on the station so an abandoned edit
// leaves the saved record untouched.
let draftFindings = [];
let draftStationType = 'rodent';

export function showMobileInspect(stationCode) {
  ui.activeMobileStationCode = stationCode;
  const site = state.sites.find(s => s.id === ui.mobJob.siteId) || state.sites[0];
  const s = site.stations.find(st => st.code === stationCode);
  if (!s) return;

  $('#mobInspectTitle').textContent = `${s.code} Kontrolü`;

  $('#mobInpBaitStatus').value = s.baitStatus || 'intact';
  $('#mobInpStatus').value = s.checked ? s.status : 'clean';
  $('#mobInpNotes').value = s.notes || '';

  // Seed the editor from whatever the station already holds: the newer
  // findings[] if present, otherwise the legacy single pestType/pestCount pair.
  draftStationType = s.type;
  if (s.findings && s.findings.length) {
    draftFindings = s.findings.map(f => ({ pestCode: normalizePestCode(f.pestCode), count: f.count }));
  } else if (s.pestType && s.pestType !== 'none' && s.pestCount > 0) {
    draftFindings = [{ pestCode: normalizePestCode(s.pestType), count: s.pestCount }];
  } else {
    draftFindings = [];
  }
  renderFindingsEditor();

  $('#pageMobileMap').classList.add('hidden');
  $('#pageMobileJobDetail').classList.add('hidden');
  $('#pageMobileInspect').classList.remove('hidden');
}

// Renders one row per observed species. The species list is narrowed to what
// the device can actually catch — roadmap §7 keeps a separate sheet per family.
export function renderFindingsEditor() {
  const list = $('#mobFindingsList');
  if (!list) return;

  const options = pestsForEquipment(draftStationType);

  list.innerHTML = draftFindings.map((f, i) => {
    const opts = ['<option value="">— Zararlı Seçin —</option>']
      .concat(options.map(p => {
        const sci = p.sci ? ` · ${p.sci}` : '';
        return `<option value="${p.code}"${(p.code === f.pestCode) ? ' selected' : ''}>${p.name}${sci}</option>`;
      }))
      .join('');
    return `
      <div class="finding-row" data-finding-index="${i}">
        <select class="form-select finding-select">${opts}</select>
        <input type="number" class="form-input finding-count" min="1" value="${f.count || 1}" aria-label="Adet">
        <button type="button" class="finding-remove" data-remove-finding="${i}" title="Satırı sil">×</button>
      </div>`;
  }).join('') || '<div class="findings-empty">Aktivite yok — zararlı gözlenmediyse boş bırakın.</div>';

  const total = $('#mobFindingsTotal');
  if (total) {
    const rows = draftFindings.filter(f => f.pestCode && f.count > 0);
    const sum = rows.reduce((a, f) => a + Number(f.count || 0), 0);
    total.textContent = rows.length
      ? `Toplam: ${rows.length} tür · ${sum} adet`
      : '';
  }
}

// The rows are plain DOM until something forces a re-render, so pull their
// current values back into the draft before adding, removing or saving.
function syncFindingsFromDom() {
  const rows = $$('#mobFindingsList .finding-row');
  if (!rows.length) return;
  draftFindings = rows.map(row => ({
    pestCode: row.querySelector('.finding-select').value,
    count: parseInt(row.querySelector('.finding-count').value) || 0
  }));
}

export function openMobileScanner(title, instructions, stations, onScanComplete) {
  $('#pageMobileJobDetail').classList.add('hidden');
  $('#pageMobileScanAnimation').classList.remove('hidden');
  
  $('#mobScanTitle').textContent = title;
  $('#scanInstructions').textContent = instructions;
  
  const selector = $('#simScanSelector');
  selector.innerHTML = stations.map(s => `<option value="${s.code}">${s.code} - ${s.type.toUpperCase()}</option>`).join('');
  
  const trigger = $('#btnSimulateScanTrigger');
  const newTrigger = trigger.cloneNode(true);
  trigger.parentNode.replaceChild(newTrigger, trigger);
  
  const stopScannerAndComplete = (code) => {
    if (window.activeHtml5QrCode && window.activeHtml5QrCode.isScanning) {
      window.activeHtml5QrCode.stop().then(() => {
        $('#pageMobileScanAnimation').classList.add('hidden');
        onScanComplete(code);
      }).catch(err => {
        console.error(err);
        $('#pageMobileScanAnimation').classList.add('hidden');
        onScanComplete(code);
      });
    } else {
      $('#pageMobileScanAnimation').classList.add('hidden');
      onScanComplete(code);
    }
  };

  newTrigger.addEventListener('click', () => {
    stopScannerAndComplete(selector.value);
  });

  // Start Real Camera Scanner if html5-qrcode is loaded
  if (typeof Html5Qrcode !== 'undefined') {
    const readerEl = $('#qr-reader');
    if (readerEl) readerEl.innerHTML = `<div class="scanner-laser" style="z-index:2;"></div><span style="font-size:12px; color:#666; text-align:center; padding:10px; z-index:1;">Kamera başlatılıyor...</span>`;
    
    // Clear any previous scanner
    if (window.activeHtml5QrCode) {
      try {
        if (window.activeHtml5QrCode.isScanning) {
          window.activeHtml5QrCode.stop();
        }
      } catch(e){}
    }
    
    setTimeout(() => {
      const html5QrCode = new Html5Qrcode("qr-reader");
      window.activeHtml5QrCode = html5QrCode;
      
      const qrConfig = { fps: 10, qrbox: { width: 160, height: 160 } };
      
      html5QrCode.start(
        { facingMode: "environment" },
        qrConfig,
        (decodedText) => {
          addTelemetryLog(`GERÇEK QR BARKOD OKUNDU: "${decodedText}"`);
          
          let matched = null;
          stations.forEach(st => {
            if (decodedText.toUpperCase().includes(st.code.toUpperCase())) {
              matched = st.code;
            }
          });
          
          const codeToUse = matched || decodedText || stations[0].code;
          toast(`QR Eşleşti: ${codeToUse}`);
          stopScannerAndComplete(codeToUse);
        },
        (errorMessage) => {
          // Ignore scanning error
        }
      ).catch(err => {
        console.warn("Camera start failed:", err);
        addTelemetryLog("UYARI: Kamera bulunamadı veya izni verilmedi. Manuel seçim devrede.");
        if (readerEl) readerEl.innerHTML = `<span style="font-size:11px; color:#a3a3a3; text-align:center; padding:10px;">Kamera açılamadı. Lütfen HTTPS bağlantısını kontrol edin veya simülatörü kullanın.</span>`;
      });
    }, 400);
  } else {
    addTelemetryLog("Sistem Uyarısı: QR Kütüphanesi yüklenemedi. Simülatör devrede.");
  }
}

export function addTelemetryLog(text) {
  const container = $('#telemetryLogs');
  if (!container) return;
  const timestamp = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const log = document.createElement('div');
  log.className = 'log-line';
  log.innerHTML = `<span style="color:#2ecc71">[${esc(timestamp)}]</span> ${esc(text)}`;
  container.appendChild(log);
  container.scrollTop = container.scrollHeight;
}

export function updatePhoneTime() {
  const el = $('#phoneTime');
  if (el) el.textContent = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}
setInterval(updatePhoneTime, 10000);
updatePhoneTime();

// ===== Chemical picker: options, documents, dosage calculator =====

// Fills the chemical <select> from the catalog, grouped by category, so adding
// a product to chemicalDatabase is enough to make it selectable in the field.
export function populateChemicalSelect() {
  const select = $('#mobChemSelect');
  if (!select || select.dataset.populated === 'true') return;

  const byCategory = {};
  chemicalDatabase.forEach(c => {
    (byCategory[c.category] = byCategory[c.category] || []).push(c);
  });

  select.innerHTML = '<option value="">-- Kimyasal Seçin --</option>' +
    Object.entries(byCategory).map(([cat, list]) => `
      <optgroup label="${cat}">
        ${list.map(c => `<option value="${c.id}">${c.name} (${c.activeIngredient})</option>`).join('')}
      </optgroup>`).join('');

  select.dataset.populated = 'true';
}

// Roadmap §9: the usage report is only valid if the product's MSDS, label and
// ministry permit are on file — so show them at the point of selection.
export function renderChemicalDocs(chemicalId) {
  const container = $('#mobChemDocs');
  if (!container) return;

  const docs = getChemicalDocuments(chemicalId);
  if (!chemicalId || !docs.length) {
    container.innerHTML = '';
    return;
  }

  const chem = chemicalDatabase.find(c => c.id === chemicalId);
  container.innerHTML = `
    <div class="chem-doc-card" style="padding:8px;">
      <h4>${esc(chem ? chem.name : 'Kimyasal')}</h4>
      <p class="chem-doc-sub">${chem ? `${chem.activeIngredient} · ${chem.concentration}` : ''}</p>
      ${docs.map(d => `
        <div class="chem-doc-row">
          <span>${d.icon}</span>
          <span>
            <b>${d.label}</b>
            <span class="chem-doc-meta">${d.ref} · ${d.size}</span>
          </span>
          <button type="button" class="text-btn chem-doc-btn" data-chem-doc="${chemicalId}:${d.kind}">Görüntüle ↗</button>
        </div>`).join('')}
    </div>`;
}

// Live dosage / water panel. Recomputed whenever the product or the treated
// amount changes.
export function updateDosePanel() {
  const panel = $('#mobDosePanel');
  const select = $('#mobChemSelect');
  const areaInput = $('#mobChemArea');
  const areaLabel = $('#mobChemAreaLabel');
  if (!panel || !select || !areaInput) return;

  const chemicalId = select.value;
  const result = calculateDosage(chemicalId, areaInput.value);

  // The measured quantity means different things per product family — m² for
  // residual sprays, m³ for ULV, station count for baits.
  if (areaLabel) {
    const basisLabels = { area: 'UYGULAMA ALANI (m²)', volume: 'UYGULAMA HACMİ (m³)', device: 'İSTASYON ADEDİ' };
    const preview = calculateDosage(chemicalId, 1);
    areaLabel.textContent = preview ? basisLabels[preview.basis] : 'UYGULAMA ALANI (m²)';
  }

  if (!result) {
    panel.classList.add('hidden');
    panel.innerHTML = '';
    return;
  }

  const waterCells = result.neat ? '' : `
    <div class="dose-cell"><span>Gerekli Su</span><strong>${result.waterLitres} lt</strong></div>
    <div class="dose-cell"><span>Tank Dolumu</span><strong>${result.tankLoads} × ${result.tankLitres} lt</strong></div>`;

  const note = result.neat
    ? result.neatNote
    : `Karışım oranı: ${result.mixText}. Her ${result.tankLitres} lt'lik tanka ${result.perTankProduct} ${result.productUnit} ürün eklenir.`;

  panel.innerHTML = `
    <div class="dose-head">⚗ OTOMATİK DOZAJ HESABI</div>
    <div class="dose-grid">
      <div class="dose-cell"><span>Gerekli Ürün</span><strong>${esc(result.productAmount)} ${esc(result.productUnit)}</strong></div>
      <div class="dose-cell"><span>Etiket Dozu</span><strong>${esc(result.doseText)}</strong></div>
      ${waterCells}
    </div>
    <div class="dose-note">${esc(note)} Tahmini maliyet: <b>₺${esc(result.estimatedCost)}</b>.</div>`;
  panel.classList.remove('hidden');
}

// The app's delegator only listens for click and submit, so the picker wires
// its own change/input listeners here — same module-scope pattern the phone
// clock above already uses.
document.addEventListener('change', e => {
  if (e.target.id === 'mobChemSelect') {
    renderChemicalDocs(e.target.value);
    updateDosePanel();
  }
});
document.addEventListener('input', e => {
  if (e.target.id === 'mobChemArea') updateDosePanel();
});

export function renderMobChemicalsList(site) {
  const container = $('#mobChemicalList');
  if (!container) return;
  if (!ui.mobJob) return;
  
  const visitChems = (site.chemicalsUsed || []).filter(cu => cu.workOrderId === ui.mobJob.id);
  
  container.innerHTML = visitChems.map((cu, index) => {
    const chem = chemicalDatabase.find(c => c.id === cu.chemicalId);
    const chemName = chem ? chem.name : 'Kimyasal';
    return `
      <div style="background:var(--soft); border:1px solid var(--line); border-radius:6px; padding:8px; display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
        <div>
          <b>${chemName}</b><br>
          <small class="text-muted">${cu.quantity} · ${cu.area}${cu.waterLitres ? ` · ${cu.waterLitres} lt su` : ''}</small>
        </div>
        ${ui.mobJob.completed ? '' : `<button type="button" class="text-btn delete-mob-chem-btn" data-chem-index="${index}" style="color:var(--red); font-size:16px; font-weight:700; border:none; background:none; cursor:pointer;">×</button>`}
      </div>
    `;
  }).join('') || '<div class="text-muted" style="text-align:center; padding:10px; font-size:10px; background:var(--soft); border-radius:6px;">Ziyarette henüz kullanılan kimyasal girilmedi.</div>';
}


export function mobileClicks(e) {
    const mobWork = e.target.closest('[data-mob-work-id]');
    if (mobWork) {
      const w = state.work.find(x => x.id === mobWork.dataset.mobWorkId);
      if (w) showMobileJobDetail(w);
    }
    
    if (e.target.id === 'btnMobileBackToRoute') {
      $('#pageMobileJobDetail').classList.add('hidden');
      $('#pageMobileRoute').classList.remove('hidden');
      renderMobileRoute();
    }
    
    if (e.target.id === 'btnMobArrived') {
      const btnGps = $('#btnMobArrived');
      addTelemetryLog("Konum doğrulanıyor... (GPS enlem/boylam geofence karşılaştırması)");
      btnGps.textContent = "⌛ GPS Aranıyor...";
      btnGps.disabled = true;
      
      // The browser fires neither callback while a geolocation permission
      // prompt is pending, and its own `timeout` does not run in that state.
      // Without a watchdog the button sits disabled on "GPS Aranıyor..."
      // forever — which bricks the headline step of the demo whenever the
      // venue blocks location. Guarantee a fallback, and make the handler
      // idempotent so a late real fix-up cannot double-apply.
      let gpsSettled = false;
      const GPS_FALLBACK_MS = 2500;

      const proceedGpsArrival = (lat, lon) => {
        if (gpsSettled) return true;
        gpsSettled = true;
        clearTimeout(gpsWatchdog);
        // The 2.5s watchdog (or a late geolocation callback) can fire after the
        // job was cleared by a reset / role switch / navigation — guard the
        // write so it degrades to a no-op instead of throwing.
        if (!ui.mobJob) return true;
        ui.mobArrived = true;
        ui.mobJob.status = 'arrived_gps';
        save();
        btnGps.classList.add('hidden');
        $('#indicatorGpsVerified').classList.remove('hidden');
        if ($('#gpsCoordsText')) {
          $('#gpsCoordsText').textContent = `(Enlem: ${lat.toFixed(5)}, Boylam: ${lon.toFixed(5)})`;
        }
        $('#cardQrStart').classList.remove('disabled');
        $('#btnMobScanFirstQr').disabled = false;
        if ($('#btnMobScanFirstNfc')) $('#btnMobScanFirstNfc').disabled = false;

        const site = state.sites.find(s => s.id === ui.mobJob.siteId) || state.sites[0];
        // Geofence enter event (task 3-2, mobile side): crossing into the site's
        // 150 m fence is the audit trail's arrival marker.
        addTelemetryLog(`GEOFENCE GİRİŞ: ${site.company} — ${site.name} sınırına (150 m) girildi.`);
        addTelemetryLog(`BAŞARILI: Teknisyen konumu geofence sınırları içerisinde doğrulandı! (${lat.toFixed(4)}, ${lon.toFixed(4)})`);
        toast("GPS Konumu doğrulandı. Giriş QR taraması açılıyor...");
        updateSimStepsHighlight();
        setTimeout(() => {
          if (!ui.mobQrStarted && ui.mobJob) {
            openMobileScanner(
              "Giriş QR Kodu Tara",
              "Tesis giriş kapısındaki kontrol ünitesinde yer alan QR barkodunu okutun.",
              site.stations,
              (scannedCode) => startFirstScan(scannedCode, 'QR')
            );
          }
        }, 400);
      };

      const gpsWatchdog = setTimeout(() => {
        addTelemetryLog("UYARI: GPS yanıt vermedi. Simüle edilmiş koordinatlar kullanılıyor.");
        proceedGpsArrival(41.0082, 28.9784);
      }, GPS_FALLBACK_MS);

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            proceedGpsArrival(pos.coords.latitude, pos.coords.longitude);
          },
          (err) => {
            addTelemetryLog("UYARI: Gerçek GPS alınamadı. Simüle edilmiş koordinatlar kullanılıyor.");
            proceedGpsArrival(41.0082, 28.9784);
          },
          { enableHighAccuracy: true, timeout: GPS_FALLBACK_MS }
        );
      } else {
        addTelemetryLog("UYARI: Tarayıcıda GPS servisi bulunamadı. Simüle koordinat kullanılıyor.");
        proceedGpsArrival(41.0082, 28.9784);
      }
    }
    
    if (e.target.id === 'btnMobScanFirstQr') {
      const site = state.sites.find(s => s.id === ui.mobJob.siteId) || state.sites[0];
      if (!ui.mobArrived && ui.mobJob) {
        ui.mobArrived = true;
        ui.mobJob.status = 'arrived_gps';
        save();
        $('#btnMobArrived')?.classList.add('hidden');
        $('#indicatorGpsVerified')?.classList.remove('hidden');
      }
      addTelemetryLog("Kamera açılıyor... Giriş QR Kodu taraması bekleniyor.");
      openMobileScanner(
        "Giriş QR Kodu Tara",
        "Tesis giriş kapısındaki kontrol ünitesinde yer alan QR barkodunu okutun.",
        site.stations,
        (scannedCode) => startFirstScan(scannedCode, 'QR')
      );
    }

    // NFC alternative to the entry QR (task 3-4). No camera: an NFC tap is an
    // instant read, so this simulates one against the entry station directly.
    if (e.target.id === 'btnMobScanFirstNfc') {
      const site = state.sites.find(s => s.id === ui.mobJob.siteId) || state.sites[0];
      const entry = site.stations[0];
      const btnNfc = $('#btnMobScanFirstNfc');
      addTelemetryLog("NFC alanı etkin... Giriş etiketine yaklaşılması bekleniyor.");
      if (btnNfc) { btnNfc.textContent = '📡 NFC Okunuyor...'; btnNfc.disabled = true; }
      setTimeout(() => {
        startFirstScan(entry ? entry.code : 'NFC', 'NFC');
      }, 900);
    }

    // Offline connectivity toggle in the phone status bar (task 3-3).
    if (e.target.closest('#btnToggleOffline')) {
      toggleOfflineMode();
      return true;
    }

    if (e.target.id === 'btnCancelScan') {
      if (window.activeHtml5QrCode && window.activeHtml5QrCode.isScanning) {
        window.activeHtml5QrCode.stop().catch(err => console.error(err));
      }
      $('#pageMobileScanAnimation').classList.add('hidden');
      $('#pageMobileJobDetail').classList.remove('hidden');
    }
    
    if (e.target.id === 'btnMobViewPlan') {
      showMobileMap();
    }
    
    if (e.target.id === 'btnMobileBackToJob') {
      $('#pageMobileMap').classList.add('hidden');
      $('#pageMobileJobDetail').classList.remove('hidden');
    }
    
    if (e.target.id === 'btnMobDownloadOffline') {
      const btnDownload = $('#btnMobDownloadOffline');
      const bar = $('#mobDownloadProgress');
      const fill = $('.download-progress-fill');
      bar.classList.remove('hidden');
      btnDownload.disabled = true;
      
      addTelemetryLog("Tesis kat planı verileri yerel SQLite veritabanına indiriliyor...");
      let progress = 0;
      const interval = setInterval(() => {
        progress += 20;
        fill.style.width = `${progress}%`;
        if (progress >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            // This fires ~800ms after the click; the job can be cleared by a
            // demo reset / role switch / navigating off the sim in the meantime
            // (same latency guard as startFirstScan / proceedGpsArrival).
            if (!ui.mobJob) return;
            ui.mobOfflineReady = true;
            const site = state.sites.find(s => s.id === ui.mobJob.siteId);
            if (site) site.downloaded = true;
            save();
            bar.classList.add('hidden');
            btnDownload.classList.add('hidden');
            $('#indicatorOfflineReady').classList.remove('hidden');
            addTelemetryLog("BAŞARILI: Tesis kat planı offline kullanım için önbelleğe alındı.");
            toast("Kroki çevrimdışı kullanıma hazır.");
            updateSimStepsHighlight();
          }, 200);
        }
      }, 120);
    }
    
    const mobSt = e.target.closest('[data-mob-station-code]');
    if (mobSt) {
      showMobileInspect(mobSt.dataset.mobStationCode);
    }
    
    if (e.target.id === 'btnMobileBackToMap') {
      $('#pageMobileInspect').classList.add('hidden');
      showMobileMap();
    }
    
    if (e.target.id === 'btnAddFinding') {
      syncFindingsFromDom();
      draftFindings.push({ pestCode: '', count: 1 });
      renderFindingsEditor();
      return true;
    }

    const removeFinding = e.target.closest('[data-remove-finding]');
    if (removeFinding) {
      syncFindingsFromDom();
      draftFindings.splice(parseInt(removeFinding.dataset.removeFinding), 1);
      renderFindingsEditor();
      return true;
    }

    if (e.target.id === 'btnMobSaveInspection') {
      // The inspection form can outlive its job (reset / role switch / nav);
      // never write a station status back through a null job.
      if (!ui.mobJob) return true;
      const site = state.sites.find(s => s.id === ui.mobJob.siteId) || state.sites[0];
      const s = site.stations.find(st => st.code === ui.activeMobileStationCode);
      if (s) {
        syncFindingsFromDom();

        // Keep only rows the technician actually filled in. An empty list is a
        // legitimate result — it means "Aktivite Yok".
        const findings = draftFindings
          .filter(f => f.pestCode && f.count > 0)
          .map(f => ({
            pestCode: f.pestCode,
            pestName: pestNameByCode[f.pestCode] || f.pestCode,
            count: Number(f.count)
          }));

        s.checked = true;
        s.baitStatus = $('#mobInpBaitStatus').value;
        s.status = $('#mobInpStatus').value;
        s.notes = $('#mobInpNotes').value;
        s.findings = findings;

        // Mirror the multi-finding result back onto the legacy single-pest
        // fields, which the heat map, stats and older report bodies still read.
        s.pestType = findings.length ? findings[0].pestCode : 'none';
        s.pestCount = findings.reduce((a, f) => a + f.count, 0);

        s.controlledBy = ui.mobJob.tech;
        s.lastControl = "Bugün, " + new Date().toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'});

        if (findings.length) {
          s.status = 'activity';
        } else if (s.status === 'activity') {
          s.status = 'clean';
        }

        recalculateSiteStats(site);
        save();

        const detail = findings.length
          ? findings.map(f => `${f.count} adet ${f.pestName}`).join(', ')
          : 'aktivite yok';
        addTelemetryLog(`İSTASYON DENETLENDİ: ${s.code} — ${detail}`);
        syncRecord(`İstasyon denetimi ${s.code}`);
        toast(`${s.code} kontrolü kaydedildi.`);

        $('#pageMobileInspect').classList.add('hidden');
        showMobileJobDetail(ui.mobJob);
      }
    }
    
    if (e.target.id === 'btnMobSaveForm') {
      // The visit-close path writes through ui.mobJob repeatedly; if the job was
      // cleared (reset / role switch / nav) since the form opened, bail cleanly.
      if (!ui.mobJob) return true;
      // Defence in depth: the button is already disabled without both
      // signatures, but never close a visit on an unsigned pad.
      if (!bothSigned()) {
        toast('İş emri kapatılamaz: müşteri ve teknisyen imzası zorunludur.');
        return true;
      }

      const signerName = ($('#inpSigCustomerName')?.value || '').trim();
      if (!signerName) {
        toast('Müşteri ad soyad bilgisi girilmelidir.');
        $('#inpSigCustomerName')?.focus();
        return true;
      }

      ui.mobJob.completed = true;
      ui.mobJob.status = 'completed';
      state.completed++;

      ui.mobJob.customerSignature = getSignature('#sigCanvasCustomer');
      ui.mobJob.techSignature = getSignature('#sigCanvasTech');
      ui.mobJob.customerSignerName = signerName;
      ui.mobJob.techSignerName = ui.mobJob.tech;
      ui.mobJob.signedAt = new Date().toLocaleString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

      const site = state.sites.find(s => s.id === ui.mobJob.siteId) || state.sites[0];
      site.last = `Bugün · ${ui.mobJob.tech}`;
      
      // Calculate visit duration (simulated for quick demo clicks)
      const durationMs = ui.mobJob.startedTimestamp ? (Date.now() - ui.mobJob.startedTimestamp) : 0;
      let durationMin = Math.round(durationMs / 60000);
      if (durationMin < 5) durationMin = 45; // simulate realistic duration for demo
      ui.mobJob.duration = `${durationMin} dk`;
      
      // Calculate costs
      const techRate = state.techRates[ui.mobJob.tech] || 150;
      const laborCost = Math.round((durationMin / 60) * techRate);
      
      let chemicalCost = 0;
      const siteChems = site.chemicalsUsed || [];
      siteChems.forEach(cu => {
        if (cu.workOrderId === ui.mobJob.id) {
          const chem = chemicalDatabase.find(c => c.id === cu.chemicalId);
          if (chem) {
            const qty = parseFloat(cu.quantity.replace(/[^\d\.]/g, '')) || 0;
            chemicalCost += Math.round(qty * chem.unitCost);
          }
        }
      });
      if (chemicalCost === 0) chemicalCost = 150; // demo baseline if none used
      
      const billingAmount = site.contract ? site.contract.monthlyPrice : 3500;
      const profit = billingAmount - (laborCost + chemicalCost);
      const margin = Math.round((profit / billingAmount) * 100);
      
      // Auto-generate invoice draft
      const newInvoice = {
        id: `INV-${Math.floor(1000 + Math.random() * 9000)}`,
        siteId: site.id,
        company: site.company,
        name: site.name,
        date: new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }),
        amount: billingAmount,
        laborCost: laborCost,
        chemicalCost: chemicalCost,
        margin: margin,
        duration: `${durationMin} dk`,
        status: 'draft',
        description: `${ui.mobJob.visitType ? (visitTypes.find(v=>v.code===ui.mobJob.visitType)||{}).name : 'Rutin'} Servis Faturası`
      };
      
      if (!state.invoices) state.invoices = [];
      state.invoices.unshift(newInvoice);
      
      recalculateSiteStats(site);
      save();
      
      addTelemetryLog(`İŞ BİTTİ: Ziyaret raporu tamamlandı.`);
      syncRecord(`Ziyaret raporu ${ui.mobJob.id}`);
      toast("İş emri tamamlandı. Raporlar senkronize edildi!");
      
      render();
      
      $('#pageMobileJobDetail').classList.add('hidden');
      $('#pageMobileRoute').classList.remove('hidden');
      renderMobileRoute();
    }

    // Tab navigation clicks in company profile
  return false;
}

// Opening a chemical document. No real files ship with the demo, so this
// reports what would be served rather than pretending to render a PDF.
export function chemicalDocClicks(e) {
    const docBtn = e.target.closest('[data-chem-doc]');
    if (docBtn) {
      const [chemicalId, kind] = docBtn.dataset.chemDoc.split(':');
      const chem = chemicalDatabase.find(c => c.id === chemicalId);
      const doc = getChemicalDocuments(chemicalId).find(d => d.kind === kind);
      if (doc && chem) {
        toast(`${chem.name} — ${doc.label} açılıyor (${doc.ref}, ${doc.size}).`);
      }
      return true;
    }
  return false;
}

export function mobileChemDeleteClicks(e) {
    const deleteMobChemBtn = e.target.closest('.delete-mob-chem-btn');
    if (deleteMobChemBtn) {
      if (!ui.mobJob) return true;
      const site = state.sites.find(s => s.id === ui.mobJob.siteId);
      if (!site) return true;
      
      const idx = parseInt(deleteMobChemBtn.dataset.chemIndex);
      const visitChems = site.chemicalsUsed.filter(cu => cu.workOrderId === ui.mobJob.id);
      const targetChemUse = visitChems[idx];
      
      if (targetChemUse) {
        // Restore stock
        const numVal = parseFloat(targetChemUse.quantity.replace(/[^\d\.]/g, '')) || 0;
        const invItem = state.inventory.find(i => i.chemicalId === targetChemUse.chemicalId);
        if (invItem && numVal > 0) {
          invItem.qty = Math.round((invItem.qty + numVal) * 10) / 10;
        }
        
        // Remove from list
        const mainIdx = site.chemicalsUsed.indexOf(targetChemUse);
        if (mainIdx > -1) {
          site.chemicalsUsed.splice(mainIdx, 1);
        }
        
        save();
        renderMobChemicalsList(site);
        renderInventory();
        toast('Kimyasal kullanımı silindi ve stok iade edildi.');
      }
      return true;
    }

    // Delete desktop task chemical usage
  return false;
}

export function mobChemicalSubmit(e) {
    if (e.target.id === 'mobChemicalForm') {
      e.preventDefault();
      if (!ui.mobJob) return true;
      
      const site = state.sites.find(s => s.id === ui.mobJob.siteId);
      if (!site) return true;
      
      const inpChemSelect = $('#mobChemSelect');
      const inpChemArea = $('#mobChemArea');
      const inpChemNotes = $('#mobChemNotes');
      if (!inpChemSelect || !inpChemArea || !inpChemNotes) return true;

      const chemicalId = inpChemSelect.value;
      const notes = inpChemNotes.value.trim();

      // Quantity is no longer typed by hand — it is whatever the calculator
      // derived from the treated amount, so the record and the label dose can
      // never disagree.
      const dose = calculateDosage(chemicalId, inpChemArea.value);
      if (!dose) {
        toast('Kimyasal ve uygulama miktarı girilmelidir.');
        return true;
      }

      const dateStr = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
      const newChemUse = {
        id: `cu${Date.now()}`,
        workOrderId: ui.mobJob.id,
        chemicalId: chemicalId,
        date: dateStr,
        quantity: dose.quantityText,
        area: `${dose.measured} ${dose.basisUnit}`,
        waterLitres: dose.waterLitres,
        dosageText: dose.doseText,
        tech: ui.mobJob.tech,
        notes: notes || 'Saha uygulaması'
      };

      if (!site.chemicalsUsed) site.chemicalsUsed = [];
      site.chemicalsUsed.unshift(newChemUse);

      // Auto-deduct stock
      deductStock(chemicalId, dose.quantityText);

      save();
      renderMobChemicalsList(site);

      inpChemSelect.value = '';
      inpChemArea.value = '';
      inpChemNotes.value = '';
      renderChemicalDocs('');
      updateDosePanel();
      addTelemetryLog(`KİMYASAL UYGULANDI: ${dose.chemicalName} — ${dose.quantityText}${dose.neat ? '' : ` + ${dose.waterLitres} lt su`} / ${dose.measured} ${dose.basisUnit}`);
      syncRecord(`Kimyasal uygulaması ${dose.chemicalName}`);
      toast(`${dose.chemicalName} eklendi: ${dose.quantityText}${dose.neat ? '' : ` + ${dose.waterLitres} lt su`}.`);
    }
  return false;
}
