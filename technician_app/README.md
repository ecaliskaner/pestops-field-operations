# Repellent Saha — Technician Mobile App

A real Flutter (iOS / Android / web) app for field pest-control technicians,
connected to this project's Node server. Implements the technician flow from
`Dijital_Pest_Control_Platformu_Teknik_Dokum.md` §8.4 and the roadmap in the
`.docx`.

## What it does

Six screens, matching the spec:

1. **Login** — email/phone + password, editable server address, offline notice.
2. **Daily Route** — today's jobs, counts, next customer, connection badge.
3. **Job Detail** — facility card, **three-stage lifecycle** (Planlandı →
   Tesise varıldı/GPS → Gerçek başladı/İlk QR), floor-plan viewer with optional
   offline download, "Müşteriye Vardım" (GPS), station list.
4. **QR Scan** — camera (`mobile_scanner`) + manual entry. The **first QR is the
   audit-grade real work start** — GPS arrival alone does not start the job.
5. **Station Form** — status / pest type / activity count / photos / notes,
   "Kaydet ve sonraki istasyon".
6. **Offline Sync** — connection badge, pending-record queue, drain-on-reconnect.
   Offline records persist locally and sync **idempotently** (`mobileEventId`),
   so a flaky network never double-writes.

## Run it

### 1. Start the backend (from the repo root)

```bash
npm start
```

Serves the web demo **and** the mobile API at `http://localhost:4173`
(`/api/mobile/*`).

### 2. Run the app (from `technician_app/`)

```bash
flutter run
```

- **Android emulator** reaches the host API at `http://10.0.2.2:4173` (default).
- **iOS simulator / web** use `http://localhost:4173` (default).
- **Real phone** — set the server field on the login screen to your machine's
  LAN IP, e.g. `http://192.168.1.20:4173`.

### Demo logins

`ayse@ladybug.com` · `mert@ladybug.com` · `ece@ladybug.com` · `can@ladybug.com`
— password `1234`.

## Architecture

```
lib/
  main.dart              boot + auth-gated routing
  theme.dart             design tokens (tech-doc §8.1)
  models/models.dart     Technician, Site, Station, WorkOrder, Inspection
  services/
    api_client.dart      typed wrapper over /api/mobile
    outbox.dart          persistent, idempotent offline queue
    app_state.dart       ChangeNotifier — auth, route, online/offline decisions
  screens/               login, route, job_detail, qr_scan, station_form, sync
  widgets/common.dart    connection badge, status chips
```

The server side lives in `../api/mobileData.js` (seed slice) and
`../api/mobileApi.js` (in-memory store + routes), mounted into `../server.js`.

Still demo-grade: the store is in-memory (reset via `POST /api/mobile/reset`)
and auth is trivial. The production path is the NestJS + PostgreSQL/PostGIS
backend described in the tech-doc.
