// Stock, the org's licensed product range, and the movements behind both.
//
// Three fabrications used to sit in this view. The product dropdown offered
// `chemicalDatabase` from data/catalog.js — a static list of twelve real-world
// brand names shipped with the app, none of which any particular customer is
// necessarily licensed to apply. The movement log read a two-row seeded array
// that nothing ever wrote to. And there was no way to define a product at all,
// which made the whole chemical flow unusable on a real account: the picker
// had nothing to pick.
//
// Defining a product is the entry point for everything downstream, so it lives
// here next to stock rather than behind a settings page. A product carries its
// biyosidal ruhsat number and expiry, because that is what decides whether it
// may be applied at all.

import { $, toast } from '../core/dom.js';
import { state, replaceInventory, replaceChemicals, replaceStockTransactions } from '../core/state.js';
import {
  fetchInventory, fetchChemicals, fetchStockTransactions, addStock, createChemical
} from '../data/repo/inventory.js';

// Everything below goes into innerHTML. Product names, lot numbers and free-
// text notes are operator input, so each interpolation is escaped — the same
// rule applied to the work list and the finding table.
const esc = (v) => String(v === null || v === undefined ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const DATE_FMT = { day: '2-digit', month: 'short', year: 'numeric' };
const shortDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('tr-TR', DATE_FMT) : '—';
const stamp = (iso) =>
  iso ? new Date(iso).toLocaleString('tr-TR', { ...DATE_FMT, hour: '2-digit', minute: '2-digit' }) : '—';

const money = (n) =>
  n ? `₺${Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}` : '—';

const TX_LABEL = { refill: 'İkmal', consume: 'Tüketim', adjust: 'Düzeltme', waste: 'İmha' };

function renderChemicals() {
  const tbody = $('#invChemicalTableBody');
  if (!tbody) return;
  const chemicals = state.chemicals || [];

  tbody.innerHTML = chemicals.map((c) => {
    // A lapsed licence is shown, not hidden. The operator needs to know the
    // product exists and why it is unusable, otherwise the missing entry in
    // the application picker looks like a bug.
    const badge = c.licenseExpired
      ? '<span class="status-chip critical">Ruhsat Doldu</span>'
      : '<span class="status-chip healthy">Geçerli</span>';
    return `
      <tr${c.licenseExpired ? ' style="opacity:.65;"' : ''}>
        <td><b>${esc(c.name)}</b></td>
        <td><small class="text-muted">${esc(c.activeIngredient) || '—'}</small></td>
        <td><code style="font-size:10px;">${esc(c.licenseNo) || '—'}</code></td>
        <td><small>${shortDate(c.licenseUntil)}</small></td>
        <td><small>${esc(c.unit)}</small></td>
        <td>${badge}</td>
      </tr>
    `;
  }).join('') ||
    '<tr><td colspan="6" class="empty" style="text-align:center;">Henüz ruhsatlı ürün tanımlanmamış. Sağdaki formdan ekleyin.</td></tr>';
}

function renderStock() {
  const tbody = $('#invStockTableBody');
  if (!tbody) return;
  const items = state.inventory || [];

  tbody.innerHTML = items.map((item) => {
    const isCritical = item.qty <= item.minQty;
    const statusText = isCritical ? 'Kritik Seviye' : 'Güvenli';
    const statusClass = isCritical ? 'critical' : 'healthy';
    return `
      <tr>
        <td><b>${esc(item.name)}</b></td>
        <td><code style="font-size:10px;">${esc(item.lotNo) || '—'}</code></td>
        <td style="font-weight:700; color:${isCritical ? 'var(--red)' : 'var(--ink)'};">${item.qty} ${esc(item.unit)}</td>
        <td><small class="text-muted">${item.minQty} ${esc(item.unit)}</small></td>
        <td><span class="status-chip ${statusClass}">${statusText}</span></td>
        <td>${money(item.unitCost)}${item.unitCost ? ` / ${esc(item.unit)}` : ''}</td>
      </tr>
    `;
  }).join('') ||
    '<tr><td colspan="6" class="empty" style="text-align:center;">Depoda kayıtlı stok bulunmuyor.</td></tr>';
}

function renderTransactions() {
  const tbody = $('#invTransactionTableBody');
  if (!tbody) return;
  const txs = state.inventoryTransactions || [];

  tbody.innerHTML = txs.map((tx) => {
    const isIn = tx.type === 'refill';
    const badgeColor = isIn ? 'var(--green)' : 'var(--red)';
    const sign = isIn ? '＋' : '－';
    return `
      <tr>
        <td><small class="text-muted">${stamp(tx.at)}</small></td>
        <td><b>${esc(tx.name) || 'Ürün'}</b><br><span style="color:var(--muted); font-size:9px;">${esc(tx.notes)}</span></td>
        <td style="font-weight:700; color:${badgeColor};">${sign}${tx.qty} ${esc(tx.unit)}</td>
        <td><span class="status-chip secondary" style="font-size:9px;">${TX_LABEL[tx.type] || esc(tx.type)}</span></td>
      </tr>
    `;
  }).join('') ||
    '<tr><td colspan="4" class="empty" style="text-align:center;">Henüz hareket kaydı bulunmuyor.</td></tr>';
}

function renderMetrics() {
  const chemicals = state.chemicals || [];
  const items = state.inventory || [];
  const txs = state.inventoryTransactions || [];

  // Counts the licensed range, not the number of lots: two lots of the same
  // product are one product. The old metric counted stock rows and called them
  // product types.
  $('#invTotalProducts').textContent = chemicals.length;

  const expired = chemicals.filter((c) => c.licenseExpired).length;
  const expiredEl = $('#invExpiredLicenses');
  if (expiredEl) {
    expiredEl.textContent = expired;
    expiredEl.classList.toggle('attention', expired > 0);
  }

  const criticalCount = items.filter((item) => item.qty <= item.minQty).length;
  $('#invCriticalStock').textContent = criticalCount;
  $('#invCriticalStock').classList.toggle('attention', criticalCount > 0);

  const last = txs[0];
  $('#invLastTransaction').textContent = last
    ? `${TX_LABEL[last.type] || last.type}: ${last.name || 'Ürün'} (${last.qty} ${last.unit})`
    : 'İşlem Yok';
}

// The refill picker offers the org's own products. An expired licence is shown
// but not selectable, for the same reason as in the application picker: taking
// more of an unusable product into stock is not something to encourage
// silently.
function renderRefillPicker() {
  const select = $('#refillChemSelect');
  if (!select) return;
  const chemicals = state.chemicals || [];
  const keep = select.value;

  select.innerHTML = chemicals.length
    ? `<option value="">-- Ürün seçin --</option>` + chemicals.map((c) =>
        `<option value="${esc(c.id)}"${c.licenseExpired ? ' disabled' : ''}>` +
        `${esc(c.name)}${c.licenseExpired ? ' (ruhsat doldu)' : ''}</option>`
      ).join('')
    : '<option value="">Önce ruhsatlı ürün tanımlayın</option>';

  if (keep && chemicals.some((c) => c.id === keep)) select.value = keep;
}

export function renderInventory() {
  if (!$('#invStockTableBody')) return;
  if (!state.inventory) state.inventory = [];
  if (!state.inventoryTransactions) state.inventoryTransactions = [];

  renderMetrics();
  renderChemicals();
  renderStock();
  renderTransactions();
  renderRefillPicker();
}

// deductStock() used to live here: it decremented a seeded array and pushed a
// fake movement row. Deduction is now part of record_chemical_usage(), which
// writes the application, the stock movement and the new balance in one
// transaction — a half-written stock ledger is the one outcome worth paying an
// RPC to avoid.

export function chemicalDefineSubmit(e) {
  if (e.target.id !== 'invChemicalForm') return false;
  e.preventDefault();

  const f = new FormData(e.target);
  const name = String(f.get('name') || '').trim();
  const orgId = state.currentUser?.orgId;

  if (!name) { toast('Ürün adı zorunludur.'); return true; }
  if (!orgId) { toast('Kuruma bağlı bir hesapla giriş yapmalısınız.'); return true; }

  const targetPests = String(f.get('targetPests') || '')
    .split(',').map((x) => x.trim()).filter(Boolean);

  const button = e.target.querySelector('button[type="submit"]');
  if (button) button.disabled = true;

  createChemical({
    orgId,
    name,
    activeIngredient: String(f.get('activeIngredient') || '').trim(),
    licenseNo: String(f.get('licenseNo') || '').trim(),
    licenseUntil: String(f.get('licenseUntil') || ''),
    targetPests,
    unit: String(f.get('unit') || 'lt')
  })
    .then(() => refreshChemicals())
    .then(() => {
      e.target.reset();
      toast(`${name} ruhsatlı ürün listesine eklendi.`);
    })
    .catch((err) => toast(err.message || 'Ürün tanımlanamadı.'))
    .finally(() => { if (button) button.disabled = false; });

  return true;
}

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

// Re-read stock and its movement log after any write, so both tables show the
// database's balance rather than a local guess at it. Fetched together because
// a movement without the balance it produced reads as a discrepancy.
export async function refreshStock() {
  const [items, txs] = await Promise.allSettled([
    fetchInventory(),
    fetchStockTransactions()
  ]);
  if (items.status === 'fulfilled') replaceInventory(items.value);
  else console.error('[repellent] stok yenilenemedi', items.reason);
  if (txs.status === 'fulfilled') replaceStockTransactions(txs.value);
  else console.error('[repellent] stok hareketleri yenilenemedi', txs.reason);
  renderInventory();
}

/** Re-read the licensed product range after defining a product. */
export async function refreshChemicals() {
  try {
    replaceChemicals(await fetchChemicals());
  } catch (err) {
    console.error('[repellent] ruhsatli urunler yenilenemedi', err);
  }
  renderInventory();
}
