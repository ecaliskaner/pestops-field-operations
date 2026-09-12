// The issuing organization's own details.
//
// These print on every invoice and delivery note as the DÜZENLEYEN party, and
// until now there was no way to set them from the app — which meant in practice
// they were never set, and finance.js printed a hardcoded company with a
// hardcoded tax number onto every customer's documents.
//
// The preview beside the form is the point of the screen. A tax field is not
// something an operator fills in for its own sake; it is something they fill in
// because a document is wrong, so the screen shows them the document.

import { $, esc, toast } from '../core/dom.js';
import { state, setOrganization } from '../core/state.js';
import { updateOrganization } from '../data/repo/billing.js';

const gap = (text) => `<span style="color:var(--muted);">${text}</span>`;

function renderPreview(org) {
  const host = $('#orgPreview');
  if (!host) return;

  if (!org) {
    host.innerHTML = `<b>${gap('Kurum bilgisi yüklenemedi')}</b>`;
    return;
  }

  host.innerHTML = `
    <p class="overline">DÜZENLEYEN</p>
    <b>${esc(org.name) || gap('Unvan girilmemiş')}</b>
    <div class="bill-party-line">${org.address ? esc(org.address) : gap('Adres tanımlanmamış')}</div>
    <div class="bill-party-line">${org.taxOffice || org.taxNo
      ? `${esc(org.taxOffice)} · ${esc(org.taxNo)}`
      : gap('Vergi bilgisi tanımlanmamış')}</div>
    ${org.phone || org.email
      ? `<div class="bill-party-line">${esc(org.phone)}${org.phone && org.email ? ' · ' : ''}${esc(org.email)}</div>`
      : ''}`;
}

export function renderSettings() {
  const form = $('#orgSettingsForm');
  if (!form) return;

  const org = state.organization;
  // The form is filled from the loaded row rather than left blank, so an
  // operator correcting one field does not have to retype the rest.
  const set = (id, value) => { const el = $(id); if (el) el.value = value || ''; };
  set('#inpOrgName', org?.name);
  set('#inpOrgTaxOffice', org?.taxOffice);
  set('#inpOrgTaxNo', org?.taxNo);
  set('#inpOrgAddress', org?.address);
  set('#inpOrgPhone', org?.phone);
  set('#inpOrgEmail', org?.email);

  renderPreview(org);
}

export function orgSettingsSubmit(e) {
  if (e.target.id !== 'orgSettingsForm') return false;
  e.preventDefault();

  const org = state.organization;
  if (!org?.id) { toast('Kurum bilgisi henüz yüklenmedi.'); return true; }

  const f = new FormData(e.target);
  const name = String(f.get('name') || '').trim();
  if (!name) { toast('Kurum unvanı zorunludur.'); return true; }

  const taxNo = String(f.get('taxNo') || '').trim();
  // Warn, do not block. A VKN is ten digits and a TCKN eleven, but a foreign
  // entity may legitimately have neither, and refusing the save would leave the
  // document printing a gap for the sake of a format rule.
  if (taxNo && !/^\d{10,11}$/.test(taxNo)) {
    toast('Vergi numarası 10 (VKN) veya 11 (TCKN) haneli olmalıdır — yine de kaydedildi.');
  }

  const button = e.target.querySelector('button[type="submit"]');
  if (button) button.disabled = true;

  updateOrganization({
    id: org.id,
    name,
    taxOffice: String(f.get('taxOffice') || '').trim(),
    taxNo,
    address: String(f.get('address') || '').trim(),
    phone: String(f.get('phone') || '').trim(),
    email: String(f.get('email') || '').trim()
  })
    .then((saved) => {
      setOrganization(saved);
      renderSettings();
      toast('Kurum bilgileri kaydedildi.');
    })
    .catch((err) => toast(err.message || 'Kurum bilgisi kaydedilemedi.'))
    .finally(() => { if (button) button.disabled = false; });

  return true;
}
