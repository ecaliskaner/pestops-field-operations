# Repellent Saha — Technician Mobile App

A real Flutter (iOS / Android / web) app for field pest-control technicians,
talking directly to the project's Supabase backend (`../supabase/migrations/`).
Implements the technician flow from
`Dijital_Pest_Control_Platformu_Teknik_Dokum.md` §8.4 and the roadmap in the
`.docx`.

## What it does

Six screens, matching the spec:

1. **Login** — email + password against Supabase Auth, offline notice.
2. **Daily Route** — today's jobs, counts, next customer, connection badge.
3. **Job Detail** — facility card, **three-stage lifecycle** (Planlandı →
   Tesise varıldı/GPS → Gerçek başladı/İlk QR), floor-plan viewer with optional
   offline download, "Müşteriye Vardım" (GPS), station list.
4. **QR Scan** — camera (`mobile_scanner`) + manual entry. The **first QR is the
   audit-grade real work start** — GPS arrival alone does not start the job.
   Enforced server-side: `real_work_started_at` is write-once, set only by the
   `wo_scan_qr` RPC (see `../supabase/migrations/*_rpc_and_storage.sql`).
5. **Station Form** — status / pest type / activity count / photos / notes,
   "Kaydet ve sonraki istasyon".
6. **Offline Sync** — connection badge, pending-record queue, drain-on-reconnect.
   Offline records persist locally and sync **idempotently** (`mobileEventId`,
   checked against `work_order_events.mobile_event_id` / `inspections.mobile_event_id`),
   so a flaky network never double-writes.

## Run it

The app is configured entirely at build time via `--dart-define` — there is no
editable server-address field, because unlike the old self-hosted REST API,
every technician talks to the same Supabase project.

### 1. Set up the backend once (from the repo root)

Follow `../docs/PRODUCTION.md` §3: create the Supabase project, run
`supabase db push`, and note the project URL and anon key.

### 2. Run the app (from `technician_app/`)

```bash
flutter run \
  --dart-define=SUPABASE_URL=https://xxxx.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=eyJ...
```

Building without both values shows a "Sunucu yapılandırması eksik" screen
instead of silently falling back to fake data — see `lib/config.dart`.

For a release build, pass the same two `--dart-define` flags to
`flutter build apk` / `flutter build ipa` / `flutter build web`, sourced from
your CI/release secrets rather than typed by hand.

### Accounts

There are no demo logins baked into the app. Create the technician's Supabase
Auth account and its `technicians` row the same way you create any account —
see `../docs/PRODUCTION.md` §3.4.

## Architecture

```
lib/
  main.dart                    boot, Supabase.initialize(), auth-gated routing
  config.dart                  --dart-define backend config
  theme.dart                   design tokens (tech-doc §8.1)
  models/models.dart           Technician, Site, Station, WorkOrder, Inspection
  services/
    supabase_service.dart      typed wrapper over the Supabase client (RLS + RPCs)
    outbox.dart                persistent, idempotent offline queue
    app_state.dart             ChangeNotifier — auth, route, online/offline decisions
  screens/                     login, route, job_detail, qr_scan, station_form, sync
  widgets/common.dart          connection badge, status chips
```

Every read is scoped by the Row Level Security policies in
`../supabase/migrations/*_rls.sql` — a technician's query for "today's route"
has no `WHERE technician_id = ...` in the Dart code because the database
itself refuses to return anyone else's work orders. Every state-changing
action (depart, arrive, scan, save a form, complete a visit) goes through a
`SECURITY DEFINER` RPC rather than a direct table write, because those RPCs
own the visit state machine — see the migrations for the reasoning.

The old in-memory REST API (`../api/mobileApi.js`, `../api/mobileData.js`) and
this app's old `api_client.dart` / `mock_backend.dart` are gone. The mock
backend in particular does not have a place in a production build: silently
falling back to fake work orders when the real backend is unreachable is
exactly the failure mode a field technician cannot safely hit.
