// Extracted from app.js (Phase 0a-3).

import { $ } from '../core/dom.js';
import { recalculateSiteStats, state, visibleSites } from '../core/state.js';
import { stateLabel } from '../data/catalog.js';
import { toast } from '../core/dom.js';
import { save } from '../core/state.js';
import { modal } from '../ui/modal.js';

export function renderSites(){
  const query=$('#siteSearch')?.value.toLocaleLowerCase('tr')||'';
  const filter=$('[data-site-filter].active')?.dataset.siteFilter||'all';
  
  state.sites.forEach(recalculateSiteStats);

  // Scope: a client sees only their own company's locations (the "my locations"
  // list); admin/technician see the whole portfolio. Everything below — counts,
  // search and filters — works off this scoped set.
  const scope = visibleSites();

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
  
  const sites=scope.filter(s=>(filter==='all'||s.state===filter)&&(`${s.company} ${s.name}`.toLocaleLowerCase('tr').includes(query)));
  
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
      
      const company = f.get('company');
      const siteName = f.get('siteName');
      const city = f.get('city');
      const contactName = f.get('contactName');
      const contactPhone = f.get('contactPhone');
      const contactEmail = f.get('contactEmail');
      const contractPeriod = f.get('contractPeriod');
      const serviceFrequency = f.get('serviceFrequency');
      const address = f.get('address');
      const taxOffice = f.get('taxOffice');
      const taxNo = f.get('taxNo');
      
      const annualPrice = parseFloat(f.get('annualPrice')) || 0;
      const monthlyPrice = parseFloat(f.get('monthlyPrice')) || 0;
      const extraVisitPrice = parseFloat(f.get('extraVisitPrice')) || 0;
      const emergencyCallPrice = parseFloat(f.get('emergencyCallPrice')) || 0;
      
      const freqOutdoorRodent = parseFloat(f.get('freqOutdoorRodent')) || 0;
      const freqIndoorRodent = parseFloat(f.get('freqIndoorRodent')) || 0;
      const freqCrawlingPest = parseFloat(f.get('freqCrawlingPest')) || 0;
      const freqFlyingPest = parseFloat(f.get('freqFlyingPest')) || 0;
      const freqStoragePest = parseFloat(f.get('freqStoragePest')) || 0;
      
      const newSite = {
        id:Date.now()+'',
        company: company,
        name: siteName,
        city: city,
        score: 100,
        state: 'healthy',
        issues: 0,
        last: 'Henüz servis yok',
        next: 'Planlanacak',
        color: '#d8e9e4',
        sector: "Üretim / Gıda Sanayii",
        address: address,
        serviceFrequency: serviceFrequency,
        contact: { name: contactName, phone: contactPhone, email: contactEmail },
        contract: {
          period: contractPeriod,
          taxOffice: taxOffice,
          taxNo: taxNo,
          annualPrice: annualPrice,
          monthlyPrice: monthlyPrice,
          extraVisitPrice: extraVisitPrice,
          emergencyCallPrice: emergencyCallPrice
        },
        serviceScope: {
          outdoorRodent: { frequency: freqOutdoorRodent, unit: 'ay' },
          indoorRodent: { frequency: freqIndoorRodent, unit: 'ay' },
          crawlingPest: { frequency: freqCrawlingPest, unit: 'ay' },
          flyingPest: { frequency: freqFlyingPest, unit: 'ay' },
          storagePest: { frequency: freqStoragePest, unit: 'ay' }
        },
        chemicalsUsed: [],
        methods: [
          { name: "Kemirgen İstasyon Kontrolü", desc: "Kilitli dış çevre yemleme istasyonları.", active: true },
          { name: "Yürüyen Haşere İzleme", desc: "Yapışkan pheromone monitörleri.", active: true }
        ],
        files: [],
        stations: [
          { code:"R-01", type:"rodent_bait", x:20, y:20, checked:false, status:"unchecked", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" },
          { code:"R-02", type:"rodent_bait", x:80, y:20, checked:false, status:"unchecked", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" },
          { code:"BD-01", type:"insect_detector", x:20, y:80, checked:false, status:"unchecked", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" },
          { code:"BD-02", type:"insect_detector", x:80, y:80, checked:false, status:"unchecked", baitStatus:"intact", pestType:"none", pestCount:0, notes:"" }
        ]
      };
      state.sites.push(newSite);
      save();
      $('#modal').classList.add('hidden');
      renderSites();
      toast('Yeni Tesis ve Hizmet Sözleşmesi başarıyla portföye eklendi.');
    }
  return false;
}
