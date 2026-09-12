-- Device replacement history, and somewhere to keep an MSDS.
--
-- Two gaps this closes.
--
-- 1. Equipment replacement had no table at all. data/history.js generated a
--    barcode from a hash of the site id and point code (`RP-S1-R-01-48213`) and
--    kept the replacement list in the same synthetic store as the visits. The
--    roadmap's requirement is real and specific: when a device is lost, broken
--    or renewed, a new barcode is issued to the *same point number*, and the
--    old device's readings must stay attached to that point so the point's
--    timeline survives the swap. That is a record, not a derivation — an
--    auditor asks when a station was replaced and why, and a hash cannot
--    answer it.
--
-- 2. `chemicals.msds_path` existed with no bucket behind it, so there was
--    nowhere to put the file. The read rule differs from every other document
--    bucket: a customer has a legitimate right to the safety data sheet of a
--    product applied on their premises, which is why this cannot simply join
--    the office-only `credentials` bucket.

-- The barcode currently on the device at a point. Distinct from qr_token: the
-- QR is what the technician scans to prove attendance and never changes hands,
-- while this is the manufacturer's label on the physical box, which is exactly
-- what a replacement changes.
alter table stations
  add column if not exists device_barcode text;

create table if not exists station_replacements (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  site_id       uuid not null references sites(id) on delete cascade,
  -- The station may later be deleted; the replacement record must outlive it,
  -- so the point code is stored as text as well as the reference.
  station_id    uuid references stations(id) on delete set null,
  station_code  text not null,
  reason        text not null check (reason in ('lost', 'broken', 'renewed')),
  old_barcode   text,
  new_barcode   text,
  replaced_on   date not null default current_date,
  notes         text,
  created_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists station_replacements_site_idx
  on station_replacements (site_id, station_code, replaced_on);

alter table station_replacements enable row level security;

drop policy if exists swap_staff_read on station_replacements;
create policy swap_staff_read on station_replacements for select to authenticated
  using (org_id = app_org_id() and app_is_staff());

-- The customer sees replacements at their own sites: a station that vanished
-- and was replaced is part of the service record they are paying for.
drop policy if exists swap_client_read on station_replacements;
create policy swap_client_read on station_replacements for select to authenticated
  using (org_id = app_org_id() and app_client_owns_site(site_id));

drop policy if exists swap_staff_insert on station_replacements;
create policy swap_staff_insert on station_replacements for insert to authenticated
  with check (org_id = app_org_id() and app_is_staff());

drop policy if exists swap_admin_all on station_replacements;
create policy swap_admin_all on station_replacements for all to authenticated
  using (org_id = app_org_id() and app_is_admin())
  with check (org_id = app_org_id() and app_is_admin());


-- Recording a replacement and moving the barcode onto the station are one
-- event, so they are one transaction. A replacement row whose station still
-- carries the old barcode would misreport what is physically at the point.
create or replace function replace_station_device(
  p_station     uuid,
  p_reason      text,
  p_new_barcode text,
  p_notes       text
) returns station_replacements
language plpgsql security definer set search_path = public as $fn$
declare
  st  stations;
  row station_replacements;
begin
  select * into st from stations where id = p_station;
  if st.id is null then
    raise exception 'İstasyon bulunamadı.';
  end if;
  if st.org_id <> app_org_id() or not app_is_staff() then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;
  if p_reason not in ('lost', 'broken', 'renewed') then
    raise exception 'Geçersiz değişim nedeni.';
  end if;
  if coalesce(trim(p_new_barcode), '') = '' then
    raise exception 'Yeni cihaz barkodu zorunludur.';
  end if;

  insert into station_replacements (
    org_id, site_id, station_id, station_code, reason,
    old_barcode, new_barcode, notes, created_by
  ) values (
    st.org_id, st.site_id, st.id, st.code, p_reason,
    st.device_barcode, trim(p_new_barcode), nullif(p_notes, ''), auth.uid()
  ) returning * into row;

  update stations set device_barcode = trim(p_new_barcode) where id = p_station;

  return row;
end $fn$;

revoke all on function replace_station_device(uuid, text, text, text) from public, anon;
grant execute on function replace_station_device(uuid, text, text, text) to authenticated;


-- ---------------------------------------------------------------- storage
--
-- Safety data sheets. Path is <org_id>/<chemical_id>/<filename>, so the org
-- check stays a pure path predicate like every other bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('msds', 'msds', false, 20971520,
        array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

-- Read is deliberately wider than the office. A facility that had a biocide
-- applied on its premises is entitled to that product's safety data sheet, and
-- withholding it behind a staff check would defeat the reason for storing it.
drop policy if exists msds_read on storage.objects;
create policy msds_read on storage.objects for select to authenticated
  using (bucket_id = 'msds' and storage_path_org(name) = app_org_id());

drop policy if exists msds_admin_write on storage.objects;
create policy msds_admin_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'msds'
    and storage_path_org(name) = app_org_id()
    and app_is_admin()
  );

drop policy if exists msds_admin_delete on storage.objects;
create policy msds_admin_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'msds'
    and storage_path_org(name) = app_org_id()
    and app_is_admin()
  );
