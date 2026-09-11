-- The office completion override.
--
-- wo_complete() refuses to close a visit that has no first QR scan, and that
-- refusal is the product's core evidentiary claim: "the visit started when the
-- technician scanned a station at the site, not when someone tapped a button".
-- The RLS suite asserts it.
--
-- But the office genuinely needs to close jobs the phone never recorded — a
-- technician whose battery died, a visit logged on paper, a cancelled call-out
-- billed as attended. Until now the "Tamamlandi" button in the office UI did
-- that by mutating browser state, so the database never saw it at all.
--
-- Giving the office a real path is right; giving it a *silent* one is not.
-- This override is admin-only, demands a written reason, and records itself as
-- a distinct event type. The audit panel reads work orders completed with no
-- real_work_started_at and flags every one of them, so using this leaves a
-- mark that an auditor can find — which is the whole point.

create or replace function wo_complete_by_office(p_wo uuid, p_reason text)
returns work_orders
language plpgsql security definer set search_path = public as $fn$
declare
  w public.work_orders;
begin
  select * into w from public.work_orders where id = p_wo;
  if w.id is null then
    raise exception 'İş emri bulunamadı.';
  end if;
  if w.org_id <> app_org_id() or not app_is_admin() then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;
  if w.status = 'completed' then
    raise exception 'Bu iş emri zaten tamamlanmış.';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Ofis kapanışı için gerekçe zorunludur.';
  end if;

  update public.work_orders
     set status = 'completed', completed_at = now()
   where id = p_wo
   returning * into w;

  -- Two events on purpose. 'completed' keeps the trail uniform for anything
  -- reading the lifecycle, and 'completed_without_qr' is the exception record
  -- that names who closed it and why.
  insert into public.work_order_events (org_id, work_order_id, event_type, actor_id, payload)
  values
    (w.org_id, p_wo, 'completed', auth.uid(), '{}'::jsonb),
    (w.org_id, p_wo, 'completed_without_qr', auth.uid(),
     jsonb_build_object('reason', p_reason, 'had_gps_arrival', w.arrived_gps_at is not null));

  return w;
end $fn$;

revoke all on function wo_complete_by_office(uuid, text) from public, anon;
grant execute on function wo_complete_by_office(uuid, text) to authenticated;
