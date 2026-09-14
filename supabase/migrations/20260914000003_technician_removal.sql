-- Removing a technician, without destroying the record of what they did.
--
-- Same shape as supabase/migrations/*_site_removal.sql, for the same reason:
-- work_orders.technician_id, chemical_usages.technician_id and
-- planned_visits.technician_id are all `on delete set null`, so a plain
-- `delete from technicians` does not erase those rows outright, but it does
-- erase *who* did the work on every one of them — the attribution a BRCGS or
-- IFS audit, or a customer dispute about who applied a chemical, depends on.
-- technician_credentials and technician_rates do cascade-delete; those are
-- the technician's own administrative records, not evidence of what happened
-- at a customer's site, so losing them when nothing else references the
-- technician is fine.
--
-- No history  -> a real delete. Nothing is lost, because nothing happened.
-- Any history -> archived (is_active = false). This already revokes their
--                operational access on its own: app_technician_id() (the
--                function every technician-scoped RLS policy calls) requires
--                is_active, so an archived technician's own JWT stops
--                resolving to a technician id at all — they cannot arrive,
--                scan, or record an inspection — without touching their login.
--
-- As with sites, the caller is never offered a way to force the destructive
-- branch. A technician with work behind them cannot be hard-deleted through
-- the application at all.

create or replace function delete_technician(p_technician uuid)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_org           uuid;
  v_name          text;
  v_active        boolean;
  v_work_orders   int;
  v_usages        int;
  v_planned       int;
begin
  select org_id, full_name, is_active into v_org, v_name, v_active
    from technicians where id = p_technician;

  if v_org is null then
    raise exception 'Teknisyen bulunamadı.';
  end if;

  -- RLS already scopes technicians writes to an admin of the owning org, but
  -- a SECURITY DEFINER function runs past RLS, so the check is repeated here.
  if v_org <> app_org_id() or not app_is_admin() then
    raise exception 'Bu teknisyeni kaldırma yetkiniz yok.';
  end if;

  select count(*) into v_work_orders from work_orders     where technician_id = p_technician;
  select count(*) into v_usages      from chemical_usages where technician_id = p_technician;
  select count(*) into v_planned     from planned_visits  where technician_id = p_technician;

  if v_work_orders + v_usages + v_planned = 0 then
    delete from technicians where id = p_technician;
    return jsonb_build_object('action', 'deleted', 'name', v_name);
  end if;

  update technicians set is_active = false where id = p_technician;

  return jsonb_build_object(
    'action',          'archived',
    'name',            v_name,
    'alreadyArchived', not v_active,
    'workOrders',      v_work_orders,
    'chemicalUsages',  v_usages,
    'plannedVisits',   v_planned
  );
end;
$fn$;

revoke all on function delete_technician(uuid) from public, anon;
grant execute on function delete_technician(uuid) to authenticated;


-- The way back. As with restore_site(), archiving is only a defensible
-- default if it is reversible.
create or replace function restore_technician(p_technician uuid)
returns technicians
language plpgsql security definer set search_path = public as $fn$
declare
  t technicians;
begin
  select * into t from technicians where id = p_technician;

  if t.id is null then
    raise exception 'Teknisyen bulunamadı.';
  end if;
  if t.org_id <> app_org_id() or not app_is_admin() then
    raise exception 'Bu teknisyeni geri alma yetkiniz yok.';
  end if;

  update technicians set is_active = true
    where id = p_technician returning * into t;
  return t;
end;
$fn$;

revoke all on function restore_technician(uuid) from public, anon;
grant execute on function restore_technician(uuid) to authenticated;
