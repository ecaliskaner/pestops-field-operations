// Technician credential registry (task 2-5, shared in 6-1).
//
// KVKK: these are placeholder compliance documents only. No real personal data
// (no TC kimlik, real SGK numbers, or genuine health records) is present or
// simulated — identifiers are masked and every surface that renders them shows
// a visible KVKK notice. The roadmap (§11) requires the *customer* to be able
// to open a servicing technician and see SGK / iş güvenliği / sağlık raporu, so
// this map is consumed by both the admin team view and the customer portal.

export const CREDENTIALS = {
  'Ayşe Demir':  { cert: 'ENH-2024-0143', certExp: '14 Mar 2027', sgk: true, health: '09 Şub 2027', permit: 'Biyosidal Uyg. — Halk Sağlığı' },
  'Mert Kaya':   { cert: 'ENH-2023-0288', certExp: '02 Kas 2026', sgk: true, health: '21 Eki 2026', permit: 'Biyosidal Uyg. — Halk Sağlığı' },
  'Ece Yılmaz':  { cert: 'ENH-2024-0091', certExp: '30 Haz 2027', sgk: true, health: '18 Nis 2027', permit: 'Biyosidal Uyg. + Fümigasyon' },
  'Can Öztürk':  { cert: 'ENH-2022-0455', certExp: '12 Ara 2026', sgk: true, health: '05 Ağu 2026', permit: 'Biyosidal Uyg. — Halk Sağlığı' }
};

export const getCredential = (tech) => CREDENTIALS[tech] || CREDENTIALS['Ayşe Demir'];

// One document row. Shared markup so the admin card and the customer portal
// render identically.
export function credentialDoc(icon, title, meta, ok) {
  return `
    <div class="cred-doc">
      <span class="cred-doc-icon">${icon}</span>
      <div class="cred-doc-body"><b>${title}</b><small>${meta}</small></div>
      <span class="cred-doc-status ${ok ? 'ok' : 'warn'}">${ok ? 'Geçerli' : 'Yakında'}</span>
    </div>`;
}

// The four document rows for one technician, in the roadmap's order.
export function credentialDocs(tech) {
  const c = getCredential(tech);
  return [
    credentialDoc('🧾', 'SGK Kaydı', 'SGK No: •••• •••• •• · Aktif sigortalı', c.sgk),
    credentialDoc('🦺', 'İş Güvenliği Belgesi', `Sertifika: ${c.cert} · Geçerlilik: ${c.certExp}`, true),
    credentialDoc('📋', 'Uygulama İzin Belgesi', c.permit, true),
    credentialDoc('🩺', 'Sağlık Raporu (Portör)', `Sonraki kontrol: ${c.health}`, true)
  ].join('');
}

export const KVKK_NOTICE = `🔒 <b>KVKK bildirimi:</b> Bu kartlar demo amaçlı yer tutucu belgelerdir. Gerçek kimlik, SGK veya sağlık verisi içermez; kişisel tanımlayıcılar maskelenmiştir.`;
