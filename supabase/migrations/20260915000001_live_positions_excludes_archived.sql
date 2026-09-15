-- live_positions() joined technicians and sites but never checked is_active,
-- so an archived technician (or one whose site was archived) kept showing up
-- on the Ekip & rota live map forever — their historical work_order_events
-- rows are exactly what make them "have history" in the first place, which is
-- why delete_technician()/delete_site() archive rather than hard-delete them.
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
    and t.is_active
    and s.is_active
  order by t.id, e.event_time desc
$fn$;
