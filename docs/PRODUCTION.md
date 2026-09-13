# PestOps canlıya çıkış rehberi

Bu proje artık yalnızca pitch/demo verisi kullanan bir arayüz değildir. Web
uygulaması Supabase Auth + Postgres/RLS + private Storage kullanır; Flutter
uygulaması aynı Supabase projesine doğrudan bağlanır.

## Mevcut durum

Hazır olanlar:

- Gerçek giriş ve rol tabanlı erişim; tarayıcıdaki profil cache'i yetki kaynağı değildir.
- Siteler, istasyonlar, iş emirleri, teknisyenler, dosyalar, öneriler, sözleşmeler, stok ve faturalar için Supabase repository katmanı.
- Kat planları ve tesis belgeleri private Storage'da, kısa ömürlü signed URL ile açılır.
- GPS varışı ile QR tabanlı gerçek iş başlangıcı ayrıdır; audit kayıtları append-only'dir.
- Flutter offline outbox: varış, QR, form, yola çıkış ve tamamlama kayıtları sabit id ile tekrar gönderimde çift yazılmaz.
- CSP'de inline JavaScript kapalıdır; HTTP cleartext mobil ayarlarda kapalıdır.
- `npm test`, Flutter analyze/test ve Docker Postgres/RLS testi CI'a alınmıştır.

Yerel doğrulama:

- JavaScript syntax: 50 dosya
- Eksik import: 0
- Flutter analyze: 0 issue
- Flutter tests: 10 passed
- RLS/security assertions: 106 passed

Bu sonuçlar kodun release-candidate seviyesinde olduğunu gösterir; gerçek
kullanım için aşağıdaki hesap, veri, hukuk ve operasyon adımları canlı ortamda
tamamlanmalıdır.

## 1. Supabase kurulumu

1. Üretim için ayrı bir Supabase projesi oluşturun ve mümkünse AB bölgesi seçin.
2. `.env.example` değerlerini Vercel ortam değişkenlerine girin:
   `SUPABASE_URL` ve `SUPABASE_ANON_KEY`.
3. `SUPABASE_SERVICE_ROLE_KEY` tarayıcıya veya Flutter uygulamasına kesinlikle koymayın.
4. Migration'ları sırayla uygulayın. Supabase CLI bu Windows makinesinde kurulu değil; CI veya CLI bulunan güvenli bir makineden:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

Yeni migration'lar `supabase/migrations/` içinde tarihe göre uygulanır.

## 2. İlk kurum ve kullanıcılar

Supabase Auth panelinden ilk kullanıcıyı oluşturun, sonra SQL Editor'de gerçek
kurum ve profil ilişkisini tanımlayın:

```sql
insert into organizations (name, tax_office, tax_no)
values ('Şirket adı', 'Vergi dairesi', 'Vergi no')
returning id;

update profiles
set org_id = '<organization-id>', role = 'admin', full_name = 'Ad Soyad', is_active = true
where id = '<auth-user-id>';
```

Personel davet akışı admin ekranından, teknisyen mobil hesabı ise `technicians`
satırı `profiles.id` ile ilişkilendirilerek tamamlanmalıdır. Gerçek şirket,
vergi, iletişim ve tesis verilerini seed/demo bilgileri yerine girin.

## 3. Test ve deploy

Yerelde:

```bash
npm test
cd technician_app && flutter analyze && flutter test
cd .. && ./scripts/test-db.sh
```

Vercel için proje kökü bu repository, framework `Other`, build command boş,
output directory boş olmalıdır. `vercel.json` `/env.js` isteğini serverless
`api/env.js` fonksiyonuna yönlendirir. Preview ve Production ortam
değişkenlerini ayrı ayrı tanımlayın; ilk deploy sonrası login, admin,
technician ve customer hesaplarıyla smoke test yapın.

Özellikle dosya yükleme/indirme, QR, GPS, offline queue, müşteri öneri aksiyonu
ve rol sınırlarını test edin. Kırmızı CI ile deploy etmeyin.

## 4. Operasyonel zorunluluklar

- Supabase günlük yedekleri, PITR ve erişim logları etkinleştirilmelidir.
- Vercel/Supabase hata logları ve uptime alarmı kurulmalıdır.
- KVKK aydınlatma/metinleri, veri saklama süresi, çalışan konum verisi bildirimi,
  müşteri sözleşmesi ve erişim/retention politikası hukuk tarafından onaylanmalıdır.
- Admin hesaplarında MFA ve güçlü parola politikası zorunlu yapılmalıdır.
- İlk gerçek kullanıcı grubuyla kontrollü pilot yapılmalı; saha personeline
  offline senkron, QR etiketi ve GPS uyuşmazlığı prosedürü öğretilmelidir.
- İstasyon kodları, QR token'ları, cihaz barkodları, fiyatlar ve ruhsat belgeleri
  gerçek verilerle doğrulanmadan raporlar resmi belge olarak kullanılmamalıdır.

## 5. Bilinen sınırlar / sonraki ürün işleri

- Harici harita tile sağlayıcısının kullanım şartları ve kota/attribution ayarları
  üretim hesabında doğrulanmalıdır.
- Kat planı mobil uygulamada şu an iş emri içindeki basit plan görünümüdür; webdeki
  özel plan ve istasyon overlay deneyimi mobilde ayrıca iyileştirilebilir.
- Uygulama içi inline CSS hâlâ kullanıldığı için `style-src 'unsafe-inline'`
  bırakılmıştır; bu, JavaScript CSP'den bağımsız sonraki sertleştirme işidir.
- Android/iOS kamera, GPS izinleri, düşük bağlantı ve uygulama öldürülüp açılması
  fiziksel cihazlarda release öncesi test edilmelidir.

## 6. Supabase güncel davranışı

Supabase yeni public schema tablolarını Data API'ye otomatik açmama yönünde
değişiklik duyurdu; migration sonrası Dashboard Data API exposure ayarını ve
RLS'i ayrıca kontrol edin. Kaynak: [Supabase changelog](https://supabase.com/changelog?types=breaking-change).
