// Extracted from app.js (Phase 0a-3).

import { $, esc } from '../core/dom.js';
import { state } from '../core/state.js';
import { chemicalDatabase, visitTypes } from '../data/catalog.js';
import { $$, toast } from '../core/dom.js';
import { render, setView } from '../core/router.js';
import { save, replaceWork } from '../core/state.js';
import { renderCalendarGrid } from '../ui/calendar.js';
import { modal } from '../ui/modal.js';
import { renderDashboard } from '../views/dashboard.js';
import { deductStock, renderInventory } from '../views/inventory.js';
import {
  createWorkOrder, fetchAuditWarnings, fetchWorkOrders, completeWorkOrderByOffice
} from '../data/repo/work.js';

// ===== Audit warnings =====
//
// The first-QR lock and the GPS trail are the product's differentiator, so
// this panel has to be beyond reproach. It used to be fabricated: a hash of
// each synthetic visit id decided which visits were accused of a falsified
// arrival (`hashId(v.id) % 47 === 0`). It now renders only what the audit
// trail actually caught — see fetchAuditWarnings() in data/repo/work.js for
// how each of the three findings is derived.

const WARNING_META = {
  gps_mismatch: { severity: 'critical', chip: 'critical', icon: '🛰', title: 'Varış geofence dışından bildirildi', order: 0 },
  gps_no_qr:    { severity: 'high',     chip: 'warning',  icon: '📍', title: 'GPS varış var, ilk QR yok',          order: 1 },
  short_visit:  { severity: 'medium',   chip: 'warning',  icon: '⏱', title: 'Şüpheli kısa ziyaret',               order: 2 }
};

let auditRows = [];
let auditLoaded = false;

export function auditWarnings() {
  return auditRows;
}

// Loaded on the first İş Emirleri render. A failure leaves the panel in its
// empty state rather than falling back to invented rows.
// Force a re-read after a write that could create or clear a finding.
export function reloadAuditWarnings() {
  auditLoaded = false;
  loadAuditWarnings();
}

async function loadAuditWarnings() {
  if (auditLoaded) return;
  auditLoaded = true;
  try {
    auditRows = await fetchAuditWarnings();
  } catch (err) {
    console.error('[repellent] denetim uyarilari yuklenemedi', err);
    return;
  }
  renderAuditWarnings();
}

export function renderAuditWarnings() {
  const body = $('#auditWarningsBody');
  if (!body) return;
  loadAuditWarnings();
  const warnings = auditWarnings().slice().sort(
    (a, b) => WARNING_META[a.type].order - WARNING_META[b.type].order
  );

  const countEl = $('#auditWarningCount');
  if (countEl) countEl.textContent = warnings.length;

  const summary = $('#auditWarningSummary');
  if (summary) {
    const c = (t) => warnings.filter((w) => w.type === t).length;
    summary.innerHTML = Object.entries(WARNING_META).map(([type, m]) =>
      `<span class="audit-sum ${m.severity}"><b>${c(type)}</b> ${m.title}</span>`).join('');
  }

  if (!warnings.length) {
    body.innerHTML = '<p class="audit-empty">Denetim uyarısı bulunmuyor — tüm ziyaretler GPS + QR kanıtıyla eşleşiyor.</p>';
    return;
  }

  // Cap the on-screen list; the count badge still reflects the true total.
  body.innerHTML = warnings.slice(0, 8).map((w) => {
    const m = WARNING_META[w.type];
    return `
      <div class="audit-row ${m.severity}${w.live ? ' live' : ''}"${w.live ? ` data-work="${esc(w.workId)}"` : ''} ${w.live ? 'style="cursor:pointer;"' : ''}>
        <span class="audit-icon">${m.icon}</span>
        <div class="audit-main">
          <b>${m.title}${w.live ? ' <span class="audit-live">CANLI</span>' : ''}</b>
          <p>${esc(w.detail)}</p>
          <small>${esc(w.siteName)} · ${esc(w.tech)} · ${esc(w.date)}</small>
        </div>
        <span class="status-chip ${m.chip}">${m.severity === 'critical' ? 'Kritik' : m.severity === 'high' ? 'Yüksek' : 'Orta'}</span>
      </div>`;
  }).join('');
}

export function renderWork(filter='all'){
  let sourceList = state.work;
  if (state.currentUser && state.currentUser.role === 'tech') {
    sourceList = sourceList.filter(w => w.tech === state.currentUser.name);
  }
  
  // Calculate dynamic stats based on sourceList
  const allCount = sourceList.filter(w => !w.completed).length;
  const criticalCount = sourceList.filter(w => !w.completed && w.priority === 'critical').length;
  const scheduledCount = sourceList.filter(w => !w.completed && (w.due.includes('Bugün') || w.due.includes('13 Tem') || w.due.includes('Tem'))).length;
  const completedCount = sourceList.filter(w => w.completed).length;
  const siteAlerts = state.sites.filter(s => s.issues > 0).length;

  if ($('#workStatAll')) $('#workStatAll').textContent = allCount;
  if ($('#workStatCritical')) $('#workStatCritical').textContent = criticalCount;
  if ($('#workStatScheduled')) $('#workStatScheduled').textContent = scheduledCount;
  if ($('#workStatCompleted')) $('#workStatCompleted').textContent = completedCount;
  if ($('#sidebarWorkCount')) $('#sidebarWorkCount').textContent = allCount;
  if ($('#siteAlertCount')) $('#siteAlertCount').textContent = siteAlerts;

  const list=sourceList.filter(w=> {
    if (w.completed) return filter === 'completed';
    if (filter === 'completed') return false;
    return filter==='all'||(filter==='critical'?w.priority==='critical':filter==='scheduled'?w.type==='Planlı servis':false);
  });
  
  $('#workListTitle').textContent={all:'Açık iş emirleri',critical:'Kritik öncelikli işler',scheduled:'Bugün planlanan servisler',completed:'Tamamlanan işler'}[filter];
  
  $('#workList').innerHTML=list.map(w=>`
    <div class="work-item" data-work="${esc(w.id)}">
      <span class="work-priority ${esc(w.priority)}"></span>
      <div class="work-main"><b>${esc(w.title)}</b><p>${esc(w.site)} · ${esc(w.id)}</p></div>
      <div class="work-meta">
        <span class="status-chip ${esc(w.completed?'healthy':w.priority)}">${esc(w.completed?'Tamamlandı':w.type)}</span>
        ${w.visitType ? `<span class="visit-type-chip" style="display:inline-block; font-size:9px; padding:2px 6px; border-radius:4px; font-weight:700; background:#f0f4ff; color:#4361a8; border:1px solid #d8e2f8; margin-left:6px;">${esc((visitTypes.find(v=>v.code===w.visitType)||{}).name || w.visitType)}</span>` : ''}
        <small>${w.due}</small>
      </div>
    </div>
  `).join('') || `<p class="empty">${filter==='completed'?'Henüz tamamlanan bir iş emri bulunmuyor.':'Bu görünümde açık iş emri bulunmuyor.'}</p>`;

  renderTask();
  renderAuditWarnings();
}

// The work order the task panel is currently showing.
//
// renderTask() falls back to the first order when `selectedWork` matches
// nothing, so a strict lookup elsewhere resolved to a *different* order than
// the one on screen — the panel showed one job while the complete button
// silently acted on none. One resolver, so they cannot drift.
function selectedWorkOrder() {
  return state.work.find((x) => x.id === state.selectedWork) || state.work[0] || null;
}

export function renderTask(){
  const w = selectedWorkOrder();
  if (!w) {
    $('#taskDetail').innerHTML = '<p class="empty">Seçili iş emri bulunmuyor.</p>';
    return;
  }
  
  // `|| state.sites[0]` used to stand in here. On a real account whose site
  // list is still loading — or simply empty — that index is undefined, and
  // reading through it threw straight out of render(), leaving the whole app
  // half-painted and unresponsive. A work order whose site is not loaded yet
  // renders without the site-scoped sections instead.
  const site = state.sites.find(s => s.id === w.siteId) || null;
  const visitChems = ((site && site.chemicalsUsed) || []).filter(cu => cu.workOrderId === w.id);
  
  const chemsListHtml = visitChems.map((cu, idx) => {
    const chem = chemicalDatabase.find(c => c.id === cu.chemicalId);
    const chemName = chem ? chem.name : 'Kimyasal';
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; background:var(--soft); border:1px solid var(--line); border-radius:6px; padding:6px 10px; margin-bottom:6px; font-size:12px;">
        <div>
          <b>${esc(chemName)}</b><br>
          <small class="text-muted">Miktar: ${esc(cu.quantity)} · Alan: ${esc(cu.area)} ${cu.notes ? `· ${esc(cu.notes)}` : ''}</small>
        </div>
        ${w.completed ? '' : `<button class="text-btn delete-task-chem-btn" data-chem-index="${idx}" style="color:var(--red); font-size:16px; font-weight:700; border:none; background:none; cursor:pointer;">×</button>`}
      </div>
    `;
  }).join('') || '<p class="text-muted" style="font-size:11px; margin-bottom:12px;">Bu ziyarette henüz kullanılan kimyasal girilmedi.</p>';

  const chemFormHtml = w.completed ? '' : `
    <form id="taskChemicalForm" style="border:1px solid var(--line); border-radius:8px; padding:12px; margin-bottom:14px; background:#fafafa;">
      <p style="font-size:10px; font-weight:700; color:var(--muted); margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px;">💊 Kullanılan Kimyasal Ekle</p>
      <div style="display:grid; gap:8px;">
        <select required id="taskChemSelect" class="form-select" style="height:32px; font-size:12px; padding:0 6px;">
          <option value="">-- Kimyasal Seçin --</option>
          ${chemicalDatabase.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
        </select>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
          <input required type="text" id="taskChemQty" placeholder="Miktar (Örn: 100 ml)" class="form-input" style="height:32px; font-size:12px;">
          <input required type="text" id="taskChemArea" placeholder="Alan (Örn: 200 m²)" class="form-input" style="height:32px; font-size:12px;">
        </div>
        <input type="text" id="taskChemNotes" placeholder="Açıklama / Notlar" class="form-input" style="height:32px; font-size:12px;">
        <button type="submit" class="secondary-btn" style="height:32px; justify-content:center; padding:0; width:100%;">Kimyasal Ekle</button>
      </div>
    </form>
  `;

  const compBtn = w.completed ? 
    `<button class="secondary-btn" disabled style="width:100%;">✓ Servis Tamamlandı</button>` : 
    `<button class="primary-btn" id="completeWork">✓ Tamamlandı olarak işaretle</button>`;
    
  $('#taskDetail').innerHTML=`
    <span class="status-chip ${esc(w.completed?'healthy':w.priority)}">${esc(w.completed?'Tamamlandı':w.type)}</span>
    <h2>${esc(w.title)}</h2>
    <p>${esc(w.description)}</p>
    <div class="detail-list" style="margin-bottom:14px;">
      <div><span>Tesis</span><b>${esc(String(w.site).split(' · ')[1] || w.site)}</b></div>
      <div><span>Ziyaret Türü</span><b>${(visitTypes.find(v=>v.code===w.visitType)||{}).name || 'Belirtilmedi'}</b></div>
      <div><span>Atanan teknisyen</span><b>${esc(w.tech)}</b></div>
      <div><span>Hedef zaman</span><b>${esc(w.due)}</b></div>
      <div><span>İş emri</span><b>${esc(w.id)}</b></div>
    </div>
    
    <div style="margin-bottom:14px;">
      <p class="overline">KULLANILAN KİMYASALLAR / MALZEMELER</p>
      <div style="margin-top:6px;">
        ${chemsListHtml}
      </div>
    </div>
    
    ${chemFormHtml}
    
    <div style="display:grid; gap:8px;">
      ${compBtn}
      <button class="secondary-btn" data-site-id="${esc(w.siteId)}">⌖ Tesis Kat Planını Aç</button>
    </div>
  `;
}


export function workListClicks(e) {
    const wf=e.target.closest('[data-work-filter]');
    if(wf){
      $$('.work-stat').forEach(x=>x.classList.toggle('active',x===wf));
      renderWork(wf.dataset.workFilter);
    }
    
    const work=e.target.closest('[data-work]');
    if(work){
      state.selectedWork=work.dataset.work;
      save();
      renderTask();
    }
  return false;
}

export function workCardClicks(e) {
    const workClick = e.target.closest('[data-work-id]');
    if (workClick) {
      state.selectedWork = workClick.dataset.workId;
      save();
      setView('work');
      renderWork();
      return true;
    }
  return false;
}

export function completeWorkClicks(e) {
  if (!e.target.closest('#completeWork')) return false;

  const w = selectedWorkOrder();
  if (!w) return true;
  if (!w.dbId) {
    toast('Bu iş emri henüz kaydedilmemiş.');
    return true;
  }

  // Closing a visit from the office is a real exception, not a shortcut.
  // wo_complete() refuses without the first QR scan because that scan is what
  // the product claims as the start of a visit, so the office path demands a
  // written reason and records itself as an auditable exception. Asking for
  // the reason here — rather than sending a default — is what keeps the audit
  // trail worth reading.
  const reason = window.prompt(
    'Bu iş emri sahada QR okutulmadan kapatılıyor. ' +
    'Gerekçe (denetim kaydına işlenecek):'
  );
  if (reason === null) return true;
  if (!reason.trim()) {
    toast('Gerekçe zorunludur.');
    return true;
  }

  const button = e.target.closest('#completeWork');
  if (button) { button.disabled = true; button.textContent = 'Kapatılıyor…'; }

  completeWorkOrderByOffice({ workOrderId: w.dbId, reason: reason.trim() })
    .then(() => refreshWorkBoard())
    .then(() => {
      render();
      toast('İş emri kapatıldı. QR kanıtı olmadığı için denetim uyarılarında işaretlendi.');
    })
    .catch((err) => {
      toast(err.message || 'İş emri kapatılamadı.');
    })
    .finally(() => {
      if (button) { button.disabled = false; button.textContent = '✓ Tamamlandı olarak işaretle'; }
    });

  return true;
}

// Pull the board again after a write, so the list, the task panel and the
// audit warnings all reflect what the database now holds rather than a local
// guess at it.
async function refreshWorkBoard() {
  try {
    replaceWork(await fetchWorkOrders());
  } catch (err) {
    console.error('[repellent] is emirleri yenilenemedi', err);
  }
  reloadAuditWarnings();
}

export function calendarToggleClicks(e) {
    if (e.target.id === 'btnWorkShowList') {
      $('#workListWrapper').classList.remove('hidden');
      $('#workCalendarContainer').classList.add('hidden');
      $('#btnWorkShowList').classList.add('active');
      $('#btnWorkShowCalendar').classList.remove('active');
      return true;
    }
    if (e.target.id === 'btnWorkShowCalendar') {
      $('#workListWrapper').classList.add('hidden');
      $('#workCalendarContainer').classList.remove('hidden');
      $('#btnWorkShowList').classList.remove('active');
      $('#btnWorkShowCalendar').classList.add('active');
      renderCalendarGrid();
      return true;
    }

    // Heatmap mode toggler
  return false;
}

export function taskChemDeleteClicks(e) {
    const deleteTaskChemBtn = e.target.closest('.delete-task-chem-btn');
    if (deleteTaskChemBtn) {
      const w = selectedWorkOrder();
      if (!w) return true;
      
      const site = state.sites.find(s => s.id === w.siteId);
      if (!site) return true;
      
      const idx = parseInt(deleteTaskChemBtn.dataset.chemIndex);
      const visitChems = site.chemicalsUsed.filter(cu => cu.workOrderId === w.id);
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
        renderTask();
        renderInventory();
        toast('Kimyasal kullanımı silindi ve stok iade edildi.');
      }
      return true;
    }

    // Invoice status filters
  return false;
}

export function createWorkSubmit(e) {
    if(e.target.id==='createWork'){
      e.preventDefault();
      const f = new FormData(e.target);
      const form = e.target;
      const button = form.querySelector('button[type="submit"]');

      const title = f.get('title') || 'Planlı saha kontrolü';
      const siteVal = f.get('site');
      const priorityLabel = f.get('priority') || 'Normal';
      const technicianId = f.get('tech');
      const dateVal = f.get('dueDate');
      const visitType = f.get('visitType') || 'RZ';

      const siteObj = state.sites.find(s => s.name === siteVal);
      const orgId = state.currentUser?.orgId;

      if (!orgId) {
        toast('Kuruma bağlı bir hesapla giriş yapmalısınız.');
        return true;
      }
      if (!siteObj) {
        toast('Lütfen bir tesis seçin.');
        return true;
      }
      if (!technicianId) {
        toast('Görevlendirilecek teknisyen bulunamadı. Önce Ekip sayfasından teknisyen davet edin.');
        return true;
      }

      const input = {
        orgId,
        siteId: siteObj.id,
        technicianId,
        title,
        description: 'Periyodik istasyon kontrolü ve genel pest control denetimi.',
        priority: priorityLabel === 'Kritik' ? 'critical' : (priorityLabel === 'Yüksek' ? 'high' : 'normal'),
        visitType,
        dueAt: dateVal ? new Date(dateVal).toISOString() : null,
        createdBy: state.currentUser?.id
      };

      if (button) { button.disabled = true; button.textContent = 'Kaydediliyor…'; }
      createWorkOrder(input)
        .then((newWo) => {
          state.work.push(newWo);
          $('#modal').classList.add('hidden');
          renderWork();
          renderDashboard();
          toast(`İş emri oluşturuldu ve ${newWo.tech} teknisyenine atandı.`);
        })
        .catch((err) => {
          toast(err.message || 'İş emri oluşturulamadı.');
        })
        .finally(() => {
          if (button) { button.disabled = false; button.textContent = '＋ İş Emri Planla'; }
        });
    }

    // Tesis & Sözleşme Düzenleme Formu
  return false;
}

export function taskChemicalSubmit(e) {
    if (e.target.id === 'taskChemicalForm') {
      e.preventDefault();
      const w = selectedWorkOrder();
      if (!w) return true;
      
      const site = state.sites.find(s => s.id === w.siteId);
      if (!site) return true;
      
      const inpChemSelect = $('#taskChemSelect');
      const inpChemQty = $('#taskChemQty');
      const inpChemArea = $('#taskChemArea');
      const inpChemNotes = $('#taskChemNotes');
      if (!inpChemSelect || !inpChemQty || !inpChemArea || !inpChemNotes) return true;
      
      const chemicalId = inpChemSelect.value;
      const quantity = inpChemQty.value.trim();
      const area = inpChemArea.value.trim();
      const notes = inpChemNotes.value.trim();
      
      if (!chemicalId || !quantity || !area) return true;
      
      const dateStr = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
      const newChemUse = {
        id: `cu${Date.now()}`,
        workOrderId: w.id,
        chemicalId: chemicalId,
        date: dateStr,
        quantity: quantity,
        area: area,
        tech: w.tech,
        notes: notes || 'Ziyaret uygulaması'
      };
      
      if (!site.chemicalsUsed) site.chemicalsUsed = [];
      site.chemicalsUsed.unshift(newChemUse);
      
      // Auto-deduct stock
      deductStock(chemicalId, quantity);
      
      save();
      renderTask();
      
      inpChemSelect.value = '';
      inpChemQty.value = '';
      inpChemArea.value = '';
      inpChemNotes.value = '';
      toast('Kimyasal başarıyla eklendi.');
    }

    // Mobile Chemical Form submit
  return false;
}
