-- Repellent Operations — core schema.
--
-- Design notes
-- ------------
-- * Multi-tenant by org_id. An org is one pest-control company (Repellent
--   itself is the first). Every business row carries org_id so a single RLS
--   predicate can scope it; there is no cross-org read path anywhere.
-- * Three roles, mirroring the app: admin (office), tech (field), client
--   (customer contact). A client profile is additionally pinned to one
--   customer_id and may only ever see that customer's data.
-- * Times are timestamptz. The demo stored Turkish date strings ("12 Tem 2026");
--   those become real timestamps here, because reporting, SLA and audit all
--   need ordering and arithmetic that strings cannot give.
-- * The audit trail (work_order_events) is append-only by policy: the product's
--   core claim is that arrival is not work start, the first QR scan is — and
--   that claim is only worth anything if the row cannot be edited afterwards.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enums

create type user_role      as enum ('admin', 'tech', 'client');
create type site_health    as enum ('healthy', 'watch', 'risk');
create type wo_priority    as enum ('low', 'normal', 'high', 'critical');
create type wo_status      as enum ('scheduled', 'on_the_way', 'arrived_gps',
                                    'started_by_first_qr', 'in_progress',
                                    'completed', 'cancelled');
create type visit_type     as enum ('RZ', 'AC', 'ES');  -- rutin / acil / ek servis
create type station_type   as enum ('rodent', 'crawler', 'flying',
                                    'insect_light_trap', 'other');
create type station_status as enum ('unchecked', 'clean', 'activity', 'damaged', 'missing');
create type bait_status    as enum ('intact', 'consumed', 'replaced', 'missing');
create type invoice_status as enum ('draft', 'sent', 'paid', 'overdue', 'cancelled');
create type inv_tx_type    as enum ('refill', 'consume', 'adjust', 'waste');
create type reco_status    as enum ('open', 'in_progress', 'done', 'rejected');

-- ---------------------------------------------------------------- tenancy

create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  tax_office  text,
  tax_no      text,
  address     text,
  phone       text,
  email       text,
  logo_url    text,
  created_at  timestamptz not null default now()
);

-- Customer companies served by the org (Acme Foods, Kuzey Lojistik, ...).
create table customers (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  name          text not null,
  sector        text,
  tax_office    text,
  tax_no        text,
  contact_name  text,
  contact_phone text,
  contact_email text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (org_id, name)
);
create index on customers (org_id);

-- App users. The row is created by a trigger when an auth.users row appears,
-- then an admin assigns org/role. customer_id is required for role='client'
-- and must be null otherwise — enforced by the check constraint below.
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  org_id       uuid references organizations(id) on delete cascade,
  customer_id  uuid references customers(id) on delete set null,
  role         user_role,
  full_name    text not null default '',
  title        text,
  phone        text,
  avatar_url   text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  constraint client_needs_customer check (
    role is null
    or (role = 'client'  and customer_id is not null)
    or (role <> 'client' and customer_id is null)
  )
);
create index on profiles (org_id);
create index on profiles (customer_id);

-- ---------------------------------------------------------------- field org

-- A technician is a profile with role='tech' plus the identity the field and
-- customer screens render. The roadmap requires a customer to be able to open
-- the technician servicing them, so this row is readable by clients — which is
-- exactly why the cost rate is NOT here (see technician_rates below).
create table technicians (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  profile_id    uuid unique references profiles(id) on delete set null,
  full_name     text not null,
  initials      text,
  phone         text,
  email         text,
  color         text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index on technicians (org_id);

-- Cost rates live in their own table because RLS is row-level: a policy cannot
-- hide one column from a client while showing the rest of the row. Keeping the
-- rate in a separate, admin-only table is the only way to let a customer see
-- "Ayse Demir serviced you" without also leaking what she costs.
create table technician_rates (
  technician_id uuid primary key references technicians(id) on delete cascade,
  org_id        uuid not null references organizations(id) on delete cascade,
  hourly_rate   numeric(10,2) not null,
  valid_from    date not null default current_date,
  created_at    timestamptz not null default now()
);

-- Compliance documents. KVKK: ozel nitelikli kisisel veri. Never store the raw
-- TC kimlik or SGK number here — only the masked display value and an expiry
-- date, which is all any screen actually renders.
create table technician_credentials (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  technician_id  uuid not null references technicians(id) on delete cascade,
  kind           text not null,           -- sgk | safety_cert | permit | health_report
  title          text not null,
  reference_no   text,                    -- masked, e.g. ENH-2024-0143
  valid_until    date,
  document_path  text,                    -- Supabase Storage path, private bucket
  is_valid       boolean not null default true,
  created_at     timestamptz not null default now()
);
create index on technician_credentials (technician_id);

-- ---------------------------------------------------------------- sites

create table sites (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  customer_id   uuid not null references customers(id) on delete cascade,
  name          text not null,
  city          text,
  address       text,
  sector        text,
  lat           double precision,
  lng           double precision,
  geofence_radius_m integer not null default 150,
  health_score  integer check (health_score between 0 and 100),
  health_state  site_health not null default 'watch',
  color         text,
  contact_name  text,
  contact_phone text,
  contact_email text,
  floor_plan_path text,                   -- Storage path, not a base64 blob
  -- Contracted inspection frequencies, keyed by scope
  -- (outdoorRodent, indoorRodent, crawlingPest, flyingPest, storagePest),
  -- each { frequency, unit, seasonNote }.
  service_scope jsonb not null default '{}'::jsonb,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on sites (org_id);
create index on sites (customer_id);

create table contracts (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references organizations(id) on delete cascade,
  site_id              uuid not null references sites(id) on delete cascade,
  period_start         date not null,
  period_end           date not null,
  annual_price         numeric(12,2),
  monthly_price        numeric(12,2),
  extra_visit_price    numeric(12,2),
  emergency_call_price numeric(12,2),
  tax_office           text,
  tax_no               text,
  document_path        text,
  created_at           timestamptz not null default now(),
  check (period_end > period_start)
);
create index on contracts (site_id);

-- Monitoring points. qr_token is the value physically printed on the sticker;
-- it is random rather than derived from the code, so a token cannot be guessed
-- from a station name and a visit cannot be faked without being on site.
create table stations (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  site_id      uuid not null references sites(id) on delete cascade,
  code         text not null,
  type         station_type not null,
  qr_token     text not null unique default encode(gen_random_bytes(16), 'hex'),
  pos_x        numeric(5,2),              -- floor-plan %, 0-100
  pos_y        numeric(5,2),
  last_status      station_status not null default 'unchecked',
  last_bait_status bait_status not null default 'intact',
  notes        text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (site_id, code)
);
create index on stations (site_id);
create index on stations (qr_token);

-- Uploaded documents attached to a site (contract PDFs, risk analyses).
create table site_files (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  site_id      uuid not null references sites(id) on delete cascade,
  name         text not null,
  storage_path text not null,
  mime_type    text,
  size_bytes   bigint,
  visible_to_client boolean not null default false,
  uploaded_by  uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index on site_files (site_id);

-- ---------------------------------------------------------------- work

create table work_orders (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  site_id         uuid not null references sites(id) on delete cascade,
  technician_id   uuid references technicians(id) on delete set null,
  code            text not null,             -- human ref, e.g. WO-2048
  title           text not null,
  description     text,
  priority        wo_priority not null default 'normal',
  visit_type      visit_type not null default 'RZ',
  status          wo_status not null default 'scheduled',
  due_at          timestamptz,
  departed_at     timestamptz,
  arrived_gps_at  timestamptz,
  -- The audit-grade start. Written only by the first QR scan; never editable
  -- from the office UI. This column is the product's core evidence.
  real_work_started_at timestamptz,
  completed_at    timestamptz,
  created_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, code)
);
create index on work_orders (org_id, status);
create index on work_orders (site_id);
create index on work_orders (technician_id, due_at);

-- Append-only audit log: departed, entered_geofence, gps_mismatch, arrived_gps,
-- first_qr_scanned, station_qr_scanned, inspection_saved, completed.
create table work_order_events (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  work_order_id  uuid not null references work_orders(id) on delete cascade,
  event_type     text not null,
  event_time     timestamptz not null default now(),
  station_code   text,
  lat            double precision,
  lng            double precision,
  distance_m     integer,
  radius_m       integer,
  captured_offline boolean not null default false,
  -- Idempotency key from the phone's outbox. A retried sync must never write
  -- a second row for the same physical event.
  mobile_event_id text unique,
  actor_id       uuid references profiles(id) on delete set null,
  payload        jsonb not null default '{}'::jsonb
);
create index on work_order_events (work_order_id, event_time);
create index on work_order_events (org_id, event_time desc);

create table inspections (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  work_order_id  uuid not null references work_orders(id) on delete cascade,
  station_id     uuid references stations(id) on delete set null,
  station_code   text not null,
  status         station_status not null default 'clean',
  bait_status    bait_status not null default 'intact',
  pest_type      text not null default 'none',
  activity_count integer not null default 0,
  notes          text,
  photo_count    integer not null default 0,
  scanned_at     timestamptz not null default now(),   -- original capture time
  mobile_event_id text unique,
  created_by     uuid references profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index on inspections (work_order_id);
create index on inspections (station_id);

create table inspection_photos (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  inspection_id uuid not null references inspections(id) on delete cascade,
  storage_path  text not null,
  created_at    timestamptz not null default now()
);
create index on inspection_photos (inspection_id);

-- Signed visit report handed to the customer at the end of a visit.
create table visit_reports (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  work_order_id   uuid not null unique references work_orders(id) on delete cascade,
  site_id         uuid not null references sites(id) on delete cascade,
  summary         text,
  findings        jsonb not null default '[]'::jsonb,
  customer_signer_name text,
  signature_path  text,
  signed_at       timestamptz,
  pdf_path        text,
  published_at    timestamptz,
  created_at      timestamptz not null default now()
);
create index on visit_reports (site_id);

create table recommendations (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  site_id       uuid not null references sites(id) on delete cascade,
  work_order_id uuid references work_orders(id) on delete set null,
  description   text not null,
  category      text,                        -- BRCGS | AIB | IFS | ...
  assignee      text,
  status        reco_status not null default 'open',
  raised_on     date not null default current_date,
  due_on        date,
  closed_at     timestamptz,
  created_at    timestamptz not null default now()
);
create index on recommendations (site_id, status);

-- Planned (not yet dispatched) visits produced by the service planner.
create table planned_visits (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  site_id       uuid not null references sites(id) on delete cascade,
  technician_id uuid references technicians(id) on delete set null,
  planned_for   timestamptz not null,
  visit_type    visit_type not null default 'RZ',
  tasks         jsonb not null default '[]'::jsonb,
  work_order_id uuid references work_orders(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index on planned_visits (org_id, planned_for);
create index on planned_visits (site_id, planned_for);

-- ---------------------------------------------------------------- inventory

create table chemicals (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id) on delete cascade,
  name              text not null,
  active_ingredient text,
  -- Biyosidal urun ruhsat numarasi (Halk Sagligi Genel Mudurlugu).
  license_no        text,
  license_until     date,
  target_pests      text[],
  unit              text not null default 'lt',
  msds_path         text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);
create index on chemicals (org_id);

create table inventory_items (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  chemical_id  uuid not null references chemicals(id) on delete cascade,
  lot_no       text,
  qty          numeric(12,3) not null default 0,
  unit         text not null default 'lt',
  min_qty      numeric(12,3) not null default 0,
  unit_cost    numeric(12,2),
  expires_on   date,
  created_at   timestamptz not null default now()
);
create index on inventory_items (org_id);

create table inventory_transactions (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  item_id      uuid not null references inventory_items(id) on delete cascade,
  type         inv_tx_type not null,
  qty          numeric(12,3) not null,
  unit         text not null,
  occurred_at  timestamptz not null default now(),
  notes        text,
  created_by   uuid references profiles(id) on delete set null
);
create index on inventory_transactions (item_id, occurred_at desc);

-- Chemical actually applied on a visit. Required by biyosidal record-keeping:
-- what was applied, where, how much, by whom, under which licence.
create table chemical_usages (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  site_id       uuid not null references sites(id) on delete cascade,
  work_order_id uuid references work_orders(id) on delete set null,
  chemical_id   uuid not null references chemicals(id) on delete restrict,
  technician_id uuid references technicians(id) on delete set null,
  quantity      numeric(12,3) not null,
  unit          text not null,
  area_desc     text,
  applied_at    timestamptz not null default now(),
  notes         text,
  created_at    timestamptz not null default now()
);
create index on chemical_usages (site_id, applied_at desc);

-- ---------------------------------------------------------------- billing

create table invoices (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  customer_id    uuid not null references customers(id) on delete restrict,
  site_id        uuid references sites(id) on delete set null,
  code           text not null,
  description    text,
  issued_on      date not null default current_date,
  due_on         date,
  amount         numeric(12,2) not null,
  tax_rate       numeric(5,2) not null default 20,
  labor_cost     numeric(12,2),
  chemical_cost  numeric(12,2),
  status         invoice_status not null default 'draft',
  paid_at        timestamptz,
  -- GIB e-Arsiv / e-Fatura identifiers, filled by the integrator.
  einvoice_uuid  text,
  einvoice_no    text,
  pdf_path       text,
  created_at     timestamptz not null default now(),
  unique (org_id, code)
);
create index on invoices (org_id, status);
create index on invoices (customer_id, issued_on desc);

-- ---------------------------------------------------------------- misc

create table notifications (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  profile_id   uuid not null references profiles(id) on delete cascade,
  title        text not null,
  body         text,
  link         text,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index on notifications (profile_id, read_at);

-- KVKK: consent records and a tamper-evident access log for personal data.
create table consent_records (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  subject_type text not null,               -- technician | customer_contact
  subject_id   uuid not null,
  purpose      text not null,               -- location_tracking | health_docs | ...
  text_version text not null,
  granted      boolean not null,
  granted_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  ip_address   inet
);
create index on consent_records (subject_type, subject_id);

create table audit_log (
  id          bigserial primary key,
  org_id      uuid references organizations(id) on delete set null,
  actor_id    uuid references profiles(id) on delete set null,
  action      text not null,
  entity      text not null,
  entity_id   text,
  at          timestamptz not null default now(),
  detail      jsonb not null default '{}'::jsonb
);
create index on audit_log (org_id, at desc);

-- ---------------------------------------------------------------- triggers

create or replace function set_updated_at() returns trigger
language plpgsql as $fn$
begin
  new.updated_at = now();
  return new;
end $fn$;

create trigger sites_updated_at       before update on sites       for each row execute function set_updated_at();
create trigger work_orders_updated_at before update on work_orders for each row execute function set_updated_at();

-- A new auth user gets an empty profile immediately; an admin then assigns the
-- org and role. Until that happens the profile has org_id = null and every RLS
-- policy denies it, so an unassigned signup can read nothing.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $fn$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
