-- The office UI (src/data/catalog.js:visitTypes, and the "Yeni İş Emri" form
-- in src/ui/modal.js) has offered 8 visit-type codes since before this app had
-- a real database: RZ, TZ, AC, IZ, ILK, ES, 3G, DZ. The visit_type enum from
-- 20260905000001_core_schema.sql only recognised 3 of them (RZ, AC, ES) — a
-- real work-order insert using any of the other 5 would be rejected by
-- Postgres. All 8 are real, distinct visit types the business already uses
-- (see the Turkish/English names in the catalog), so the enum is extended to
-- match the UI rather than narrowing the UI to match the enum.
--
-- ALTER TYPE ... ADD VALUE cannot run inside the same transaction that uses
-- the new value, but a bare DDL statement like this is fine on its own.
alter type visit_type add value if not exists 'TZ';
alter type visit_type add value if not exists 'IZ';
alter type visit_type add value if not exists 'ILK';
alter type visit_type add value if not exists '3G';
alter type visit_type add value if not exists 'DZ';
