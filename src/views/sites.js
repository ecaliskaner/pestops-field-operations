// Extracted from app.js (Phase 0a-3).

import { $ } from '../core/dom.js';
import { recalculateSiteStats, state, visibleSites } from '../core/state.js';
import { stateLabel } from '../data/catalog.js';
import { toast } from '../core/dom.js';
import { modal } from '../ui/modal.js';
import { createSite } from '../data/repo/sites.js';

// City / sector filters. The "⚙ Filtreler" button used to pop a toast that
// claimed "Şehir, Sektör ve Risk seviyesi filtreleri uygulandı" while applying
// none of them — a fabricated success message for an action that never
// happened. Held here rather than in `state` because it is view-only UI
// state; nothing about it belongs in the saved/synced session.
let cityFilter = 'all';
let sectorFilter = 'all';

export function setSiteFilters({ city, sector }) {
  if (city !== undefined) cityFilter = city;
  if (sector !== undefined) sectorFilter = sector;
  renderSites();
}

export function clearSiteFilters() {
  cityFilter = 'all';
  sectorFilter = 'all';
  renderSites();
}

export const activeSiteFilters = () => ({ city: cityFilter, sector: sectorFilter });
export const hasActiveSiteFilters = () => cityFilter !== 'all' || sectorFilter !== 'all';

export function renderSites(){
  const query=$('#siteSearch')?.value.toLocaleLowerCase('tr')||'';
  const filter=$('[data-site-filter].active')?.dataset.siteFilter||'all';
  
  state.sites.forEach(recalculateSiteStats);

  // Scope: a client sees only their own company's locations (the "my locations"
  // list); admin/technician see the whole portfolio. Everything below — counts,
  // search and filters — works off this scoped set.
  const scope = visibleSites();

  const filterBtn = $('[data-action="filters"]');
  if (filterBtn) filterBtn.classList.toggle('active', hasActiveSiteFilters());

  // Calculate dynamic filter counts
  const totalCount = scope.length;
  const riskCount = scope.filter(s => s.state === 'risk').length;
  const watchCount = scope.filter(s => s.state === 'watch').length;
  const healthyCount = scope.filter(s => s.state === 'healthy').length;
  
  // Update button counters in DOM dynamically
  const allBtn = $('[data-site-filter="all"] b');
  if (allBtn) allBtn.textContent = totalCount;
  const riskBtn = $('[data-site-filter="risk"] b');
  if (riskBtn) riskBtn.textContent = riskCount;
  const watchBtn = $('[data-site-filter="watch"] b');
  if (watchBtn) watchBtn.textContent = watchCount;
  const healthyBtn = $('[data-site-filter="healthy"] b');
  if (healthyBtn) healthyBtn.textContent = healthyCount;
  
  const sites=scope.filter(s=>
    (filter==='all'||s.state===filter) &&
    (cityFilter==='all'||s.city===cityFilter) &&
    (sectorFilter==='all'||s.sector===sectorFilter) &&
    (`${s.company} ${s.name}`.toLocaleLowerCase('tr').includes(query))
  );
  
  $('#siteTable').innerHTML=sites.map(s=>`
    <tr>
      <td>
        <div class="site-cell" data-site-id="${s.id}" style="cursor:pointer;">
          <span class="site-logo" style="background:${s.color}">${s.company.slice(0,2).toUpperCase()}</span>
          <span class="site-name"><b>${s.name}</b><span>${s.company} · ${s.city}</span></span>
        </div>
      </td>
      <td><span class="status-chip ${s.state==='healthy'?'healthy':s.state==='risk'?'critical':'warning'}">${stateLabel[s.state]}</span></td>
      <td><span class="score ${s.state}"><i></i>${s.score}/100</span></td>
      <td>${s.last}</td>
      <td>${s.issues?`<b>${s.issues} açık</b>`:'—'}</td>
      <td>${s.next}</td>
      <td><button class="row-action" data-site-id="${s.id}">•••</button></td>
    </tr>
  `).join('')||'<tr><td colspan="7">Aramanızla eşleşen tesis bulunamadı.</td></tr>';
}


export function createSiteSubmit(e) {
    if(e.target.id==='createSite'){
      e.preventDefault();
      const f=new FormData(e.target);
      const form = e.target;
      const button = form.querySelector('button[type="submit"]');
      const orgId = state.currentUser?.orgId;
      if (!orgId) {
        toast('Kuruma bağlı bir hesapla giriş yapmalısınız.');
        return true;
      }

      const input = {
        orgId,
        company: f.get('company'),
        siteName: f.get('siteName'),
        city: f.get('city'),
        address: f.get('address'),
        contactName: f.get('contactName'),
        contactPhone: f.get('contactPhone'),
        contactEmail: f.get('contactEmail'),
        // Optional: an admin who does not have coordinates handy yet can save
        // without them, and the site simply stays off the Ekip map until they
        // are added from the edit form later.
        lat: f.get('lat') ? parseFloat(f.get('lat')) : null,
        lng: f.get('lng') ? parseFloat(f.get('lng')) : null,
        contractPeriod: f.get('contractPeriod'),
        taxOffice: f.get('taxOffice'),
        taxNo: f.get('taxNo'),
        annualPrice: parseFloat(f.get('annualPrice')) || 0,
        monthlyPrice: parseFloat(f.get('monthlyPrice')) || 0,
        extraVisitPrice: parseFloat(f.get('extraVisitPrice')) || 0,
        emergencyCallPrice: parseFloat(f.get('emergencyCallPrice')) || 0,
        serviceScope: {
          outdoorRodent: { frequency: parseFloat(f.get('freqOutdoorRodent')) || 0, unit: 'ay' },
          indoorRodent: { frequency: parseFloat(f.get('freqIndoorRodent')) || 0, unit: 'ay' },
          crawlingPest: { frequency: parseFloat(f.get('freqCrawlingPest')) || 0, unit: 'ay' },
          flyingPest: { frequency: parseFloat(f.get('freqFlyingPest')) || 0, unit: 'ay' },
          storagePest: { frequency: parseFloat(f.get('freqStoragePest')) || 0, unit: 'ay' }
        }
      };

      if (button) { button.disabled = true; button.textContent = 'Kaydediliyor…'; }
      createSite(input)
        .then((newSite) => {
          state.sites.push(newSite);
          $('#modal').classList.add('hidden');
          renderSites();
          toast('Yeni Tesis ve Hizmet Sözleşmesi başarıyla portföye eklendi.');
        })
        .catch((err) => {
          toast(err.message || 'Tesis kaydedilemedi.');
        })
        .finally(() => {
          if (button) { button.disabled = false; button.textContent = '＋ Tesis Kaydet'; }
        });
    }
  return false;
}
