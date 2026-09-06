// Extracted from app.js (Phase 0a-3).

import { $, esc } from '../core/dom.js';
import { state } from '../core/state.js';
import { chemicalDatabase, visitTypes } from '../data/catalog.js';
import { $$, toast } from '../core/dom.js';
import { render, setView } from '../core/router.js';
import { recalculateSiteStats, save } from '../core/state.js';
import { renderCalendarGrid } from '../ui/calendar.js';
import { modal } from '../ui/modal.js';
import { renderDashboard } from '../views/dashboard.js';
import { deductStock, renderInventory } from '../views/inventory.js';
import { getVisits } from '../data/history.js';

// ===== Audit warnings (task 3-6) =====
//
// The first-QR lock and GPS trail are our differentiator (docs/COMPETITOR.md),
// so this surfaces the anomalies that trail catches: GPS arrival logged but no
// first QR, a QR scanned while GPS sat outside the fence, and a visit too short
// to be plausible. Historical anomalies are derived deterministically from the
// seeded visit history; live ones are read from the current work orders, so a
// technician who taps "arrived" but never scans shows up immediately.

const SHORT_VISIT_RATIO = 0.8;   // below this fraction of the site's own average

// Stable small hash so the same visit is always flagged the same way — no
// demo-day surprises.
function hashId(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const WARNING_META = {
  qr_outside_fence: { severity: 'critical', chip: 'critical', icon: '🛰', title: 'QR geofence dışında okundu', order: 0 },
  gps_no_qr:        { severity: 'high',     chip: 'warning',  icon: '📍', title: 'GPS varış var, ilk QR yok',   order: 1 },
  short_visit:      { severity: 'medium',   chip: 'warning',  icon: '⏱', title: 'Şüpheli kısa ziyaret',        order: 2 }
};

export function auditWarnings() {
  const visits = getVisits();
  const out = [];

  // Per-site average on-site minutes, so "short" is judged against the site's
  // own norm rather than a flat number.
  const bySite = {};
  visits.forEach((v) => { (bySite[v.siteId] ||= []).push(v.onSiteMin); });
  const avg = {};
  Object.entries(bySite).forEach(([id, arr]) => { avg[id] = arr.reduce((a, b) => a + b, 0) / arr.length; });

  visits.forEach((v) => {
    const h = hashId(v.id);
    if (h % 47 === 0) {
      out.push(mkWarning('qr_outside_fence', v, `GPS ${38 + (h % 55)} m sınır dışında iken QR okutulmuş.`));
    } else if (h % 29 === 0) {
      out.push(mkWarning('gps_no_qr', v, 'Tesise varış işaretlendi, ancak ilk QR taraması kaydı yok.'));
    }
    if (v.onSiteMin < SHORT_VISIT_RATIO * (avg[v.siteId] || v.onSiteMin)) {
      out.push(mkWarning('short_visit', v, `Sahada ${v.onSiteMin} dk — tesis ortalaması ${Math.round(avg[v.siteId])} dk.`));
    }
  });

  // Live work orders: arrived by GPS but not started by first QR.
  (state.work || []).forEach((w) => {
    if (w.status === 'arrived_gps') {
      out.push({
        type: 'gps_no_qr', live: true, workId: w.id,
        siteId: w.siteId, siteName: w.site, tech: w.tech, date: w.due,
        detail: 'Açık iş emri: teknisyen tesise vardı, ilk QR henüz okutulmadı.'
      });
    }
  });

  return out.sort((a, b) => WARNING_META[a.type].order - WARNING_META[b.type].order);
}

function mkWarning(type, v, detail) {
  return { type, live: false, siteId: v.siteId, siteName: `${v.company} · ${v.siteName}`, tech: v.tech, date: v.date, detail };
}

export function renderAuditWarnings() {
  const body = $('#auditWarningsBody');
  if (!body) return;
  const warnings = auditWarnings();

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
      <div class="audit-row ${m.severity}${w.live ? ' live' : ''}"${w.live ? ` data-work="${w.workId}"` : ''} ${w.live ? 'style="cursor:pointer;"' : ''}>
        <span class="audit-icon">${m.icon}</span>
        <div class="audit-main">
          <b>${m.title}${w.live ? ' <span class="audit-live">CANLI</span>' : ''}</b>
          <p>${w.detail}</p>
          <small>${w.siteName} · ${w.tech} · ${w.date}</small>
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
    <div class="work-item" data-work="${w.id}">
      <span class="work-priority ${w.priority}"></span>
      <div class="work-main"><b>${w.title}</b><p>${w.site} · ${w.id}</p></div>
      <div class="work-meta">
        <span class="status-chip ${w.completed?'healthy':w.priority}">${w.completed?'Tamamlandı':w.type}</span>
        ${w.visitType ? `<span class="visit-type-chip" style="display:inline-block; font-size:9px; padding:2px 6px; border-radius:4px; font-weight:700; background:#f0f4ff; color:#4361a8; border:1px solid #d8e2f8; margin-left:6px;">${(visitTypes.find(v=>v.code===w.visitType)||{}).name || w.visitType}</span>` : ''}
        <small>${w.due}</small>
      </div>
    </div>
  `).join('') || `<p class="empty">${filter==='completed'?'Henüz tamamlanan bir iş emri bulunmuyor.':'Bu görünümde açık iş emri bulunmuyor.'}</p>`;

  renderTask();
  renderAuditWarnings();
}

export function renderTask(){
  const w=state.work.find(x=>x.id===state.selectedWork)||state.work[0];
  if (!w) {
    $('#taskDetail').innerHTML = '<p class="empty">Seçili iş emri bulunmuyor.</p>';
    return;
  }
  
  const site = state.sites.find(s => s.id === w.siteId) || state.sites[0];
  const visitChems = (site.chemicalsUsed || []).filter(cu => cu.workOrderId === w.id);
  
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
      <div><span>Tesis</span><b>${w.site.split(' · ')[1]}</b></div>
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
    if(e.target.closest('#completeWork')){
      const w = state.work.find(x => x.id === state.selectedWork);
      if (w) {
        state.completed++;
        w.completed = true;
        
        const site = state.sites.find(s => s.id === w.siteId) || state.sites[0];
        site.last = `Bugün · ${w.tech}`;
        
        // Calculate costs on PC
        const techRate = state.techRates[w.tech] || 150;
        const laborCost = Math.round((60 / 60) * techRate); // assume 60 mins default
        
        let chemicalCost = 0;
        const siteChems = site.chemicalsUsed || [];
        siteChems.forEach(cu => {
          if (cu.workOrderId === w.id) {
            const chem = chemicalDatabase.find(c => c.id === cu.chemicalId);
            if (chem) {
              const qty = parseFloat(cu.quantity.replace(/[^\d\.]/g, '')) || 0;
              chemicalCost += Math.round(qty * chem.unitCost);
            }
          }
        });
        if (chemicalCost === 0) chemicalCost = 150; // default baseline
        
        const billingAmount = site.contract ? site.contract.monthlyPrice : 3500;
        const profit = billingAmount - (laborCost + chemicalCost);
        const margin = Math.round((profit / billingAmount) * 100);
        
        // Generate invoice draft
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
          duration: '60 dk',
          status: 'draft',
          description: `${w.visitType ? (visitTypes.find(v=>v.code===w.visitType)||{}).name : 'Rutin'} Servis Faturası`
        };
        
        if (!state.invoices) state.invoices = [];
        state.invoices.unshift(newInvoice);
        
        recalculateSiteStats(site);
        save();
        render();
        toast('İş emri tamamlandı; fatura taslağı oluşturuldu.');
      }
    }
    
    // Back button in company profile
  return false;
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
      const w = state.work.find(x => x.id === state.selectedWork) || state.work[0];
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
      const title = f.get('title') || 'Planlı saha kontrolü';
      const siteVal = f.get('site');
      const priority = f.get('priority') || 'Normal';
      const techVal = f.get('tech') || 'Ayşe Demir';
      const dateVal = f.get('dueDate');
      
      // Find site
      const siteObj = state.sites.find(s => s.name === siteVal) || state.sites[0];
      
      let formattedDue = 'Bugün, 18:00';
      if (dateVal) {
        const dt = new Date(dateVal);
        const day = dt.getDate();
        const monthStr = dt.toLocaleDateString('tr-TR', { month: 'short' });
        const timeStr = dt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        formattedDue = `${day} ${monthStr}, ${timeStr}`;
      }
      
      const visitType = f.get('visitType') || 'RZ';
      const newWo = {
        id: `WO-${Math.floor(2000 + Math.random() * 1000)}`,
        siteId: siteObj.id,
        title: title,
        site: `${siteObj.company} · ${siteObj.name}`,
        priority: priority === 'Kritik' ? 'critical' : (priority === 'Yüksek' ? 'high' : 'normal'),
        type: 'Planlı servis',
        visitType: visitType,
        due: formattedDue,
        tech: techVal,
        description: 'Periyodik istasyon kontrolü ve genel pest control denetimi.'
      };
      
      state.work.push(newWo);
      save();
      $('#modal').classList.add('hidden');
      renderWork();
      renderDashboard();
      toast(`İş emri oluşturuldu ve ${techVal} teknisyenine atandı.`);
    }
    
    // Tesis & Sözleşme Düzenleme Formu
  return false;
}

export function taskChemicalSubmit(e) {
    if (e.target.id === 'taskChemicalForm') {
      e.preventDefault();
      const w = state.work.find(x => x.id === state.selectedWork) || state.work[0];
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
