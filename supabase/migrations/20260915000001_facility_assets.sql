-- Production completion: facility plans, station placement metadata, and the
-- schema fields needed to keep those records out of browser-only state.
-- The Supabase CLI is not installed in this workspace, so this migration was
-- created explicitly and is validated by scripts/test-db.sh.

alter table public.sites
  add column if not exists floor_plan_name text,
  add column if not exists floor_plan_width integer,
  add column if not exists floor_plan_height integer;

alter table public.stations
  add column if not exists placement jsonb not null default '{}'::jsonb;

create index if not exists stations_site_active_idx
  on public.stations (site_id, is_active);

comment on column public.sites.floor_plan_path is
  'Private Storage path in the floor-plans bucket; never a base64 blob.';
comment on column public.stations.placement is
  'Structured placement metadata such as area name, point number, and recorded timestamp.';
