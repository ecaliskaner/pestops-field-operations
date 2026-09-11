// Extracted from app.js (Phase 0a-3).

import { $, toast } from '../core/dom.js';
import { state, replaceInventory } from '../core/state.js';
import { fetchInventory, addStock } from '../data/repo/inventory.js';
import { chemicalDatabase } from '../data/catalog.js';

export function renderInventory() {
  const tbody = $('#invStockTableBody');
  if (!tbody) return;
  if (!state.inventory) state.inventory = [];
  if (!state.inventoryTransactions) state.inventoryTransactions = [];

  // Update metrics
  $('#invTotalProducts').textContent = state.inventory.length;
  
  const criticalCount = state.inventory.filter(item => item.qty <= item.minQty).length;
  const healthyCount = state.inventory.length - criticalCount;
  
  $('#invCriticalStock').textContent = criticalCount;
  $('#invHealthyStock').textContent = healthyCount;
  
  if (criticalCount > 0) {
    $('#invCriticalStock').classList.add('attention');
  } else {
    $('#invCriticalStock').classList.remove('attention');
  }

  const lastTx = state.inventoryTransactions[0];
  if (lastTx) {
    const chemName = (chemicalDatabase.find(c => c.id === lastTx.chemicalId) || {}).name || 'Kimyasal';
    const typeLabel = lastTx.type === 'refill' ? 'Giriş' : 'Çıkış';
    $('#invLastTransaction').textContent = `${typeLabel}: ${chemName} (${lastTx.qty} ${lastTx.unit})`;
  } else {
    $('#invLastTransaction').textContent = 'İşlem Yok';
  }

  // Populate Stock table
  tbody.innerHTML = state.inventory.map(item => {
    const isCritical = item.qty <= item.minQty;
    const statusText = isCritical ? 'Kritik Seviye' : 'Güvenli';
    const statusClass = isCritical ? 'critical' : 'healthy';
    
    return `
      <tr>
        <td><b>${item.name}</b></td>
        <td><code style="font-size:10px;">${item.lotNo || '—'}</code></td>
        <td style="font-weight:700; color:${isCritical ? 'var(--red)' : 'var(--ink)'};">${item.qty} ${item.unit}</td>
        <td><small class="text-muted">${item.minQty} ${item.unit}</small></td>
        <td><span class="status-chip ${statusClass}">${statusText}</span></td>
        <td>₺${item.unitCost} / ${item.unit}</td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="6" class="empty" style="text-align:center;">Depoda kayıtlı ürün bulunmuyor.</td></tr>';

  // Populate Refill select dropdown options
  const refillSelect = $('#refillChemSelect');
  if (refillSelect && refillSelect.children.length === 0) {
    refillSelect.innerHTML = `<option value="">-- Ürün seçin --</option>` + 
      chemicalDatabase.map(c => `<option value="${c.id}">${c.name} (${c.category})</option>`).join('');
  }

  // Populate Transactions table
  const txTbody = $('#invTransactionTableBody');
  if (txTbody) {
    txTbody.innerHTML = state.inventoryTransactions.map(tx => {
      const chem = chemicalDatabase.find(c => c.id === tx.chemicalId);
      const chemName = chem ? chem.name : 'Bilinmeyen';
      const isRefill = tx.type === 'refill';
      const badgeColor = isRefill ? 'var(--green)' : 'var(--red)';
      const typeSign = isRefill ? '＋' : '－';
      
      return `
        <tr>
          <td><small class="text-muted">${tx.date}</small></td>
          <td><b>${chemName}</b><br><span style="color:var(--muted); font-size:9px;">${tx.notes || ''}</span></td>
          <td style="font-weight:700; color:${badgeColor};">${typeSign}${tx.qty} ${tx.unit}</td>
          <td><span class="status-chip secondary" style="font-size:9px;">${isRefill ? 'İkmal' : 'Tüketim'}</span></td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="4" class="empty" style="text-align:center;">Henüz hareket kaydı bulunmuyor.</td></tr>';
  }
}

// deductStock() used to live here: it decremented a seeded array and pushed a
// fake movement row. Deduction is now part of record_chemical_usage(), which
// writes the application, the stock movement and the new balance in one
// transaction — a half-written stock ledger is the one outcome worth paying an
// RPC to avoid.

export function stockRefillSubmit(e) {
  if (e.target.id !== 'invRefillForm') return false;
  e.preventDefault();

  const f = new FormData(e.target);
  const chemicalId = String(f.get('chemicalId') || '');
  const quantity = parseFloat(f.get('quantity')) || 0;
  const lotNo = String(f.get('lotNo') || '').trim();
  const notes = String(f.get('notes') || '').trim() || 'Depo stok girişi';
  const orgId = state.currentUser?.orgId;

  if (!chemicalId) { toast('Kimyasal seçin.'); return true; }
  if (quantity <= 0) { toast('Miktar sıfırdan büyük olmalıdır.'); return true; }
  if (!lotNo) { toast('Lot numarası zorunludur.'); return true; }
  if (!orgId) { toast('Kuruma bağlı bir hesapla giriş yapmalısınız.'); return true; }

  const chem = (state.chemicals || []).find((c) => c.id === chemicalId);
  const button = e.target.querySelector('button[type="submit"]');
  if (button) button.disabled = true;

  addStock({
    orgId, chemicalId, lotNo, qty: quantity,
    unit: (chem && chem.unit) || 'lt', notes
  })
    .then(() => refreshStock())
    .then(() => {
      e.target.reset();
      toast(`${quantity} birim stok girişi kaydedildi.`);
    })
    .catch((err) => toast(err.message || 'Stok girişi kaydedilemedi.'))
    .finally(() => { if (button) button.disabled = false; });

  return true;
}

// Re-read stock after any write, so the table shows the database's balance
// rather than a local guess at it.
export async function refreshStock() {
  try {
    replaceInventory(await fetchInventory());
  } catch (err) {
    console.error('[repellent] stok yenilenemedi', err);
  }
  renderInventory();
}
