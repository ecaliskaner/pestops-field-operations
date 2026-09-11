-- The closed action loop for findings (roadmap §9).
--
-- The UI has modelled four stages since the demo — raised -> customer_actioned
-- -> approved, with rejected looping back — but the table only ever had a
-- four-value `status`. Everything that makes the loop auditable (who found it,
-- at which station, what the customer replied and when, the before/after
-- photos, who approved or rejected it and why) lived in a browser-side
-- `state.recLifecycle` overlay that no other user could see and that a cleared
-- cache destroyed.
--
-- The stage is derived, not stored, so it can never contradict the evidence:
--   status 'done'                -> approved
--   status 'rejected'            -> rejected
--   customer_responded_at set    -> customer_actioned
--   otherwise                    -> raised

alter table recommendations
  add column if not exists station_code           text,
  add column if not exists technician_id          uuid references technicians(id) on delete set null,
  add column if not exists customer_note          text,
  add column if not exists customer_responded_at  timestamptz,
  add column if not exists photo_before_path      text,
  add column if not exists photo_after_path       text,
  add column if not exists approved_by            uuid references profiles(id) on delete set null,
  add column if not exists approved_at            timestamptz,
  add column if not exists rejection_note         text;

create index if not exists recommendations_site_status_idx
  on recommendations (site_id, status);

-- ---------------------------------------------------------------- storage
--
-- Evidence photos for findings. Separate from inspection-photos because the
-- write rule is different: this is the one bucket a *customer* may upload to,
-- and only for their own sites. Path is <org_id>/<site_id>/<rest...>, so both
-- checks are pure path predicates.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recommendation-photos', 'recommendation-photos', false, 10485760,
        array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

create or replace function storage_path_site(p_name text) returns uuid
language sql immutable as $fn$
  select nullif(split_part(p_name, '/', 2), '')::uuid
$fn$;

drop policy if exists reco_photo_read on storage.objects;
create policy reco_photo_read on storage.objects for select to authenticated
  using (
    bucket_id = 'recommendation-photos'
    and storage_path_org(name) = app_org_id()
    -- Staff see the whole org; a customer sees only their own sites' photos.
    and (app_is_staff() or app_client_owns_site(storage_path_site(name)))
  );

drop policy if exists reco_photo_write on storage.objects;
create policy reco_photo_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'recommendation-photos'
    and storage_path_org(name) = app_org_id()
    and (app_is_staff() or app_client_owns_site(storage_path_site(name)))
  );

drop policy if exists reco_photo_delete on storage.objects;
create policy reco_photo_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'recommendation-photos'
    and storage_path_org(name) = app_org_id()
    and app_is_admin()
  );

-- ---------------------------------------------------------------- customer step
--
-- A client has only reco_client_read, so the customer's own step in the loop
-- needs a controlled path. The RPC lets them attach a note and a photo and
-- move the finding to "awaiting our approval" — and nothing else. In
-- particular a customer can never set status to 'done': closing the loop is
-- the operator's call, which is the entire point of the approval step.
create or replace function respond_to_recommendation(
  p_rec        uuid,
  p_note       text,
  p_photo_path text
) returns recommendations
language plpgsql security definer set search_path = public as $fn$
declare
  r recommendations;
begin
  select * into r from recommendations where id = p_rec;
  if r.id is null then
    raise exception 'Bulgu bulunamadı.';
  end if;
  if r.org_id <> app_org_id() then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;
  if not (app_client_owns_site(r.site_id) or app_is_staff()) then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;
  if r.status = 'done' then
    raise exception 'Bu bulgu kapatılmış; yeniden aksiyon alınamaz.';
  end if;

  update recommendations
     set customer_note         = p_note,
         customer_responded_at = now(),
         photo_after_path      = coalesce(nullif(p_photo_path, ''), photo_after_path),
         -- Back to in_progress whether this is a first response or a redo
         -- after a rejection; the rejection note stays on the row as history.
         status                = 'in_progress'
   where id = p_rec
   returning * into r;

  return r;
end $fn$;

revoke all on function respond_to_recommendation(uuid, text, text) from public, anon;
grant execute on function respond_to_recommendation(uuid, text, text) to authenticated;
