# Repellent — Canlıya Çıkış Rehberi

Bu belge, projeyi demo halinden gerçek kullanıma taşıyan işin durumunu ve kurulum
adımlarını tutar. Yol haritasının fazları için [PLAN.md](PLAN.md)'e bakın.

> **Mevcut durum:** Faz 1 (backend temeli) başladı. Veritabanı şeması, güvenlik
> politikaları ve iş kuralları yazıldı ve test edildi. Uygulamanın 37 view'ı
> **henüz** veritabanına bağlanmadı — hâlâ `data/state.json` üzerinden çalışıyor.
> **Bu haliyle canlıya çıkarılmamalıdır.**

---

## 1. Neyin hazır olduğu

| Bileşen | Dosya | Durum |
|---|---|---|
| Veritabanı şeması | `supabase/migrations/20260905000001_core_schema.sql` | ✅ Yazıldı ve uygulanıyor |
| Güvenlik politikaları (RLS) | `supabase/migrations/20260905000002_rls.sql` | ✅ Yazıldı, 37 test geçiyor |
| İş kuralları + dosya depolama | `supabase/migrations/20260905000003_rpc_and_storage.sql` | ✅ Yazıldı ve test edildi |
| Güvenlik testleri | `supabase/tests/rls_test.sql` | ✅ 37/37 |
| Test koşucusu | `scripts/test-db.sh` | ✅ Docker ile çalışıyor |
| Supabase istemcisi | `src/core/supabase.js` + `vendor/supabase.js` | ✅ Bağlandı ve tarayıcıda doğrulandı |
| Gerçek giriş (auth) | `src/core/auth.js` | ✅ Supabase Auth; demo şifresi ve arka kapılar kaldırıldı |
| XSS escape katmanı | `src/core/dom.js` (`esc`, `html`, `raw`) | ⚠️ Yazıldı ve test edildi (12/12); **106 çağrı yeri henüz çevrilmedi** |
| Güvenlik başlıkları / CSP | `server.js` | ✅ CSP + Permissions-Policy; `script-src` hâlâ `unsafe-inline` |
| View'ların veriye bağlanması | `src/views/*.js` (37 dosya) | ❌ Yapılmadı |
| Flutter uygulaması | `technician_app/` | ❌ Hâlâ eski REST API'ye bakıyor |

### Bu turda kapatılan güvenlik açıkları

| Açık | Neydi | Şimdi |
|---|---|---|
| Kodda gömülü şifre | `password === '123'` (`src/app.js`) | Supabase Auth ile gerçek doğrulama |
| Tek tıkla admin | Giriş ekranında 3 rol butonu | Kaldırıldı |
| Demo rol değiştirici | `switchRole()` kimlik doğrulamasız rol atlıyordu | Kaldırıldı — rol artık hesabın özelliği |
| Kimliksiz veri ezme | `PUT /api/state` herkese açıktı | Varsayılan **kapalı**; `ALLOW_LEGACY_STATE_WRITE=1` gerekir |
| Gizli dosya sızıntısı | `GET /.env`, `/.git/config`, `/data/state.json` servis ediliyordu | Reddediliyor (400) |
| Eksik çıkış | `logout()` Supabase oturumunu kapatmıyordu | `signOut()` token'ı da sonlandırıyor |
| Veri sızdırma kanalı | CSP yoktu | `connect-src` yalnızca kendi origin + Supabase |

---

## 2. Veri modeli — özet

Tek kiracılı değil, **çok kiracılı** kurgulandı: her iş satırı bir `org_id`
taşır ve tüm erişim ondan türer.

```
organizations ──┬── customers ──── sites ──┬── stations
                │                          ├── contracts
                │                          ├── site_files
                │                          └── recommendations
                ├── technicians ──┬── technician_rates      (yalnız yönetici)
                │                 └── technician_credentials
                ├── work_orders ──┬── work_order_events     (append-only)
                │                 ├── inspections ── inspection_photos
                │                 └── visit_reports
                ├── chemicals ──── inventory_items ── inventory_transactions
                ├── chemical_usages
                ├── invoices
                └── consent_records / audit_log             (KVKK)
```

### Kritik tasarım kararları

**`work_orders.real_work_started_at` yazılamaz.** Ürünün tüm iddiası şu:
*"ziyaret, birisi bir butona bastığında değil, ilk QR okutulduğunda başladı."*
Bu iddia ancak kolon düzenlenemiyorsa değerlidir. Bu yüzden:

- Teknisyene `work_orders` üzerinde **UPDATE politikası verilmedi**. Durum
  geçişleri yalnızca `wo_depart()`, `wo_arrive()`, `wo_scan_qr()`, `wo_complete()`
  fonksiyonları üzerinden yapılır.
- Bir trigger (`guard_wo_audit_columns`) kolonu korur: bir kez yazıldıktan sonra
  **superuser bile** değiştiremez. Test bunu doğruluyor.

**`work_order_events` append-only.** Tabloda SELECT ve INSERT politikası var,
UPDATE/DELETE politikası **bilerek yok**. Yönetici dahil kimse denetim kaydını
API üzerinden düzenleyemez veya silemez.

**Maliyet oranı ayrı tabloda.** RLS satır bazlıdır — bir politikayla müşteriden
tek bir kolonu gizleyemezsiniz. Müşterinin "bana Ayşe Demir hizmet verdi"yi
görüp Ayşe'nin saatlik maliyetini görmemesi için oran `technician_rates`
tablosunda ve yalnızca yöneticiye açık.

**QR token rastgele.** İstasyon kodundan (`R-01`) türetilmiyor;
`gen_random_bytes(16)`. Aksi halde saha adını bilen biri token'ı tahmin edip
ziyareti sahte olarak başlatabilirdi.

### RLS'te bilinmesi gereken tuzak

RLS'te bir UPDATE/DELETE, satırları filtreleyip **hata fırlatmadan 0 satır**
etkiler. Yalnızca INSERT (WITH CHECK) ve yetkisiz SELECT hata verir. Yani
istemci kodu **etkilenen satır sayısını kontrol etmelidir** — yoksa arayüz hiçbir
şey yazılmadığı halde "kaydedildi" der. Bu, view'lar bağlanırken en kolay
yapılacak hata.

---

## 3. Kurulum

### 3.1 Supabase projesi

1. [supabase.com](https://supabase.com) üzerinde yeni proje oluşturun.
   **Bölge: Frankfurt (eu-central-1)** — KVKK açısından AB, ABD'ye göre daha az
   yük getirir. Türkiye'de sunucu şartsa Supabase bulut yerine self-host gerekir;
   bu ayrı bir karar, §6'ya bakın.
2. Proje ayarlarından şunları not edin:
   - `Project URL` → `SUPABASE_URL`
   - `anon public` anahtarı → `SUPABASE_ANON_KEY`
   - `service_role` anahtarı → **tarayıcıya asla koymayın**, yalnızca sunucu
     tarafı yönetim işleri için.

### 3.2 Migration'ları uygulama

```bash
supabase link --project-ref <proje-ref>
supabase db push
```

### 3.3 Ortam değişkenleri

`.env.example` dosyasını `.env` olarak kopyalayın ve doldurun. `.env` **asla
commit edilmez** (`.gitignore` içinde olmalı).

### 3.4 İlk yöneticiyi oluşturma

Kayıt akışı bilerek yok: yeni bir `auth.users` satırı, `org_id`'si boş bir profil
üretir ve **boş `org_id` her politikada reddedilir**. Yani davetsiz kayıt olan
hiçbir veri göremez. İlk yöneticiyi Supabase panelinden elle atayın:

```sql
-- 1) Supabase Auth panelinden kullanıcıyı oluşturun, sonra:
insert into organizations (name, tax_office, tax_no)
values ('Repellent A.Ş.', '<vergi dairesi>', '<vergi no>')
returning id;

-- 2) Dönen id ile profili yetkilendirin:
update profiles
   set org_id = '<yukarıdaki id>', role = 'admin', full_name = 'Ad Soyad'
 where id = '<auth kullanıcı id>';
```

---

## 4. Testleri çalıştırma

```bash
./scripts/test-db.sh
```

Docker gerektirir. Tek kullanımlık bir Postgres ayağa kaldırır, tüm
migration'ları uygular, 37 güvenlik iddiasını doğrular ve konteyneri siler.
Herhangi bir iddia düşerse çıkış kodu sıfırdan farklı olur.

Testlerin kapsadığı başlıklar:

- Müşteri yalıtımı (başka müşterinin sahası, iş emri, faturası görünmüyor)
- Teknisyen yalıtımı (başkasının iş emri görünmüyor, atanamıyor)
- Maliyet verisinin gizliliği
- Ziyaret durum makinesi (varış ≠ iş başlangıcı; QR'sız tamamlanamaz)
- Yanlış sahanın QR'ı işi başlatmıyor
- Offline senkron tekrarında çift kayıt oluşmuyor (idempotency)
- Denetim kaydının değiştirilemezliği
- Anonim kullanıcının hiçbir şey görememesi

---

## 5. Sırada ne var (Faz 1'in kalanı)

1. `vendor/supabase.js` — Supabase JS istemcisini vendor'la (repo bağımlılıkları
   `vendor/` altında tutuyor, npm runtime bağımlılığı yok).
2. `src/core/auth.js` — gerçek giriş. Şu anda **şifre `123` koda gömülü**
   (`src/app.js:210`) ve giriş ekranında tek tıkla admin olan butonlar var
   (`index.html:1674`). İkisi de kaldırılmalı.
3. `server.js` — `/env.js` ucunu ekle, `PUT /api/state`'i **sil** (kimlik
   doğrulaması olmayan, tüm veriyi ezen uç).
4. Veri erişim katmanı — `src/data/repo/*.js`, view'ların `state` yerine
   kullanacağı sorgular.
5. 37 view'ın bağlanması. En büyük kalem.
6. Mevcut `data/state.json`'ı veritabanına taşıyan tek seferlik migration script'i.
7. XSS: 106 `innerHTML` kullanımı var, HTML escape fonksiyonu yok. Gerçek
   kullanıcı verisi girdiği anda sorun.
8. `api/mobileApi.js` ve `api/mobileData.js` — silinecek; Flutter uygulaması
   doğrudan Supabase'e bağlanacak.
9. `technician_app/lib/services/mock_backend.dart` — **kaldırılmalı**. Şu anda
   API'ye ulaşamayınca sahte iş emri gösteriyor; canlıda teknisyen olmayan bir
   işe gidebilir.

---

## 6. Açık kararlar

| Konu | Neden bekliyor |
|---|---|
| Hosting bölgesi | Supabase bulut (Frankfurt) mu, Türkiye'de self-host mu? KVKK yurtdışı aktarım yükümlülüğünü etkiler. |
| e-Fatura entegratörü | Finans modülü fatura kesecekse GİB entegratörü seçilmeli. |
| Mobil dağıtım | Play Store/App Store mu, kurumsal dağıtım mı? Konum izni Google'da ek inceleme gerektirir. |

---

## 7. KVKK kontrol listesi

Teknik iş bitse de bunlar tamamlanmadan canlıya çıkılmamalı:

- [ ] VERBİS kaydı (veri sorumluları sicili)
- [ ] Aydınlatma metni — müşteri ve teknisyen için ayrı
- [ ] Teknisyen konum takibi için açık rıza + iş sözleşmesinde hüküm
- [ ] Veri saklama ve imha politikası (GPS logları ne kadar tutulacak?)
- [ ] Veri işleme envanteri
- [ ] Supabase ile veri işleyen sözleşmesi (DPA)
- [ ] Yurtdışı aktarım için standart sözleşme (bölge AB ise)
- [ ] Gerçek SGK/sağlık belgesi yüklenecekse: `credentials` bucket'ı yalnızca
      ofise açık (politika hazır), erişim `audit_log`'a yazılmalı

Şemada bunlar için `consent_records` ve `audit_log` tabloları hazır, ancak
uygulama tarafında henüz doldurulmuyor.
