-- Make the two remaining technician lifecycle actions safe for offline replay.
-- The original one-argument RPCs remain for existing office callers. These
-- overloads accept the phone's stable outbox id and original capture time, so
-- a connection drop after commit cannot create a second audit event.

create or replace function wo_depart(
  p_wo uuid,
  p_mobile_event_id text,
  p_captured_at timestamptz
)
returns work_orders
language plpgsql security definer set search_path = public as $fn$
declare
  w public.work_orders;
  at_time timestamptz := coalesce(p_captured_at, now());
begin
  w := public.assert_wo_access(p_wo);
  if p_mobile_event_id is not null and exists (
    select 1 from public.work_order_events where mobile_event_id = p_mobile_event_id
  ) then
    return w;
  end if;

  if w.status = 'scheduled' then
    update public.work_orders
       set status = 'on_the_way', departed_at = at_time
     where id = p_wo returning * into w;
  end if;

  insert into public.work_order_events
    (org_id, work_order_id, event_type, event_time, captured_offline,
     mobile_event_id, actor_id)
  values
    (w.org_id, p_wo, 'departed', at_time, p_captured_at is not null,
     p_mobile_event_id, auth.uid());
  return w;
end $fn$;

create or replace function wo_complete(
  p_wo uuid,
  p_mobile_event_id text,
  p_captured_at timestamptz
)
returns work_orders
language plpgsql security definer set search_path = public as $fn$
declare
  w public.work_orders;
  at_time timestamptz := coalesce(p_captured_at, now());
begin
  w := public.assert_wo_access(p_wo);
  if p_mobile_event_id is not null and exists (
    select 1 from public.work_order_events where mobile_event_id = p_mobile_event_id
  ) then
    return w;
  end if;
  if w.real_work_started_at is null then
    raise exception 'Is tamamlanamaz — ilk QR henuz okutulmadi.' using errcode = 'check_violation';
  end if;

  update public.work_orders
     set status = 'completed', completed_at = at_time
   where id = p_wo returning * into w;
  insert into public.work_order_events
    (org_id, work_order_id, event_type, event_time, captured_offline,
     mobile_event_id, actor_id)
  values
    (w.org_id, p_wo, 'completed', at_time, p_captured_at is not null,
     p_mobile_event_id, auth.uid());
  return w;
end $fn$;

revoke all on function wo_depart(uuid, text, timestamptz) from public, anon;
grant execute on function wo_depart(uuid, text, timestamptz) to authenticated;
revoke all on function wo_complete(uuid, text, timestamptz) from public, anon;
grant execute on function wo_complete(uuid, text, timestamptz) to authenticated;
