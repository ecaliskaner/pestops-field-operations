-- Removing a facility, without destroying the record of what was done there.
--
-- Every site_id foreign key in this schema is `on delete cascade`: stations,
-- work_orders, visit_reports, chemical_usages, recommendations, contracts,
-- planned_visits and site_files all go when the site does, and inspections
-- follow their work order. So a plain `delete from sites` is not "remove a row
-- the operator no longer wants" — it is a silent erasure of the evidence a
-- BRCGS or IFS audit is built from, including the legally required record of
-- which pesticide was applied on a customer's premises.
--
-- But the operator's need is real and usually mundane: a facility typed in
-- twice, a test entry, a customer who left. Those are different situations and
-- they deserve different outcomes, which is what this function decides rather
-- than making the admin choose between "delete" and "keep forever".
--
-- No history  -> a real delete. Nothing is lost, because nothing happened.
-- Any history -> archived (is_active = false). It leaves the portfolio, its
--                reports and invoices stay intact and attached, and it can be
--                brought back.
--
-- The caller is never offered a way to force the destructive branch. A site
-- with visits behind it cannot be hard-deleted through the application at all,
-- which is the point.

create or replace function delete_site(p_site uuid)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_org         uuid;
  v_name        text;
  v_active      boolean;
  v_work_orders int;
  v_inspections int;
  v_usages      int;
  v_reports     int;
  v_invoices    int;
begin
  select org_id, name, is_active into v_org, v_name, v_active
    from sites where id = p_site;

  if v_org is null then
    raise exception 'Tesis bulunamadı.';
  end if;

  -- RLS already scopes sites_admin_write to an admin of the owning org, but a
  -- SECURITY DEFINER function runs past RLS, so the check is repeated here.
  if v_org <> app_org_id() or not app_is_admin() then
    raise exception 'Bu tesisi kaldırma yetkiniz yok.';
  end if;

  select count(*) into v_work_orders from work_orders where site_id = p_site;
  select count(*) into v_inspections
    from inspections i join work_orders w on w.id = i.work_order_id
    where w.site_id = p_site;
  select count(*) into v_usages   from chemical_usages where site_id = p_site;
  select count(*) into v_reports  from visit_reports  where site_id = p_site;
  select count(*) into v_invoices from invoices       where site_id = p_site;

  if v_work_orders + v_inspections + v_usages + v_reports + v_invoices = 0 then
    delete from sites where id = p_site;
    return jsonb_build_object('action', 'deleted', 'name', v_name);
  end if;

  update sites set is_active = false, updated_at = now() where id = p_site;

  return jsonb_build_object(
    'action',          'archived',
    'name',            v_name,
    'alreadyArchived', not v_active,
    'workOrders',      v_work_orders,
    'inspections',     v_inspections,
    'chemicalUsages',  v_usages,
    'visitReports',    v_reports,
    'invoices',        v_invoices
  );
end;
$fn$;

revoke all on function delete_site(uuid) from public, anon;
grant execute on function delete_site(uuid) to authenticated;


-- The way back. Archiving is only a defensible default if it is reversible;
-- otherwise a misclick is as final as the delete this function exists to avoid.
create or replace function restore_site(p_site uuid)
returns sites
language plpgsql security definer set search_path = public as $fn$
declare
  s sites;
begin
  select * into s from sites where id = p_site;

  if s.id is null then
    raise exception 'Tesis bulunamadı.';
  end if;
  if s.org_id <> app_org_id() or not app_is_admin() then
    raise exception 'Bu tesisi geri alma yetkiniz yok.';
  end if;

  update sites set is_active = true, updated_at = now()
    where id = p_site returning * into s;
  return s;
end;
$fn$;

revoke all on function restore_site(uuid) from public, anon;
grant execute on function restore_site(uuid) to authenticated;
