-- Business rules that RLS alone cannot express, plus the file storage layer.
--
-- The visit state machine lives here rather than in the client, because the
-- client is a phone in someone's pocket and the office needs to be able to say,
-- in front of a customer or an auditor, that the recorded start time could not
-- have been typed in. Every transition below writes its audit event in the same
-- transaction as the state change, so the log can never disagree with the row.
--
-- scheduled → on_the_way → arrived_gps → started_by_first_qr → in_progress → completed

-- ------------------------------------------------------------------ guards

-- real_work_started_at is write-once, and only the QR scan RPC may write it.
-- The RPC announces itself with a transaction-local setting; a direct UPDATE
-- from any client — technician, admin, or a leaked key used carelessly through
-- PostgREST — hits the exception instead.
create or replace function guard_wo_audit_columns() returns trigger
language plpgsql as $fn$
begin
  if new.real_work_started_at is distinct from old.real_work_started_at then
    if old.real_work_started_at is not null then
      raise exception 'real_work_started_at is immutable once recorded (work order %)', old.id
        using errcode = 'check_violation';
    end if;
    if coalesce(current_setting('app.audit_write', true), 'off') <> 'on' then
      raise exception 'real_work_started_at may only be set by the QR scan RPC'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end $fn$;

create trigger work_orders_guard_audit
  before update on work_orders
  for each row execute function guard_wo_audit_columns();

-- Great-circle distance in metres. Used to decide whether a reported arrival is
-- actually at the site; kept in SQL so the phone cannot influence the verdict.
create or replace function geo_distance_m(lat1 double precision, lng1 double precision,
                                          lat2 double precision, lng2 double precision)
returns integer language sql immutable as $fn$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else round(
      6371000 * 2 * asin(sqrt(
        power(sin(radians(lat2 - lat1) / 2), 2) +
        cos(radians(lat1)) * cos(radians(lat2)) *
        power(sin(radians(lng2 - lng1) / 2), 2)
      ))
    )::integer
  end
$fn$;

-- Resolve the work order the caller is allowed to act on, or fail loudly.
-- Centralised so every RPC below enforces the same ownership rule.
create or replace function assert_wo_access(p_wo uuid) returns work_orders
language plpgsql stable security definer set search_path = public as $fn$
declare w public.work_orders;
begin
  select * into w from public.work_orders where id = p_wo;
  if not found then
    raise exception 'work order not found' using errcode = 'no_data_found';
  end if;
  if w.org_id is distinct from public.app_org_id() then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  if not (public.app_is_admin() or w.technician_id = public.app_technician_id()) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  return w;
end $fn$;

-- ------------------------------------------------------------------ transitions

-- "Yola ciktim".
create or replace function wo_depart(p_wo uuid)
returns work_orders language plpgsql security definer set search_path = public as $fn$
declare w public.work_orders;
begin
  w := public.assert_wo_access(p_wo);
  if w.status = 'scheduled' then
    update public.work_orders
       set status = 'on_the_way', departed_at = now()
     where id = p_wo returning * into w;
  end if;
  insert into public.work_order_events (org_id, work_order_id, event_type, actor_id)
  values (w.org_id, p_wo, 'departed', auth.uid());
  return w;
end $fn$;

-- GPS-verified arrival. Explicitly NOT the start of work: the status moves and
-- the coordinates are recorded, but if the fix is outside the geofence a
-- gps_mismatch event is written alongside so the office can challenge it. That
-- discrepancy row is what makes a false "vardim" tap visible later.
create or replace function wo_arrive(p_wo uuid, p_lat double precision, p_lng double precision,
                                     p_mobile_event_id text default null,
                                     p_captured_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  w public.work_orders;
  s public.sites;
  dist integer;
  inside boolean;
  at_time timestamptz := coalesce(p_captured_at, now());
begin
  w := public.assert_wo_access(p_wo);

  -- Idempotent replay of an offline record.
  if p_mobile_event_id is not null and exists (
       select 1 from public.work_order_events where mobile_event_id = p_mobile_event_id) then
    return jsonb_build_object('deduped', true, 'workOrderId', p_wo);
  end if;

  select * into s from public.sites where id = w.site_id;
  dist   := public.geo_distance_m(p_lat, p_lng, s.lat, s.lng);
  inside := dist is not null and dist <= s.geofence_radius_m;

  if w.status in ('scheduled', 'on_the_way') then
    update public.work_orders
       set status = 'arrived_gps', arrived_gps_at = at_time
     where id = p_wo returning * into w;
  end if;

  insert into public.work_order_events
    (org_id, work_order_id, event_type, event_time, lat, lng, distance_m, radius_m,
     captured_offline, mobile_event_id, actor_id)
  values
    (w.org_id, p_wo, case when inside then 'entered_geofence' else 'gps_mismatch' end,
     at_time, p_lat, p_lng, dist, s.geofence_radius_m,
     p_captured_at is not null, p_mobile_event_id, auth.uid());

  insert into public.work_order_events
    (org_id, work_order_id, event_type, event_time, lat, lng, distance_m, radius_m,
     captured_offline, actor_id)
  values
    (w.org_id, p_wo, 'arrived_gps', at_time, p_lat, p_lng, dist, s.geofence_radius_m,
     p_captured_at is not null, auth.uid());

  return jsonb_build_object(
    'workOrderId',    p_wo,
    'status',         w.status,
    'insideGeofence', inside,
    'distanceM',      dist,
    'radiusM',        s.geofence_radius_m
  );
end $fn$;

-- The first scan is the audit-grade work start. The station is resolved by its
-- printed token (or, as a fallback the office can audit, by a manually typed
-- code), and it must belong to this work order's own site — scanning a sticker
-- from another facility does not start this job.
create or replace function wo_scan_qr(p_wo uuid, p_code text,
                                      p_mobile_event_id text default null,
                                      p_captured_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  w  public.work_orders;
  st public.stations;
  is_first boolean;
  at_time timestamptz := coalesce(p_captured_at, now());
  raw text := btrim(coalesce(p_code, ''));
begin
  w := public.assert_wo_access(p_wo);

  if p_mobile_event_id is not null and exists (
       select 1 from public.work_order_events where mobile_event_id = p_mobile_event_id) then
    return jsonb_build_object('deduped', true, 'workOrderId', p_wo);
  end if;

  select * into st from public.stations
   where site_id = w.site_id and is_active
     and (qr_token = raw or lower(code) = lower(raw))
   limit 1;

  if not found then
    raise exception 'Bu QR bu is emrine ait bir istasyonla eslesmiyor.'
      using errcode = 'no_data_found';
  end if;

  is_first := w.real_work_started_at is null;

  if is_first then
    -- Announce the one legitimate writer of the audit column to the guard
    -- trigger. `true` scopes the setting to this transaction only.
    perform set_config('app.audit_write', 'on', true);
    update public.work_orders
       set real_work_started_at = at_time, status = 'started_by_first_qr'
     where id = p_wo returning * into w;
    insert into public.work_order_events
      (org_id, work_order_id, event_type, event_time, station_code,
       captured_offline, mobile_event_id, actor_id)
    values (w.org_id, p_wo, 'first_qr_scanned', at_time, st.code,
            p_captured_at is not null, p_mobile_event_id, auth.uid());
  else
    if w.status = 'started_by_first_qr' then
      update public.work_orders set status = 'in_progress' where id = p_wo returning * into w;
    end if;
    insert into public.work_order_events
      (org_id, work_order_id, event_type, event_time, station_code,
       captured_offline, mobile_event_id, actor_id)
    values (w.org_id, p_wo, 'station_qr_scanned', at_time, st.code,
            p_captured_at is not null, p_mobile_event_id, auth.uid());
  end if;

  return jsonb_build_object(
    'workOrderId',        p_wo,
    'stationId',          st.id,
    'stationCode',        st.code,
    'stationType',        st.type,
    'isFirstScan',        is_first,
    'realWorkStartedAt',  w.real_work_started_at,
    'status',             w.status
  );
end $fn$;

-- Idempotent station form. mobile_event_id is the phone outbox key: a retried
-- sync over a flaky connection must never produce a second inspection row.
create or replace function save_inspection(
  p_wo uuid, p_station_code text, p_status station_status,
  p_bait_status bait_status default 'intact', p_pest_type text default 'none',
  p_activity_count integer default 0, p_notes text default null,
  p_photo_count integer default 0, p_mobile_event_id text default null,
  p_captured_at timestamptz default null)
returns inspections language plpgsql security definer set search_path = public as $fn$
declare
  w public.work_orders;
  st public.stations;
  ins public.inspections;
begin
  w := public.assert_wo_access(p_wo);

  if p_mobile_event_id is not null then
    select * into ins from public.inspections where mobile_event_id = p_mobile_event_id;
    if found then return ins; end if;
  end if;

  select * into st from public.stations
   where site_id = w.site_id and lower(code) = lower(p_station_code) limit 1;

  insert into public.inspections
    (org_id, work_order_id, station_id, station_code, status, bait_status, pest_type,
     activity_count, notes, photo_count, scanned_at, mobile_event_id, created_by)
  values
    (w.org_id, p_wo, st.id, p_station_code, p_status, p_bait_status, p_pest_type,
     p_activity_count, p_notes, p_photo_count, coalesce(p_captured_at, now()),
     p_mobile_event_id, auth.uid())
  returning * into ins;

  if st.id is not null then
    update public.stations
       set last_status = p_status, last_bait_status = p_bait_status
     where id = st.id;
  end if;

  if w.status = 'started_by_first_qr' then
    update public.work_orders set status = 'in_progress' where id = p_wo;
  end if;

  insert into public.work_order_events
    (org_id, work_order_id, event_type, station_code, captured_offline, actor_id, payload)
  values (w.org_id, p_wo, 'inspection_saved', p_station_code,
          p_captured_at is not null, auth.uid(),
          jsonb_build_object('status', p_status, 'inspectionId', ins.id));

  return ins;
end $fn$;

-- A visit cannot be closed without a first QR scan. This is the rule that stops
-- a job being "completed" from the car park.
create or replace function wo_complete(p_wo uuid)
returns work_orders language plpgsql security definer set search_path = public as $fn$
declare w public.work_orders;
begin
  w := public.assert_wo_access(p_wo);
  if w.real_work_started_at is null then
    raise exception 'Is tamamlanamaz — ilk QR henuz okutulmadi.' using errcode = 'check_violation';
  end if;
  update public.work_orders
     set status = 'completed', completed_at = now()
   where id = p_wo returning * into w;
  insert into public.work_order_events (org_id, work_order_id, event_type, actor_id)
  values (w.org_id, p_wo, 'completed', auth.uid());
  return w;
end $fn$;

-- Latest reported position per technician, for the ops field map. Unlike the
-- demo endpoint this replaces, it is NOT public: the staff check below means
-- only the technician's own office can see it. Employee location is personal
-- data under KVKK; the open endpoint in the previous build was the single worst
-- exposure in the system.
create or replace function live_positions()
returns table (technician_id uuid, technician_name text, lat double precision,
               lng double precision, at timestamptz, work_order_id uuid,
               site_id uuid, site_name text, distance_m integer,
               radius_m integer, inside_geofence boolean)
language sql stable security definer set search_path = public as $fn$
  select distinct on (t.id)
    t.id, t.full_name, e.lat, e.lng, e.event_time, e.work_order_id,
    s.id, s.name, e.distance_m, e.radius_m,
    case when e.distance_m is null or e.radius_m is null then null
         else e.distance_m <= e.radius_m end
  from public.work_order_events e
  join public.work_orders w on w.id = e.work_order_id
  join public.sites s       on s.id = w.site_id
  join public.technicians t on t.id = w.technician_id
  where e.lat is not null
    and e.org_id = public.app_org_id()
    and public.app_is_staff()
  order by t.id, e.event_time desc
$fn$;

-- ------------------------------------------------------------------ storage
--
-- Every bucket is private. Objects are addressed as <org_id>/<rest...>, so a
-- single policy predicate — first path segment equals the caller's org — keeps
-- one company's files unreachable from another's session.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('site-files',        'site-files',        false, 20971520, null),
  ('floor-plans',       'floor-plans',       false, 20971520, array['image/png','image/jpeg','image/webp','application/pdf']),
  ('inspection-photos', 'inspection-photos', false, 10485760, array['image/png','image/jpeg','image/webp']),
  ('signatures',        'signatures',        false,  2097152, array['image/png','image/svg+xml']),
  ('credentials',       'credentials',       false, 20971520, array['application/pdf','image/png','image/jpeg'])
on conflict (id) do nothing;

create or replace function storage_path_org(p_name text) returns uuid
language sql immutable as $fn$
  select nullif(split_part(p_name, '/', 1), '')::uuid
$fn$;

create policy storage_org_read on storage.objects for select to authenticated
  using (
    bucket_id in ('site-files','floor-plans','inspection-photos','signatures','credentials')
    and storage_path_org(name) = app_org_id()
    -- Compliance documents stay inside the office; the customer-facing screens
    -- render the masked metadata row, never the underlying file.
    and (bucket_id <> 'credentials' or app_is_staff())
  );

create policy storage_staff_write on storage.objects for insert to authenticated
  with check (
    bucket_id in ('site-files','floor-plans','inspection-photos','signatures','credentials')
    and storage_path_org(name) = app_org_id()
    and app_is_staff()
  );

create policy storage_admin_delete on storage.objects for delete to authenticated
  using (
    bucket_id in ('site-files','floor-plans','inspection-photos','signatures','credentials')
    and storage_path_org(name) = app_org_id()
    and app_is_admin()
  );
