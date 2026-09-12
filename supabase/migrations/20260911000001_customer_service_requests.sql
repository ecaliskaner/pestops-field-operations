-- Customer-initiated service requests (roadmap §1: ek servis / acil çağrı).
--
-- The customer portal has always offered "acil çağrı" and "ek servis" buttons,
-- but the request only ever landed in the browser's own state object — the
-- office never saw it. Meanwhile RLS is deliberately strict: wo_admin_all is
-- the only INSERT path on work_orders, and a client role has read-only
-- policies. That is the correct default (a customer must not be able to forge
-- arbitrary work orders), so the request goes through a SECURITY DEFINER RPC
-- that validates ownership and controls every field it writes.

-- Which visits the customer asked for, as opposed to the ones the contract
-- schedules. The office needs this to triage and to bill: an extra visit and
-- a call-out are priced separately in the contract.
alter table work_orders
  add column if not exists requested_by_customer boolean not null default false;

create index if not exists work_orders_requested_by_customer_idx
  on work_orders (org_id, requested_by_customer)
  where requested_by_customer;

-- Create a work order on behalf of the signed-in customer.
--
-- The caller controls only the site, the visit kind, their note and their
-- preferred window. Everything that matters for integrity — org, status,
-- priority, the customer-requested flag, the audit author — is set here, so a
-- client cannot, for example, open a request against another company's site
-- or pre-mark a visit as completed.
create or replace function request_service(
  p_site   uuid,
  p_kind   visit_type,
  p_note   text,
  p_window text
) returns work_orders
language plpgsql security definer set search_path = public as $fn$
declare
  s        sites;
  w        work_orders;
  prio     wo_priority;
  kind_tr  text;
  new_code text;
  attempt  int := 0;
begin
  select * into s from sites where id = p_site;
  if s.id is null then
    raise exception 'Tesis bulunamadı.';
  end if;
  if s.org_id <> app_org_id() then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;
  -- A client may only request a visit to their own company's site. Staff may
  -- also call this, to log a request that came in by phone.
  if not (app_client_owns_site(p_site) or app_is_staff()) then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;

  prio := case p_kind when 'AC' then 'critical'::wo_priority else 'high'::wo_priority end;
  kind_tr := case p_kind
               when 'AC'  then 'Acil çağrı'
               when 'ES'  then 'Ek servis'
               when 'TZ'  then 'Takip ziyareti'
               else 'Müşteri talebi'
             end;

  -- work_orders is unique (org_id, code); retry on the rare random collision
  -- rather than failing the customer's request.
  loop
    attempt := attempt + 1;
    new_code := 'WO-' || lpad((floor(random() * 9000) + 1000)::int::text, 4, '0');
    begin
      insert into work_orders (
        org_id, site_id, code, title, description, priority, visit_type,
        status, requested_by_customer, created_by
      ) values (
        s.org_id, p_site, new_code,
        kind_tr || ' — ' || s.name,
        case when coalesce(p_window, '') = '' then coalesce(p_note, '')
             else 'Tercih edilen zaman: ' || p_window || E'\n' || coalesce(p_note, '') end,
        prio, p_kind, 'scheduled', true, auth.uid()
      ) returning * into w;
      exit;
    exception when unique_violation then
      if attempt >= 10 then raise; end if;
    end;
  end loop;

  -- The request itself is part of the trail: the office must be able to show
  -- when the customer asked, not just when someone got round to scheduling it.
  insert into work_order_events (org_id, work_order_id, event_type, actor_id, payload)
  values (s.org_id, w.id, 'customer_requested', auth.uid(),
          jsonb_build_object('kind', p_kind, 'window', p_window));

  return w;
end $fn$;

-- Supabase grants EXECUTE on public-schema functions broadly by default, so
-- the grant has to be narrowed explicitly — revoking from the role alone is
-- not enough, PUBLIC carries it.
revoke all on function request_service(uuid, visit_type, text, text) from public, anon;
grant execute on function request_service(uuid, visit_type, text, text) to authenticated;
