-- Security regression tests for the RLS policies and the visit state machine.
--
-- These are not "does the query work" tests. Every case below asserts something
-- the business would be liable for if it broke: one customer reading another
-- customer's facility, a technician reading a colleague's route, a client
-- seeing staff cost rates, or anyone at all editing the recorded start time of
-- a visit. Run this file against a database with the three migrations applied.
--
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
--
-- Every assertion raises an exception on failure, so ON_ERROR_STOP is what
-- turns this into a pass/fail gate. The whole run happens inside a transaction
-- that is rolled back at the end — it leaves no rows behind.

begin;

-- ------------------------------------------------------------------ helpers

create or replace function t_ok(cond boolean, label text) returns void
language plpgsql as $fn$
begin
  if cond then
    raise notice 'PASS  %', label;
  else
    raise exception 'FAIL  %', label;
  end if;
end $fn$;

-- Assert that `stmt` fails. Used for the negative cases, where the whole point
-- is that the database refuses.
create or replace function t_denied(stmt text, label text) returns void
language plpgsql as $fn$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'PASS  % (reddedildi: %)', label, sqlerrm;
    return;
  end;
  raise exception 'FAIL  % — islem reddedilmeliydi ama basarili oldu', label;
end $fn$;

-- Become a given user, the way PostgREST does per request.
create or replace function t_login(p_uid uuid) returns void
language plpgsql as $fn$
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  execute 'set local role authenticated';
end $fn$;

create or replace function t_admin_reset() returns void
language plpgsql as $fn$
begin
  execute 'reset role';
end $fn$;

-- Assert that `stmt` changes nothing.
--
-- This is the shape most RLS denials actually take, and it is a trap worth
-- naming: an UPDATE or DELETE whose rows are filtered out by RLS does NOT
-- raise — it silently reports success having touched zero rows. Only INSERT
-- (WITH CHECK) and SELECT-then-fail paths produce an error. The security
-- outcome is the same, but the client must check the affected row count rather
-- than trusting the absence of an exception, or the UI will cheerfully say
-- "kaydedildi" when nothing was written.
create or replace function t_no_effect(stmt text, label text) returns void
language plpgsql as $fn$
declare n integer;
begin
  begin
    execute stmt;
    get diagnostics n = row_count;
  exception when others then
    raise notice 'PASS  % (reddedildi: %)', label, sqlerrm;
    return;
  end;
  if n = 0 then
    raise notice 'PASS  % (0 satir etkilendi)', label;
  else
    raise exception 'FAIL  % — % satir degisti', label, n;
  end if;
end $fn$;

-- ------------------------------------------------------------------ fixtures

-- Two organisations, so cross-tenant leakage has something to leak into.
insert into organizations (id, name) values
  ('00000000-0000-0000-0000-0000000000a1', 'Repellent A.S.'),
  ('00000000-0000-0000-0000-0000000000a2', 'Rakip Ilaclama');

insert into customers (id, org_id, name) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 'Acme Foods'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a1', 'Kuzey Lojistik');

-- Gebze and Hadimkoy are ~60 km apart; the arrival test relies on that.
insert into sites (id, org_id, customer_id, name, city, lat, lng, geofence_radius_m) values
  ('00000000-0000-0000-0000-000000000551',
   '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1',
   'Gebze Uretim Tesisi', 'Kocaeli', 40.8000, 29.4300, 150),
  ('00000000-0000-0000-0000-000000000552',
   '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c2',
   'Hadimkoy Dagitim Merkezi', 'Istanbul', 41.1200, 28.6800, 150);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'admin@example.test'),
  ('00000000-0000-0000-0000-0000000000e2', 'tech1@example.test'),
  ('00000000-0000-0000-0000-0000000000e3', 'tech2@example.test'),
  ('00000000-0000-0000-0000-0000000000e4', 'acme@example.test');

-- The handle_new_user trigger already inserted blank profiles; assign them.
update profiles set org_id = '00000000-0000-0000-0000-0000000000a1',
                    role = 'admin', full_name = 'Ofis Yoneticisi'
 where id = '00000000-0000-0000-0000-0000000000e1';
update profiles set org_id = '00000000-0000-0000-0000-0000000000a1',
                    role = 'tech', full_name = 'Teknisyen Bir'
 where id = '00000000-0000-0000-0000-0000000000e2';
update profiles set org_id = '00000000-0000-0000-0000-0000000000a1',
                    role = 'tech', full_name = 'Teknisyen Iki'
 where id = '00000000-0000-0000-0000-0000000000e3';
update profiles set org_id = '00000000-0000-0000-0000-0000000000a1',
                    role = 'client', customer_id = '00000000-0000-0000-0000-0000000000c1',
                    full_name = 'Acme Yetkilisi'
 where id = '00000000-0000-0000-0000-0000000000e4';

insert into technicians (id, org_id, profile_id, full_name) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000e2', 'Teknisyen Bir'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000e3', 'Teknisyen Iki');

insert into technician_rates (technician_id, org_id, hourly_rate) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 180.00);

insert into stations (id, org_id, site_id, code, type, qr_token) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000000551', 'R-01', 'rodent', 'token-gebze-r01'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000000552', 'R-01', 'rodent', 'token-hadimkoy-r01');

insert into work_orders (id, org_id, site_id, technician_id, code, title) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000000551',
   '00000000-0000-0000-0000-0000000000b1', 'WO-1001', 'Gebze periyodik'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000000552',
   '00000000-0000-0000-0000-0000000000b2', 'WO-1002', 'Hadimkoy periyodik');

-- ================================================================== TENANCY

do $$ begin perform t_login('00000000-0000-0000-0000-0000000000e4'); end $$;  -- Acme client

do $$ begin
  perform t_ok((select count(*) from sites) = 1,
    'Musteri yalnizca kendi sahasini goruyor');
  perform t_ok(not exists (select 1 from sites where name like 'Hadimkoy%'),
    'Musteri baska musterinin sahasini goremiyor');
  perform t_ok((select count(*) from work_orders) = 1,
    'Musteri yalnizca kendi sahasinin is emrini goruyor');
  perform t_ok((select count(*) from technician_rates) = 0,
    'Musteri teknisyen maliyet oranini goremiyor');
  perform t_ok((select count(*) from inventory_items) = 0,
    'Musteri stok verisini goremiyor');
end $$;

-- The customer may see the technician who served them, and only that one.
do $$ begin
  perform t_ok((select count(*) from technicians) = 1,
    'Musteri yalnizca kendisine hizmet veren teknisyeni goruyor');
  perform t_ok(exists (select 1 from technicians where full_name = 'Teknisyen Bir'),
    'Gorunen teknisyen dogru kisi');
end $$;

-- ================================================================== TECHNICIAN

do $$ begin perform t_admin_reset(); perform t_login('00000000-0000-0000-0000-0000000000e2'); end $$;

do $$ begin
  perform t_ok((select count(*) from work_orders) = 1,
    'Teknisyen yalnizca kendi is emrini goruyor');
  perform t_ok((select code from work_orders) = 'WO-1001',
    'Gorunen is emri kendi is emri');
  perform t_ok((select count(*) from technician_rates) = 0,
    'Teknisyen maliyet oranlarini goremiyor');
  perform t_ok((select count(*) from sites) = 2,
    'Teknisyen orgun tum sahalarini goruyor (navigasyon icin)');
end $$;

-- The audit column must be unreachable by a direct write, whoever asks.
do $$ begin
  perform t_no_effect(
    $q$update work_orders set real_work_started_at = now()
        where id = '00000000-0000-0000-0000-0000000000f1'$q$,
    'Teknisyen real_work_started_at kolonunu dogrudan yazamiyor');
  perform t_ok((select real_work_started_at from work_orders
                where id = '00000000-0000-0000-0000-0000000000f1') is null,
    'Dogrudan UPDATE denemesinden sonra baslangic zamani hala bos');
  perform t_no_effect(
    $q$update work_orders set technician_id = '00000000-0000-0000-0000-0000000000b1'
        where id = '00000000-0000-0000-0000-0000000000f2'$q$,
    'Teknisyen baskasinin is emrini kendine atayamiyor');
  perform t_denied(
    $q$select wo_depart('00000000-0000-0000-0000-0000000000f2')$q$,
    'Teknisyen baskasinin is emrini baslatamiyor');
end $$;

-- ================================================================== STATE MACHINE

do $$ begin
  perform t_denied(
    $q$select wo_complete('00000000-0000-0000-0000-0000000000f1')$q$,
    'QR okutulmadan is tamamlanamiyor');
end $$;

do $$
declare r jsonb;
begin
  perform wo_depart('00000000-0000-0000-0000-0000000000f1');
  perform t_ok((select status from work_orders
                where id = '00000000-0000-0000-0000-0000000000f1') = 'on_the_way',
    'Yola cikildi durumu yaziliyor');

  -- Arrival reported from ~60 km away must be flagged, not silently accepted.
  r := wo_arrive('00000000-0000-0000-0000-0000000000f1', 41.1200, 28.6800);
  perform t_ok((r->>'insideGeofence')::boolean = false,
    'Geofence disindan bildirilen varis mismatch olarak isaretleniyor');
  perform t_ok(exists (select 1 from work_order_events
                       where work_order_id = '00000000-0000-0000-0000-0000000000f1'
                         and event_type = 'gps_mismatch'),
    'gps_mismatch olayi denetim kaydina yaziliyor');
  perform t_ok((select real_work_started_at from work_orders
                where id = '00000000-0000-0000-0000-0000000000f1') is null,
    'Varis is baslangici DEGIL — real_work_started_at hala bos');
end $$;

-- A sticker from another facility does not start this job.
do $$ begin
  perform t_denied(
    $q$select wo_scan_qr('00000000-0000-0000-0000-0000000000f1', 'token-hadimkoy-r01')$q$,
    'Baska sahanin QR kodu bu isi baslatmiyor');
end $$;

do $$
declare r jsonb; started timestamptz;
begin
  r := wo_scan_qr('00000000-0000-0000-0000-0000000000f1', 'token-gebze-r01', 'evt-001');
  perform t_ok((r->>'isFirstScan')::boolean, 'Ilk QR taramasi isFirstScan doner');
  started := (select real_work_started_at from work_orders
              where id = '00000000-0000-0000-0000-0000000000f1');
  perform t_ok(started is not null, 'Ilk QR gercek is baslangicini yaziyor');
  perform t_ok((select status from work_orders
                where id = '00000000-0000-0000-0000-0000000000f1') = 'started_by_first_qr',
    'Durum started_by_first_qr oluyor');

  -- Idempotency: the same outbox entry replayed must change nothing.
  r := wo_scan_qr('00000000-0000-0000-0000-0000000000f1', 'token-gebze-r01', 'evt-001');
  perform t_ok((r->>'deduped')::boolean, 'Ayni mobileEventId tekrar gonderildiginde deduped');
  perform t_ok((select count(*) from work_order_events
                where work_order_id = '00000000-0000-0000-0000-0000000000f1'
                  and event_type = 'first_qr_scanned') = 1,
    'Tekrarlanan senkron ikinci bir first_qr_scanned kaydi olusturmuyor');
  perform t_ok((select real_work_started_at from work_orders
                where id = '00000000-0000-0000-0000-0000000000f1') = started,
    'Baslangic zamani tekrar taramada degismiyor');
end $$;

-- Even a superuser cannot move the time once it is recorded.
do $$ begin
  perform t_admin_reset();
  perform t_denied(
    $q$update work_orders set real_work_started_at = now() - interval '2 hours'
        where id = '00000000-0000-0000-0000-0000000000f1'$q$,
    'Kaydedilen baslangic zamani superuser tarafindan bile degistirilemiyor');
end $$;

-- ================================================================== AUDIT TRAIL

do $$ begin perform t_login('00000000-0000-0000-0000-0000000000e1'); end $$;  -- admin

do $$
declare before_count integer;
begin
  select count(*) into before_count from work_order_events
   where work_order_id = '00000000-0000-0000-0000-0000000000f1';
  perform t_ok(before_count > 0, 'Denetim kaydinda olay var (testin anlamli olmasi icin)');

  perform t_no_effect(
    $q$update work_order_events set event_type = 'temizlendi'
        where work_order_id = '00000000-0000-0000-0000-0000000000f1'$q$,
    'Yonetici denetim kaydini duzenleyemiyor (append-only)');
  perform t_no_effect(
    $q$delete from work_order_events
        where work_order_id = '00000000-0000-0000-0000-0000000000f1'$q$,
    'Yonetici denetim kaydini silemiyor (append-only)');

  perform t_ok((select count(*) from work_order_events
                where work_order_id = '00000000-0000-0000-0000-0000000000f1') = before_count,
    'Silme denemesinden sonra olay sayisi degismedi');
  perform t_ok(not exists (select 1 from work_order_events where event_type = 'temizlendi'),
    'Duzenleme denemesinden sonra olay tipi degismedi');
  perform t_ok((select count(*) from work_orders) = 2,
    'Yonetici orgun tum is emirlerini goruyor');
  perform t_ok((select count(*) from technician_rates) = 1,
    'Yonetici maliyet oranlarini gorebiliyor');
end $$;

-- ================================================================== ANON

do $$ begin
  perform t_admin_reset();
  execute 'set local role anon';
  perform t_denied($q$select count(*) from sites$q$,
    'Anonim kullanici hicbir sahayi goremiyor');
  perform t_denied($q$select count(*) from work_orders$q$,
    'Anonim kullanici hicbir is emrini goremiyor');
end $$;


-- ================== MUSTERI TALEBI + KAPALI AKSIYON DONGUSU ==============
--
-- Two customer-facing write paths were added, and both deliberately bypass the
-- read-only client policies through SECURITY DEFINER RPCs. That makes them the
-- highest-risk surface in the schema: if either forgets its ownership check, a
-- customer can act on another company's facility. These assert the checks.

do $$
declare
  wo_id  uuid;
  rec_id uuid;
  st     text;
begin
  perform t_admin_reset();

  -- A finding on the client's own site, and one on a site they do not own.
  insert into recommendations (id, org_id, site_id, description, category, status)
  values ('00000000-0000-0000-0000-0000000000d1',
          '00000000-0000-0000-0000-0000000000a1',
          '00000000-0000-0000-0000-000000000551',
          'Depo kapi esigi contasi yipranmis', 'BRCGS', 'open'),
         ('00000000-0000-0000-0000-0000000000d2',
          '00000000-0000-0000-0000-0000000000a1',
          '00000000-0000-0000-0000-000000000552',
          'Baska musterinin bulgusu', 'AIB', 'open');

  -- ---------------------------------------------------------- client steps
  perform t_login('00000000-0000-0000-0000-0000000000e4');   -- Acme, owns 551

  perform t_ok((select count(*) from recommendations) = 1,
    'Musteri yalnizca kendi sahasinin bulgusunu goruyor');

  -- Raising a service request on their own site works...
  select id into wo_id from request_service(
    '00000000-0000-0000-0000-000000000551', 'AC'::visit_type, 'Kemirgen gordum', 'Bugun icinde');
  perform t_ok(wo_id is not null, 'Musteri kendi sahasi icin servis talebi acabiliyor');

  perform t_admin_reset();
  perform t_ok((select requested_by_customer from work_orders where id = wo_id),
    'Talep musteri kaynakli olarak isaretleniyor');
  perform t_ok((select status from work_orders where id = wo_id) = 'scheduled',
    'Talep planlanmayi bekleyen is emri olarak aciliyor');
  perform t_ok(exists (select 1 from work_order_events
                       where work_order_id = wo_id and event_type = 'customer_requested'),
    'Talep denetim kaydina yaziliyor');

  -- ...but not on somebody else's site.
  perform t_login('00000000-0000-0000-0000-0000000000e4');
  perform t_denied(
    $q$select request_service('00000000-0000-0000-0000-000000000552', 'AC'::visit_type, 'x', 'y')$q$,
    'Musteri baska musterinin sahasi icin talep acamiyor');

  -- The RPC is the only write path; a direct insert must still be refused.
  perform t_no_effect(
    $q$insert into work_orders (org_id, site_id, code, title, priority, visit_type)
       values ('00000000-0000-0000-0000-0000000000a1',
               '00000000-0000-0000-0000-000000000551', 'WO-HACK', 'sahte', 'critical', 'AC')$q$,
    'Musteri dogrudan is emri olusturamiyor');

  -- ------------------------------------------------- the action loop steps
  rec_id := '00000000-0000-0000-0000-0000000000d1';

  perform respond_to_recommendation(rec_id, 'Conta yenilendi', 'org/site/rec/1.jpg');
  perform t_admin_reset();
  select status into st from recommendations where id = rec_id;
  perform t_ok(st = 'in_progress', 'Musteri aksiyonu bulguyu onaya gonderiyor');
  perform t_ok((select customer_responded_at from recommendations where id = rec_id) is not null,
    'Musteri yanit zamani kaydediliyor');

  -- The whole point of the approval step: the customer cannot close their own
  -- finding, by the RPC or by any direct write.
  perform t_ok(st <> 'done', 'Musteri kendi bulgusunu KAPATAMIYOR (RPC done yazmiyor)');
  perform t_login('00000000-0000-0000-0000-0000000000e4');
  perform t_no_effect(
    format($q$update recommendations set status = 'done' where id = %L$q$, rec_id),
    'Musteri bulguyu dogrudan kapatamiyor');

  -- A customer must not be able to act on another company's finding either.
  perform t_denied(
    $q$select respond_to_recommendation('00000000-0000-0000-0000-0000000000d2', 'x', '')$q$,
    'Musteri baska musterinin bulgusuna aksiyon bildiremiyor');

  -- ------------------------------------------------------- operator closes
  perform t_login('00000000-0000-0000-0000-0000000000e1');   -- admin
  update recommendations
     set status = 'done', approved_by = '00000000-0000-0000-0000-0000000000e1',
         approved_at = now(), closed_at = now()
   where id = rec_id;
  perform t_admin_reset();
  perform t_ok((select status from recommendations where id = rec_id) = 'done',
    'Yonetici bulguyu onaylayip kapatabiliyor');

  -- And once closed it is closed: no further customer action.
  perform t_login('00000000-0000-0000-0000-0000000000e4');
  perform t_denied(
    format($q$select respond_to_recommendation(%L, 'tekrar', '')$q$, rec_id),
    'Kapatilmis bulguya yeniden aksiyon bildirilemiyor');

  perform t_admin_reset();
end $$;


-- ==================== OFIS KAPANIS OVERRIDE'I ==========================
--
-- wo_complete() ilk QR olmadan kapatmayi reddediyor (yukarida test edildi).
-- Ofis icin acilan yol bu reddi asiyor, o yuzden kendi kisitlari test edilir:
-- yalnizca yonetici, gerekce zorunlu, ve kullanildigi denetim kaydina yaziliyor.

do $$
declare w work_orders;
begin
  perform t_admin_reset();

  insert into work_orders (id, org_id, site_id, technician_id, code, title, priority, visit_type, status)
  values ('00000000-0000-0000-0000-0000000000f9',
          '00000000-0000-0000-0000-0000000000a1',
          '00000000-0000-0000-0000-000000000551',
          '00000000-0000-0000-0000-0000000000b1',
          'WO-OFFICE', 'Kagit uzerinden kapanacak is', 'normal', 'RZ', 'scheduled');

  -- A technician may not use the office override.
  perform t_login('00000000-0000-0000-0000-0000000000e2');
  perform t_denied(
    $q$select wo_complete_by_office('00000000-0000-0000-0000-0000000000f9', 'olmaz')$q$,
    'Teknisyen ofis kapanisini kullanamiyor');

  -- The customer certainly may not.
  perform t_login('00000000-0000-0000-0000-0000000000e4');
  perform t_denied(
    $q$select wo_complete_by_office('00000000-0000-0000-0000-0000000000f9', 'olmaz')$q$,
    'Musteri ofis kapanisini kullanamiyor');

  -- The admin may, but not without saying why.
  perform t_login('00000000-0000-0000-0000-0000000000e1');
  perform t_denied(
    $q$select wo_complete_by_office('00000000-0000-0000-0000-0000000000f9', '   ')$q$,
    'Gerekcesiz ofis kapanisi reddediliyor');

  select * into w from wo_complete_by_office(
    '00000000-0000-0000-0000-0000000000f9', 'Teknisyenin telefonu sahada bozuldu');
  perform t_ok(w.status = 'completed', 'Yonetici gerekce ile is emrini kapatabiliyor');

  perform t_admin_reset();
  -- The whole point: using it leaves a mark an auditor can find.
  perform t_ok(exists (select 1 from work_order_events
                       where work_order_id = '00000000-0000-0000-0000-0000000000f9'
                         and event_type = 'completed_without_qr'),
    'Ofis kapanisi denetim kaydina istisna olarak yaziliyor');
  perform t_ok((select payload->>'reason' from work_order_events
                where work_order_id = '00000000-0000-0000-0000-0000000000f9'
                  and event_type = 'completed_without_qr') = 'Teknisyenin telefonu sahada bozuldu',
    'Gerekce denetim kaydinda saklaniyor');
  perform t_ok((select real_work_started_at from work_orders
                where id = '00000000-0000-0000-0000-0000000000f9') is null,
    'Ofis kapanisi gercek is baslangicini UYDURMUYOR');

  -- Closing twice would double-count the visit in every report.
  perform t_login('00000000-0000-0000-0000-0000000000e1');
  perform t_denied(
    $q$select wo_complete_by_office('00000000-0000-0000-0000-0000000000f9', 'tekrar')$q$,
    'Kapatilmis is emri ikinci kez kapatilamiyor');

  perform t_admin_reset();
end $$;


-- ============== KIMYASAL UYGULAMA + STOK MUHASEBESI =====================
--
-- record_chemical_usage() tek islemde uc sey yazar: uygulama, stok hareketi ve
-- yeni bakiye. Yaridan bolunmus bir stok defteri, eski davranistan daha kotudur.

do $$
declare
  chem_id uuid := '00000000-0000-0000-0000-0000000000c9';
  stock_item uuid := '00000000-0000-0000-0000-0000000000d9';
  before_qty numeric;
  after_qty  numeric;
begin
  perform t_admin_reset();

  insert into chemicals (id, org_id, name, unit, license_no, is_active)
  values (chem_id, '00000000-0000-0000-0000-0000000000a1', 'Test Biyosidal', 'gr', 'R-TEST', true);
  insert into inventory_items (id, org_id, chemical_id, lot_no, qty, unit, min_qty, unit_cost)
  values (stock_item, '00000000-0000-0000-0000-0000000000a1', chem_id, 'LOT-T1', 100, 'gr', 10, 3);

  select qty into before_qty from inventory_items where id = stock_item;

  -- The customer must not be able to record an application at all.
  perform t_login('00000000-0000-0000-0000-0000000000e4');
  perform t_denied(
    format($q$select record_chemical_usage('00000000-0000-0000-0000-0000000000f1', %L, 10, 'gr', 'depo', '')$q$, chem_id),
    'Musteri kimyasal uygulamasi kaydedemiyor');

  -- The technician who owns the job can.
  perform t_login('00000000-0000-0000-0000-0000000000e2');
  perform record_chemical_usage('00000000-0000-0000-0000-0000000000f1', chem_id, 25, 'gr', 'Depo', 'test');

  perform t_admin_reset();
  select qty into after_qty from inventory_items where id = stock_item;
  perform t_ok(after_qty = before_qty - 25, 'Uygulama stoktan dusuluyor (100 -> 75)');
  perform t_ok(exists (select 1 from chemical_usages
                       where chemical_id = chem_id and quantity = 25),
    'Uygulama kimyasal kullanim kaydina yaziliyor');
  perform t_ok(exists (select 1 from inventory_transactions
                       where item_id = stock_item and type = 'consume' and qty = 25),
    'Stok hareketi ayni islemde yaziliyor');

  -- A zero or negative quantity would corrupt the ledger.
  perform t_login('00000000-0000-0000-0000-0000000000e2');
  perform t_denied(
    format($q$select record_chemical_usage('00000000-0000-0000-0000-0000000000f1', %L, 0, 'gr', 'x', '')$q$, chem_id),
    'Sifir miktarli uygulama reddediliyor');

  -- Restock is an admin action.
  perform t_login('00000000-0000-0000-0000-0000000000e2');
  perform t_denied(
    format($q$select restock_inventory(%L, 50, 'giris')$q$, stock_item),
    'Teknisyen stok girisi yapamiyor');

  perform t_login('00000000-0000-0000-0000-0000000000e1');
  perform restock_inventory(stock_item, 50, 'Depo girisi');
  perform t_admin_reset();
  perform t_ok((select qty from inventory_items where id = stock_item) = 125,
    'Yonetici stok girisi bakiyeyi artiriyor (75 -> 125)');
  perform t_ok(exists (select 1 from inventory_transactions
                       where item_id = stock_item and type = 'refill' and qty = 50),
    'Stok girisi hareket olarak kaydediliyor');

  perform t_admin_reset();
end $$;

-- ============== RUHSATLI URUN TANIMLAMA ================================
--
-- Urun tanimlama RPC uzerinden degil, dogrudan insert ile yapilir: chemicals
-- uzerindeki chem_admin_write policy'si zaten org + yonetici kontrolunu
-- yapiyor, bir RPC ayni kontrolu tekrar yazmaktan baska is gormezdi. Bu
-- testler, o policy'nin gercekten tek koruma oldugunu dogruluyor.

do $$
declare
  new_chem uuid := '00000000-0000-0000-0000-0000000000ca';
begin
  perform t_admin_reset();

  -- A technician may read the range but must not extend it: which products the
  -- company is licensed to apply is not a field decision.
  perform t_login('00000000-0000-0000-0000-0000000000e2');
  perform t_denied(
    $q$insert into chemicals (org_id, name, unit)
       values ('00000000-0000-0000-0000-0000000000a1', 'Teknisyen Urunu', 'lt')$q$,
    'Teknisyen ruhsatli urun tanimlayamiyor');

  -- Nor may a customer.
  perform t_login('00000000-0000-0000-0000-0000000000e4');
  perform t_denied(
    $q$insert into chemicals (org_id, name, unit)
       values ('00000000-0000-0000-0000-0000000000a1', 'Musteri Urunu', 'lt')$q$,
    'Musteri ruhsatli urun tanimlayamiyor');

  -- The admin may, for their own org.
  perform t_login('00000000-0000-0000-0000-0000000000e1');
  insert into chemicals (id, org_id, name, active_ingredient, license_no, license_until, unit)
  values (new_chem, '00000000-0000-0000-0000-0000000000a1',
          'Yeni Biyosidal', 'Deltamethrin', 'R-2026-01', '2027-01-01', 'lt');

  perform t_admin_reset();
  perform t_ok(exists (select 1 from chemicals where id = new_chem and license_no = 'R-2026-01'),
    'Yonetici ruhsatli urun tanimlayabiliyor');

  -- An admin of another org must not be able to file a product against this
  -- one. The rival admin is created here rather than in the shared fixtures,
  -- so no earlier row-count assertion shifts underneath this test.
  perform t_admin_reset();
  insert into auth.users (id, email)
  values ('00000000-0000-0000-0000-0000000000e5', 'rakip@example.test');
  update profiles set org_id = '00000000-0000-0000-0000-0000000000a2',
                      role = 'admin', full_name = 'Rakip Yoneticisi'
   where id = '00000000-0000-0000-0000-0000000000e5';
  perform t_login('00000000-0000-0000-0000-0000000000e5');
  perform t_denied(
    $q$insert into chemicals (org_id, name, unit)
       values ('00000000-0000-0000-0000-0000000000a1', 'Yabanci Urun', 'lt')$q$,
    'Baska kurumun yoneticisi bu kuruma urun tanimlayamiyor');

  -- Retiring a product is a flag, never a delete: chemical_usages references it
  -- and those rows are the record of what was applied on a customer's premises.
  perform t_login('00000000-0000-0000-0000-0000000000e1');
  update chemicals set is_active = false where id = new_chem;
  perform t_admin_reset();
  perform t_ok((select is_active from chemicals where id = new_chem) = false,
    'Urun silinmeden kullanim disi birakilabiliyor');

  perform t_admin_reset();
end $$;


-- ============== FATURA KESME VE YASAM DONGUSU ==========================
--
-- Faturanin kimligi sunucuya, tutari yoneticiye aittir. issue_invoice()
-- musteriyi sahadan okur, numarayi kendisi atar ve ayni donemin ikinci kez
-- faturalanmasini reddeder; ucunu de disaridan almaz.

do $$
declare
  site_a   uuid := '00000000-0000-0000-0000-000000000551';
  first_inv  invoices;
  second_inv invoices;
begin
  perform t_admin_reset();

  -- Neither a technician nor a customer may cut an invoice.
  perform t_login('00000000-0000-0000-0000-0000000000e2');
  perform t_denied(
    format($q$select issue_invoice(%L, '2026-07-01', '2026-07-31', 4000, 700, 300, 'test', 30)$q$, site_a),
    'Teknisyen fatura kesemiyor');

  perform t_login('00000000-0000-0000-0000-0000000000e4');
  perform t_denied(
    format($q$select issue_invoice(%L, '2026-07-01', '2026-07-31', 4000, 700, 300, 'test', 30)$q$, site_a),
    'Musteri fatura kesemiyor');

  -- A zero or negative amount is not an invoice.
  perform t_login('00000000-0000-0000-0000-0000000000e1');
  perform t_denied(
    format($q$select issue_invoice(%L, '2026-07-01', '2026-07-31', 0, 0, 0, 'test', 30)$q$, site_a),
    'Sifir tutarli fatura reddediliyor');

  -- The period must make sense.
  perform t_denied(
    format($q$select issue_invoice(%L, '2026-07-31', '2026-07-01', 4000, 700, 300, 'test', 30)$q$, site_a),
    'Ters donem reddediliyor');

  -- The admin can, and the server assigns the code and the customer.
  first_inv := issue_invoice(site_a, '2026-07-01', '2026-07-31', 4000, 700, 300, 'Temmuz', 30);
  perform t_admin_reset();
  perform t_ok(first_inv.code = 'FTR-2026-0001',
    'Fatura numarasi sunucu tarafindan atandi (FTR-2026-0001)');
  perform t_ok(first_inv.customer_id = '00000000-0000-0000-0000-0000000000c1',
    'Musteri sahadan okundu, cagirandan alinmadi');
  perform t_ok(first_inv.status = 'draft',
    'Yeni fatura taslak olarak aciliyor');

  -- The same period again must be refused, not silently duplicated.
  perform t_login('00000000-0000-0000-0000-0000000000e1');
  perform t_denied(
    format($q$select issue_invoice(%L, '2026-07-01', '2026-07-31', 4000, 700, 300, 'tekrar', 30)$q$, site_a),
    'Ayni donem ikinci kez faturalanamiyor');

  -- A different period gets the next number in the series.
  second_inv := issue_invoice(site_a, '2026-08-01', '2026-08-31', 4200, 750, 320, 'Agustos', 30);
  perform t_admin_reset();
  perform t_ok(second_inv.code = 'FTR-2026-0002',
    'Sonraki fatura seride bir sonraki numarayi aliyor');

  -- A draft is internal: the customer must not see it.
  perform t_login('00000000-0000-0000-0000-0000000000e4');
  perform t_ok((select count(*) from invoices) = 0,
    'Musteri taslak faturalari goremiyor');

  -- Lifecycle. Draft cannot jump straight to paid.
  perform t_login('00000000-0000-0000-0000-0000000000e1');
  perform t_denied(
    format($q$select set_invoice_status(%L, 'paid')$q$, first_inv.id),
    'Taslak dogrudan odendi yapilamiyor');

  perform set_invoice_status(first_inv.id, 'sent');
  perform t_admin_reset();
  perform t_ok((select status from invoices where id = first_inv.id) = 'sent',
    'Yonetici faturayi gonderildi yapabiliyor');

  -- Once issued the customer can see it.
  perform t_login('00000000-0000-0000-0000-0000000000e4');
  perform t_ok((select count(*) from invoices) = 1,
    'Musteri yalnizca kesilmis kendi faturasini goruyor');
  perform t_denied(
    format($q$select set_invoice_status(%L, 'paid')$q$, first_inv.id),
    'Musteri faturayi odendi isaretleyemiyor');

  perform t_login('00000000-0000-0000-0000-0000000000e1');
  perform set_invoice_status(first_inv.id, 'paid');
  perform t_admin_reset();
  perform t_ok((select paid_at from invoices where id = first_inv.id) is not null,
    'Odeme zamani kaydediliyor');

  -- Paid is the end of the line; nothing walks it back to be re-edited.
  perform t_login('00000000-0000-0000-0000-0000000000e1');
  perform t_denied(
    format($q$select set_invoice_status(%L, 'draft')$q$, first_inv.id),
    'Odenmis fatura taslaga geri alinamiyor');
  perform t_denied(
    format($q$select set_invoice_status(%L, 'paid')$q$, first_inv.id),
    'Ayni duruma tekrar gecilemiyor');

  -- A cancelled period frees the slot, so a mistake can be re-issued.
  perform set_invoice_status(second_inv.id, 'cancelled');
  perform issue_invoice(site_a, '2026-08-01', '2026-08-31', 4200, 750, 320, 'Agustos duzeltme', 30);
  perform t_admin_reset();
  perform t_ok((select count(*) from invoices
                where site_id = site_a and period_start = '2026-08-01'
                  and status <> 'cancelled') = 1,
    'Iptal edilen donem yeniden faturalanabiliyor');

  perform t_admin_reset();
end $$;


-- ============== CIHAZ DEGISIMI VE NOKTA KIMLIGI ========================
--
-- Noktanin kimligi barkod degil, nokta kodudur. Cihaz degistiginde yeni barkod
-- AYNI noktaya baglanir ve eski okumalar o noktada kalir; bu yuzden degisim
-- kaydi ile istasyonun uzerindeki barkod tek islemde guncellenir.

do $$
declare
  st_id uuid := '00000000-0000-0000-0000-0000000007a1';
  site_a uuid := '00000000-0000-0000-0000-000000000551';
  swap station_replacements;
begin
  perform t_admin_reset();

  insert into stations (id, org_id, site_id, code, type, device_barcode)
  values (st_id, '00000000-0000-0000-0000-0000000000a1', site_a,
          'R-99', 'rodent', 'RP-ESKI-001');

  -- The customer may read replacements at their own site but never record one.
  perform t_login('00000000-0000-0000-0000-0000000000e4');
  perform t_denied(
    format($q$select replace_station_device(%L, 'broken', 'RP-YENI-002', '')$q$, st_id),
    'Musteri cihaz degisimi kaydedemiyor');

  -- Nor may a technician invent a reason or leave the barcode blank.
  perform t_login('00000000-0000-0000-0000-0000000000e2');
  perform t_denied(
    format($q$select replace_station_device(%L, 'calindi', 'RP-YENI-002', '')$q$, st_id),
    'Gecersiz degisim nedeni reddediliyor');
  perform t_denied(
    format($q$select replace_station_device(%L, 'broken', '   ', '')$q$, st_id),
    'Bos barkod reddediliyor');

  -- The technician in the field is who actually swaps the box.
  swap := replace_station_device(st_id, 'broken', 'RP-YENI-002', 'Kapak kirilmis');
  perform t_admin_reset();

  perform t_ok(swap.old_barcode = 'RP-ESKI-001',
    'Degisim kaydi eski barkodu saklıyor');
  perform t_ok(swap.station_code = 'R-99',
    'Degisim ayni nokta koduna bagli kaliyor');
  perform t_ok((select device_barcode from stations where id = st_id) = 'RP-YENI-002',
    'Yeni barkod ayni islemde istasyona tasiniyor');

  -- The customer sees the service record at their own site.
  perform t_login('00000000-0000-0000-0000-0000000000e4');
  perform t_ok((select count(*) from station_replacements) = 1,
    'Musteri kendi sahasinin cihaz degisimini gorebiliyor');

  perform t_admin_reset();
end $$;


-- ============== UCRET, BELGE VE HIZMET KAPSAMI YAZIMI ==================
--
-- Ucu de okunabiliyordu ama yazma yolu yoktu. Ucret ozellikle onemli: ucreti
-- tanimsiz teknisyen isgucu maliyetine dahil edilmiyor, cunku uydurma ucret
-- uydurma marj uretir. Bu yuzden ucreti girebilmek finans sayfasinin eksik
-- yarisidir.

do $$
declare
  tech_b1 uuid := '00000000-0000-0000-0000-0000000000b1';
  site_a  uuid := '00000000-0000-0000-0000-000000000551';
  cred_id uuid;
begin
  perform t_admin_reset();

  -- Cost data is admin-only: a technician must not see or set their own rate.
  perform t_login('00000000-0000-0000-0000-0000000000e2');
  perform t_ok((select count(*) from technician_rates) = 0,
    'Teknisyen ucret tablosunu goremiyor');
  perform t_denied(
    format($q$insert into technician_rates (technician_id, org_id, hourly_rate)
              values (%L, '00000000-0000-0000-0000-0000000000a1', 999)$q$, tech_b1),
    'Teknisyen kendi ucretini belirleyemiyor');

  perform t_login('00000000-0000-0000-0000-0000000000e4');
  perform t_denied(
    format($q$insert into technician_rates (technician_id, org_id, hourly_rate)
              values (%L, '00000000-0000-0000-0000-0000000000a1', 999)$q$, tech_b1),
    'Musteri ucret belirleyemiyor');

  -- The admin sets it; the table holds the current rate, so this is an upsert.
  perform t_login('00000000-0000-0000-0000-0000000000e1');
  insert into technician_rates (technician_id, org_id, hourly_rate)
  values (tech_b1, '00000000-0000-0000-0000-0000000000a1', 200)
  on conflict (technician_id) do update set hourly_rate = excluded.hourly_rate;
  perform t_admin_reset();
  perform t_ok((select hourly_rate from technician_rates where technician_id = tech_b1) = 200,
    'Yonetici saatlik ucreti guncelleyebiliyor (180 -> 200)');

  -- Compliance documents: admin writes, staff reads, customer reads only for a
  -- technician who actually served them.
  perform t_login('00000000-0000-0000-0000-0000000000e2');
  perform t_denied(
    format($q$insert into technician_credentials (org_id, technician_id, kind, title)
              values ('00000000-0000-0000-0000-0000000000a1', %L, 'permit', 'Kendi belgem')$q$, tech_b1),
    'Teknisyen kendine belge tanimlayamiyor');

  perform t_login('00000000-0000-0000-0000-0000000000e1');
  insert into technician_credentials (org_id, technician_id, kind, title, reference_no, valid_until)
  values ('00000000-0000-0000-0000-0000000000a1', tech_b1, 'safety_cert',
          'Is Guvenligi Sertifikasi', 'ENH-TEST-01', '2027-01-01')
  returning id into cred_id;
  perform t_admin_reset();
  perform t_ok(exists (select 1 from technician_credentials where id = cred_id),
    'Yonetici teknisyen belgesi kaydedebiliyor');

  perform t_login('00000000-0000-0000-0000-0000000000e2');
  perform t_ok((select count(*) from technician_credentials where id = cred_id) = 1,
    'Personel belgeyi gorebiliyor');

  -- Service scope lives on the site row and drives the visit plan; it was
  -- written on create but never on edit.
  perform t_login('00000000-0000-0000-0000-0000000000e2');
  perform t_no_effect(
    format($q$update sites set service_scope = '{"indoorRodent":{"frequency":99}}'::jsonb where id = %L$q$, site_a),
    'Teknisyen hizmet kapsamini degistiremiyor');

  perform t_login('00000000-0000-0000-0000-0000000000e1');
  update sites set service_scope = '{"indoorRodent":{"frequency":4,"unit":"ay"}}'::jsonb where id = site_a;
  perform t_admin_reset();
  perform t_ok((select service_scope->'indoorRodent'->>'frequency' from sites where id = site_a) = '4',
    'Yonetici hizmet kapsamini kaydedebiliyor');

  perform t_admin_reset();
end $$;


do $$ begin perform t_admin_reset(); end $$;

rollback;
