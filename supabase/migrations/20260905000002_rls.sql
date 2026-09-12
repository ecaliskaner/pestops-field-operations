-- Row Level Security.
--
-- This file is the security boundary of the whole product. The browser talks to
-- PostgREST with the user's own JWT, so there is no server-side code left to
-- "remember" to check permissions — these policies ARE the check. Read them as
-- the authoritative answer to "who can see what".
--
-- Three roles:
--   admin  — office staff. Everything inside their own org.
--   tech   — field technician. The org's sites and stations (they must be able
--            to navigate), but only their OWN work orders, and they may only
--            append evidence, never rewrite it.
--   client — customer contact. Strictly their own company's data, and only the
--            parts meant to be shared (published reports, non-draft invoices,
--            files explicitly marked visible).
--
-- Default posture: RLS on, no policy = no access. Anything not granted below is
-- denied, including to admins.

-- ------------------------------------------------------------------ helpers
--
-- SECURITY DEFINER so a policy on `profiles` can call them without recursing
-- into `profiles`' own policies. STABLE so Postgres evaluates them once per
-- statement instead of once per row.

create or replace function app_org_id() returns uuid
language sql stable security definer set search_path = public as $fn$
  select org_id from public.profiles where id = auth.uid() and is_active
$fn$;

create or replace function app_role() returns user_role
language sql stable security definer set search_path = public as $fn$
  select role from public.profiles where id = auth.uid() and is_active
$fn$;

create or replace function app_customer_id() returns uuid
language sql stable security definer set search_path = public as $fn$
  select customer_id from public.profiles where id = auth.uid() and is_active
$fn$;

create or replace function app_is_admin() returns boolean
language sql stable security definer set search_path = public as $fn$
  select coalesce((select role from public.profiles
                   where id = auth.uid() and is_active) = 'admin', false)
$fn$;

create or replace function app_is_staff() returns boolean
language sql stable security definer set search_path = public as $fn$
  select coalesce((select role from public.profiles
                   where id = auth.uid() and is_active) in ('admin', 'tech'), false)
$fn$;

-- The technicians row belonging to the signed-in user, or null.
create or replace function app_technician_id() returns uuid
language sql stable security definer set search_path = public as $fn$
  select id from public.technicians where profile_id = auth.uid() and is_active
$fn$;

-- True when the signed-in client is the customer that owns this site. Used by
-- every customer-facing read policy so the rule lives in exactly one place.
create or replace function app_client_owns_site(p_site_id uuid) returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from public.sites s
    where s.id = p_site_id
      and s.customer_id = public.app_customer_id()
      and s.org_id = public.app_org_id()
  )
$fn$;

-- A work order the signed-in technician owns.
create or replace function app_tech_owns_wo(p_wo_id uuid) returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from public.work_orders w
    where w.id = p_wo_id
      and w.technician_id = public.app_technician_id()
  )
$fn$;

-- True when this technician has (or had) a job at one of the client's sites.
-- Gates the roadmap requirement that a customer may inspect the credentials of
-- the people who actually entered their facility — and nobody else's.
create or replace function app_client_served_by(p_tech_id uuid) returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1
    from public.work_orders w
    join public.sites s on s.id = w.site_id
    where w.technician_id = p_tech_id
      and s.customer_id = public.app_customer_id()
      and s.org_id = public.app_org_id()
  )
$fn$;

-- ------------------------------------------------------------------ enable

alter table organizations          enable row level security;
alter table customers              enable row level security;
alter table profiles               enable row level security;
alter table technicians            enable row level security;
alter table technician_rates       enable row level security;
alter table technician_credentials enable row level security;
alter table sites                  enable row level security;
alter table contracts              enable row level security;
alter table stations               enable row level security;
alter table site_files             enable row level security;
alter table work_orders            enable row level security;
alter table work_order_events      enable row level security;
alter table inspections            enable row level security;
alter table inspection_photos      enable row level security;
alter table visit_reports          enable row level security;
alter table recommendations        enable row level security;
alter table planned_visits         enable row level security;
alter table chemicals              enable row level security;
alter table inventory_items        enable row level security;
alter table inventory_transactions enable row level security;
alter table chemical_usages        enable row level security;
alter table invoices               enable row level security;
alter table notifications          enable row level security;
alter table consent_records        enable row level security;
alter table audit_log              enable row level security;

-- Nothing in this product is public. Anonymous visitors get the login screen
-- and no data whatsoever.
revoke all on all tables in schema public from anon;

-- ------------------------------------------------------------------ tenancy

create policy org_read on organizations for select to authenticated
  using (id = app_org_id());
create policy org_admin_write on organizations for update to authenticated
  using (id = app_org_id() and app_is_admin())
  with check (id = app_org_id() and app_is_admin());

create policy customers_staff_read on customers for select to authenticated
  using (org_id = app_org_id() and app_is_staff());
create policy customers_client_read on customers for select to authenticated
  using (org_id = app_org_id() and id = app_customer_id());
create policy customers_admin_write on customers for all to authenticated
  using (org_id = app_org_id() and app_is_admin())
  with check (org_id = app_org_id() and app_is_admin());

-- A user always sees their own profile. Admins manage the org's roster.
-- Note there is deliberately no self-UPDATE policy: self-service role
-- escalation is the one thing this table must never allow, so profile edits go
-- through admins or the narrow update_own_profile RPC below.
create policy profiles_self_read on profiles for select to authenticated
  using (id = auth.uid());
create policy profiles_staff_read on profiles for select to authenticated
  using (org_id = app_org_id() and app_is_staff());
create policy profiles_admin_write on profiles for all to authenticated
  using (org_id = app_org_id() and app_is_admin())
  with check (org_id = app_org_id() and app_is_admin());

-- Safe self-service: name/phone/avatar only, never role or tenancy.
create or replace function update_own_profile(p_full_name text, p_phone text, p_avatar_url text)
returns void language sql security definer set search_path = public as $fn$
  update public.profiles
     set full_name  = coalesce(p_full_name, full_name),
         phone      = coalesce(p_phone, phone),
         avatar_url = coalesce(p_avatar_url, avatar_url)
   where id = auth.uid();
$fn$;

-- ------------------------------------------------------------------ field org

create policy techs_staff_read on technicians for select to authenticated
  using (org_id = app_org_id() and app_is_staff());
-- The customer sees only the technicians who actually worked at their sites.
create policy techs_client_read on technicians for select to authenticated
  using (org_id = app_org_id() and app_role() = 'client' and app_client_served_by(id));
create policy techs_admin_write on technicians for all to authenticated
  using (org_id = app_org_id() and app_is_admin())
  with check (org_id = app_org_id() and app_is_admin());

-- Cost data: admins only. No read path exists for tech or client.
create policy rates_admin_only on technician_rates for all to authenticated
  using (org_id = app_org_id() and app_is_admin())
  with check (org_id = app_org_id() and app_is_admin());

create policy creds_staff_read on technician_credentials for select to authenticated
  using (org_id = app_org_id() and app_is_staff());
create policy creds_client_read on technician_credentials for select to authenticated
  using (org_id = app_org_id() and app_role() = 'client' and app_client_served_by(technician_id));
create policy creds_admin_write on technician_credentials for all to authenticated
  using (org_id = app_org_id() and app_is_admin())
  with check (org_id = app_org_id() and app_is_admin());

-- ------------------------------------------------------------------ sites

create policy sites_staff_read on sites for select to authenticated
  using (org_id = app_org_id() and app_is_staff());
create policy sites_client_read on sites for select to authenticated
  using (org_id = app_org_id() and customer_id = app_customer_id());
create policy sites_admin_write on sites for all to authenticated
  using (org_id = app_org_id() and app_is_admin())
  with check (org_id = app_org_id() and app_is_admin());

create policy contracts_admin_all on contracts for all to authenticated
  using (org_id = app_org_id() and app_is_admin())
  with check (org_id = app_org_id() and app_is_admin());
create policy contracts_client_read on contracts for select to authenticated
  using (org_id = app_org_id() and app_client_owns_site(site_id));

create policy stations_staff_read on stations for select to authenticated
  using (org_id = app_org_id() and app_is_staff());
create policy stations_client_read on stations for select to authenticated
  using (org_id = app_org_id() and app_client_owns_site(site_id));
create policy stations_admin_write on stations for all to authenticated
  using (org_id = app_org_id() and app_is_admin())
  with check (org_id = app_org_id() and app_is_admin());

create policy files_staff_read on site_files for select to authenticated
  using (org_id = app_org_id() and app_is_staff());
create policy files_client_read on site_files for select to authenticated
  using (org_id = app_org_id() and visible_to_client and app_client_owns_site(site_id));
create policy files_admin_write on site_files for all to authenticated
  using (org_id = app_org_id() and app_is_admin())
  with check (org_id = app_org_id() and app_is_admin());

-- ------------------------------------------------------------------ work

create policy wo_admin_all on work_orders for all to authenticated
  using (org_id = app_org_id() and app_is_admin())
  with check (org_id = app_org_id() and app_is_admin());
create policy wo_tech_read on work_orders for select to authenticated
  using (org_id = app_org_id() and technician_id = app_technician_id());
-- Deliberately NO update policy for technicians. A direct UPDATE would let the
-- phone write real_work_started_at itself, and that column is the entire
-- evidentiary claim of the product — "the visit started when the first QR was
-- scanned, not when someone tapped a button". Status transitions therefore go
-- exclusively through the SECURITY DEFINER RPCs in migration ...000003, which
-- own the state machine and write the matching audit event in the same
-- transaction.
create policy wo_client_read on work_orders for select to authenticated
  using (org_id = app_org_id() and app_client_owns_site(site_id));

-- Append-only by construction: SELECT and INSERT policies exist, UPDATE and
-- DELETE ones deliberately do not, so no role — admin included — can rewrite
-- the evidence trail through the API.
create policy events_staff_read on work_order_events for select to authenticated
  using (org_id = app_org_id() and app_is_staff());
create policy events_client_read on work_order_events for select to authenticated
  using (org_id = app_org_id()
         and exists (select 1 from work_orders w
                     where w.id = work_order_id and app_client_owns_site(w.site_id)));
create policy events_tech_insert on work_order_events for insert to authenticated
  with check (org_id = app_org_id() and app_tech_owns_wo(work_order_id));
create policy events_admin_insert on work_order_events for insert to authenticated
  with check (org_id = app_org_id() and app_is_admin());

create policy insp_staff_read on inspections for select to authenticated
  using (org_id = app_org_id() and app_is_staff());
create policy insp_client_read on inspections for select to authenticated
  using (org_id = app_org_id()
         and exists (select 1 from work_orders w
                     where w.id = work_order_id and app_client_owns_site(w.site_id)));
create policy insp_tech_insert on inspections for insert to authenticated
  with check (org_id = app_org_id() and app_tech_owns_wo(work_order_id));
-- A technician may correct a form only while the visit is still open. Once the
-- work order is completed the record is frozen for everyone.
create policy insp_tech_update on inspections for update to authenticated
  using (org_id = app_org_id() and app_tech_owns_wo(work_order_id)
         and exists (select 1 from work_orders w
                     where w.id = work_order_id and w.status <> 'completed'))
  with check (org_id = app_org_id() and app_tech_owns_wo(work_order_id));
create policy insp_admin_all on inspections for all to authenticated
  using (org_id = app_org_id() and app_is_admin())
  with check (org_id = app_org_id() and app_is_admin());

create policy photos_staff_read on inspection_photos for select to authenticated
  using (org_id = app_org_id() and app_is_staff());
create policy photos_client_read on inspection_photos for select to authenticated
  using (org_id = app_org_id()
         and exists (select 1 from inspections i join work_orders w on w.id = i.work_order_id
                     where i.id = inspection_id and app_client_owns_site(w.site_id)));
create policy photos_tech_insert on inspection_photos for insert to authenticated
  with check (org_id = app_org_id()
              and exists (select 1 from inspections i
                          where i.id = inspection_id and app_tech_owns_wo(i.work_order_id)));

create policy reports_staff_read on visit_reports for select to authenticated
  using (org_id = app_org_id() and app_is_staff());
-- The customer sees a report only once the office publishes it — a half-written
-- report must never appear in the portal.
create policy reports_client_read on visit_reports for select to authenticated
  using (org_id = app_org_id() and published_at is not null and app_client_owns_site(site_id));
create policy reports_tech_write on visit_reports for insert to authenticated
  with check (org_id = app_org_id() and app_tech_owns_wo(work_order_id));
create policy reports_tech_update on visit_reports for update to authenticated
  using (org_id = app_org_id() and app_tech_owns_wo(work_order_id) and published_at is null)
  with check (org_id = app_org_id() and app_tech_owns_wo(work_order_id));
create policy reports_admin_all on visit_reports for all to authenticated
  using (org_id = app_org_id() and app_is_admin())
  with check (org_id = app_org_id() and app_is_admin());

create policy reco_staff_read on recommendations for select to authenticated
  using (org_id = app_org_id() and app_is_staff());
create policy reco_client_read on recommendations for select to authenticated
  using (org_id = app_org_id() and app_client_owns_site(site_id));
create policy reco_staff_write on recommendations for insert to authenticated
  with check (org_id = app_org_id() and app_is_staff());
create policy reco_admin_all on recommendations for all to authenticated
  using (org_id = app_org_id() and app_is_admin())
  with check (org_id = app_org_id() and app_is_admin());

create policy plan_admin_all on planned_visits for all to authenticated
  using (org_id = app_org_id() and app_is_admin())
  with check (org_id = app_org_id() and app_is_admin());
create policy plan_tech_read on planned_visits for select to authenticated
  using (org_id = app_org_id() and technician_id = app_technician_id());
create policy plan_client_read on planned_visits for select to authenticated
  using (org_id = app_org_id() and app_client_owns_site(site_id));

-- ------------------------------------------------------------------ inventory

-- Chemicals are readable by customers too: a facility has a legitimate right to
-- know which licensed product was applied on their premises, and to reach its
-- MSDS. Stock levels and costs below are not.
create policy chem_read on chemicals for select to authenticated
  using (org_id = app_org_id());
create policy chem_admin_write on chemicals for all to authenticated
  using (org_id = app_org_id() and app_is_admin())
  with check (org_id = app_org_id() and app_is_admin());

create policy stock_staff_read on inventory_items for select to authenticated
  using (org_id = app_org_id() and app_is_staff());
create policy stock_admin_write on inventory_items for all to authenticated
  using (org_id = app_org_id() and app_is_admin())
  with check (org_id = app_org_id() and app_is_admin());

create policy tx_staff_read on inventory_transactions for select to authenticated
  using (org_id = app_org_id() and app_is_staff());
create policy tx_staff_insert on inventory_transactions for insert to authenticated
  with check (org_id = app_org_id() and app_is_staff());
create policy tx_admin_all on inventory_transactions for all to authenticated
  using (org_id = app_org_id() and app_is_admin())
  with check (org_id = app_org_id() and app_is_admin());

create policy usage_staff_read on chemical_usages for select to authenticated
  using (org_id = app_org_id() and app_is_staff());
create policy usage_client_read on chemical_usages for select to authenticated
  using (org_id = app_org_id() and app_client_owns_site(site_id));
create policy usage_staff_insert on chemical_usages for insert to authenticated
  with check (org_id = app_org_id() and app_is_staff());
create policy usage_admin_all on chemical_usages for all to authenticated
  using (org_id = app_org_id() and app_is_admin())
  with check (org_id = app_org_id() and app_is_admin());

-- ------------------------------------------------------------------ billing

create policy inv_admin_all on invoices for all to authenticated
  using (org_id = app_org_id() and app_is_admin())
  with check (org_id = app_org_id() and app_is_admin());
-- Customers see issued invoices only; drafts are internal.
create policy inv_client_read on invoices for select to authenticated
  using (org_id = app_org_id() and customer_id = app_customer_id() and status <> 'draft');

-- ------------------------------------------------------------------ misc

create policy notif_own on notifications for select to authenticated
  using (profile_id = auth.uid());
create policy notif_own_update on notifications for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
create policy notif_admin_insert on notifications for insert to authenticated
  with check (org_id = app_org_id() and app_is_admin());

create policy consent_admin on consent_records for all to authenticated
  using (org_id = app_org_id() and app_is_admin())
  with check (org_id = app_org_id() and app_is_admin());
-- KVKK m.11: a data subject may see their own consent record and withdraw it.
create policy consent_self_read on consent_records for select to authenticated
  using (subject_type = 'technician' and subject_id = app_technician_id());

-- Read-only for admins; rows are written by triggers and the service role, so
-- there is no INSERT policy for end users.
create policy audit_admin_read on audit_log for select to authenticated
  using (org_id = app_org_id() and app_is_admin());
