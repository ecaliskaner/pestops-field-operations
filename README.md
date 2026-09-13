# PestOps

Supabase-backed web and Flutter field-operations application for pest-control
teams, technicians, and customer portals.

## Run

```bash
npm start
```

The server is required because the web app uses ES modules and runtime
configuration from `/env.js`. See [`docs/PRODUCTION.md`](docs/PRODUCTION.md)
before connecting a real organization.

## Verify

```bash
npm test
cd technician_app && flutter analyze && flutter test
cd .. && ./scripts/test-db.sh
```

`npm test` checks JavaScript syntax and missing local imports. The database
script applies every migration to disposable Postgres and runs the RLS/RPC
security assertions. GitHub Actions runs all three gates on pushes and pull
requests.

## Structure

```text
src/core/              authenticated state, auth, roles, routing, DOM helpers
src/data/repo/         Supabase reads/writes and Storage operations
src/views/              dashboard, sites, work, team, reports, finance, portal
supabase/migrations/   schema, RLS, RPCs, Storage policies
supabase/tests/        database security assertions
technician_app/        Flutter technician application
scripts/               verification utilities
```

Supabase is the source of truth for business data. Browser storage contains
only harmless UI preferences; no customer, employee, schedule, inventory, or
billing records are persisted locally by the web app.
