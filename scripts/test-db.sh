#!/usr/bin/env bash
# Apply every migration to a throwaway Postgres and run the security tests.
#
# This is the gate that must stay green before any schema change ships. It runs
# against plain Postgres rather than a full local Supabase stack, because the
# only Supabase-specific things the migrations touch are auth.users, auth.uid()
# and the storage tables — all stubbed below. That keeps the check fast enough
# to run on every push instead of only before a release.
#
#   ./scripts/test-db.sh
#
# Requires Docker. Exits non-zero if any migration or assertion fails.

set -euo pipefail

CONTAINER="${PGCHECK_CONTAINER:-repellent-pgcheck}"
IMAGE="${PGCHECK_IMAGE:-postgres:15-alpine}"
DB="repellent"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Git Bash on Windows rewrites container-side paths like /tmp/x.sql into
# C:/.../tmp/x.sql. Turning that off is required, not cosmetic.
export MSYS_NO_PATHCONV=1

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "==> Tek kullanimlik Postgres baslatiliyor ($IMAGE)"
cleanup
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=check -e POSTGRES_DB="$DB" \
  "$IMAGE" >/dev/null

for _ in $(seq 1 60); do
  docker exec "$CONTAINER" pg_isready -U postgres -d "$DB" >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$CONTAINER" pg_isready -U postgres -d "$DB" >/dev/null

psql_run() {
  docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q
}

echo "==> Supabase shim (auth + storage semalari)"
psql_run <<'SHIM'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated;

create schema if not exists auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);
create or replace function auth.uid() returns uuid
  language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create schema if not exists storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text not null, owner uuid
);
alter table storage.objects enable row level security;
SHIM

echo "==> Migration'lar uygulaniyor"
for f in "$REPO_ROOT"/supabase/migrations/*.sql; do
  echo "    - $(basename "$f")"
  psql_run < "$f"
done

echo "==> Guvenlik testleri"
# psql sends RAISE NOTICE to stderr. Capture everything to a file so the run
# output can be shown AND the real exit status can still fail the script — a
# pipeline would swallow it and turn a failed assertion into a green build.
OUT="$(mktemp)"
set +e
docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 \
  < "$REPO_ROOT/supabase/tests/rls_test.sql" >"$OUT" 2>&1
STATUS=$?
set -e

sed 's/^psql:[^ ]* //' "$OUT" | grep -E 'PASS|FAIL|ERROR' || true
PASSED=$(grep -c 'PASS' "$OUT" || true)
rm -f "$OUT"

if [ "$STATUS" -ne 0 ]; then
  echo "==> BASARISIZ — en az bir guvenlik iddiasi dogrulanmadi."
  exit 1
fi

echo "==> Tum kontroller gecti ($PASSED assertion)."
