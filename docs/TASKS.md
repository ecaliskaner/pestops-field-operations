# Task board

Status: `todo` · `wip` · `done` · `blocked`
Claim a task by putting your session name in Owner, and claim its files in
`docs/SESSIONS.md` at the same time.

> **Exclusive** tasks must run with no other session active.

---

## Phase 0 — Foundations

| ID | Task | Status | Owner | Files | Notes |
|---|---|---|---|---|---|
| 0a-1 | Extract data modules (`catalog.js`, `seed.js`) | **done** | — | `src/data/**` | Verified: 12 chemicals, 8 visit types, 10 equipment types, 6 sites intact |
| 0a-2 | Extract core (`dom`, `state`, `auth`) | **done** | — | `src/core/**` | `router` deferred to 0a-3 — `setView` calls every renderer |
| 0a-3 | Extract view renderers + router | **done** | — | `src/views/**`, `src/core/router.js` | 45 functions into 15 modules; imports derived from a dependency graph |
| 0a-3a | Move `activeSiteId` / `mobJob` etc. to a `ui` holder | **done** | — | `src/core/session.js` | 7 mutables, 95 refs rewritten. 0a-3 is unblocked |
| 0a-4 | Extract UI (`modal`, `calendar`, `signature`) | **done** | — | `src/ui/**` | Done as part of 0a-3 |
| 0a-5 | Decompose `bind()` into per-view handlers | **done** | — | `src/views/**`, `src/app.js` | 33 handlers into owning modules; app.js 1,327 → 277 lines. Parallel work now unblocked |
| 0a-6 | Gitignore `state.js`; vendor `html5-qrcode` | **done** | — | `.gitignore`, `vendor/` | html5-qrcode 2.3.8 vendored (367 KB). Zero external requests remain |
| 0a-7 | Fix cache-first service worker | **done** | — | `service-worker.js`, `server.js` | Was serving stale modules indefinitely; now network-first. See note below |
| 0b-1 | Seeded 12-month history generator | **done** | Session A (`phase-0b`) | `src/data/history.js` | 6 sites × 12 months (Ağu 2025 – Tem 2026). Seeded PRNG, identical every run |
| 0b-2 | Wire history into insights + company detail | **done** | Session A (`phase-0b`) | `src/views/insights.js` | Trend chart, risk ranking, per-site 6-month chart, recommendation + chemical stats |
| 0c-1 | SVG chart lib (line/bar/stacked/donut) | **done** | Session B | `src/ui/charts.js` | Pure builders (opts → SVG string) + `mountChart`. Gallery: `demo/charts.html` |
| 0c-2 | CSV export + print-to-PDF stylesheet | **done** | Session B | `src/ui/export.js`, `styles.css` | CSV is `;`-delimited + BOM for TR Excel. Also SVG/PNG chart download and `printElement()` |

## Phase 1 — Repellent Stage 1

| ID | Task | Status | Owner | Files | Notes |
|---|---|---|---|---|---|
| 1-1 | Per-equipment-type placement forms | **done** | Session C (`phase-1a`) | `views/companyDetail.js`, `data/catalog.js` | Schemas in `catalog.js`; legacy station types alias onto them |
| 1-2 | Equipment replacement preserving history | **done** | Session D (`phase-1b`) | `views/companyDetail.js`, `data/history.js` | Point code is the permanent identity; barcode + generation move on. `readingsForPoint()` spans devices |
| 1-3 | Multi-pest multi-count per device | **done** | Session C (`phase-1a`) | `views/mobile.js` | Species list narrowed per device type; legacy `pestType` slugs normalised |
| 1-4 | Chemical MSDS / label / permit attachments | **done** | Session C (`phase-1a`) | `data/catalog.js`, `views/companyDetail.js` | Surfaced in company chemicals tab, not `inventory.js` — avoids registry contention |
| 1-5 | Dosage + water auto-calculator | **done** | Session C (`phase-1a`) | `views/mobile.js` | Structured `chemicalDosing`; basis is m² / m³ / station count per product |
| 1-6 | Closed-loop recommendation workflow | **done** | Session D (`phase-1b`) | `views/companyDetail.js`, `data/history.js` | `stage` field added alongside `status`; reject sends it back to the customer |
| 1-7 | Dual digital signature on visit close | **done** | Session C (`phase-1a`) | `ui/signature.js`, `views/mobile.js` | Both signatures + customer name required to close; pads reset between jobs |
| 1-8 | Five printable report types | **done** | Session E | `views/reports.js`, `views/reportBodies.js` | Visit / trend / comparison / non-conformity / audit package. Pure builders on real history |

## Phase 2 — Customer portal

| ID | Task | Status | Owner | Files | Notes |
|---|---|---|---|---|---|
| 2-1 | Multi-location / city / region comparison | **done** | Session F (`phase-2a`) | `views/insights.js` | Tesis ‖ şehir scope toggle; stacked composition + per-location trend line |
| 2-2 | Multi-select chart filters + per-chart download | **done** | Session F (`phase-2a`) | `views/insights.js` | Pest-type chips drive every chart; SVG+PNG button pair on all 5 charts. `charts.js` needed no change |
| 2-3 | Recommendation statistics | **done** | Session F (`phase-2a`) | `views/insights.js` | Funnel açılan/aksiyon/onaylı + category donut + per-location close rate |
| 2-4 | 3rd Eye audit section | **done** | Session E | `views/reports.js` | Visit type `3G` was already in the catalog — reads real audits plus per-site coverage |
| 2-5 | Technician credential cards | **done** | Session G (`phase-3a`) | `views/team.js` | Placeholder docs + KVKK notice; identifiers masked, no real PII |

## Phase 3 — Field realism

| ID | Task | Status | Owner | Files | Notes |
|---|---|---|---|---|---|
| 3-1 | Live technician map, simulated GPS | **done** | Session G (`phase-3a`) | `views/team.js` | 4 techs drift on a 1.1s timer over the abstract canvas; click a pin to select |
| 3-2 | Geofence enter/exit events | **done** | Session G (`phase-3a`) | `views/team.js`, `views/mobile.js` | 6 geofence rings; enter/exit feed on team map + geofence-enter log on mobile GPS arrival |
| 3-3 | Offline sync simulation | **done** | Session G (`phase-3a`) | `views/mobile.js` | In-memory outbox in mobile.js; badge counts, reconnect drains. No core/state.js change |
| 3-4 | NFC scan alongside QR | **done** | Session G (`phase-3a`) | `views/mobile.js` | NFC button beside QR on entry step; shared startFirstScan() completion |
| 3-5 | Route optimization before/after | **done** | Session G (`phase-3a`) | `views/team.js` | Nearest-neighbour vs seed order; ~37% saved, polyline overlay on map |
| 3-6 | Audit warnings | **done** | Session G (`phase-3a`) | `views/work.js` | Derived from getVisits(): short-visit honest (<80% site avg), QR-outside/GPS-no-QR deterministic + live arrived_gps work orders |

## Phase 4 — Business layer

| ID | Task | Status | Owner | Files | Notes |
|---|---|---|---|---|---|
| 4-1 | Auto-irsaliye generation | **done** | Session H | `views/finance.js`, `data/billing.js` | Numbered sevk irsaliyesi per visit's chemical usage; deterministic IRS-YYYY-NNNNNN |
| 4-2 | Travel vs on-site time, efficiency | **done** | Session J (`main`) | `views/team.js`, `views/finance.js` | **Wave 4 finisher** — team productivity panel (util % + on-site/travel split) and finance windshield-cost panel, both off `technicianStats()`. Verified: team util %75, windshield ₺16.6k (%24 of labour), figures agree across both views |
| 4-3 | Invoice from completed visits | **done** | Session H | `views/finance.js`, `data/billing.js` | Consolidated per site+month, line item per visit, KDV + margin; flows into existing ledger |
| 4-4 | Notification centre + "report emailed" | **done** | Session I (`phase-5a`) | `src/app.js`, `src/ui/demo.js` | Bell badge + centre; simulated e-mail event pushes to `window.__DEMO_NOTIFS__`. Bell reroutes to `openNotificationCenter()` — `modal('notifications')` in `modal.js` is now unused |

## Phase 5 — Hardening

| ID | Task | Status | Owner | Files | Notes |
|---|---|---|---|---|---|
| 5-1 | Compliance badges | **done** | Session E | `data/compliance.js`, `views/reports.js` | Readiness computed from history, not decorative. Red Tractor is honestly out of scope |
| 5-2 | One-click demo reset | **done** | Session I (`phase-5a`) | `src/ui/demo.js` | PUTs fresh seed to `/api/state` + clears localStorage + reload → pristine login. Verified: injected work order wiped from both server and localStorage |
| 5-3 | Guided tour mode | **done** | Session I (`phase-5a`) | `src/ui/demo.js` | 6-step overlay: komuta → QR kilidi → denetim uyarıları → raporlar → uyumluluk → trendler. Navigates views + spotlights nav |
| 5-4 | Fast role switching | **done** | Session I (`phase-5a`) | `core/auth.js`, `src/ui/demo.js` | `switchRole()` in auth.js; presenter-bar segmented control, no re-login. Verified admin↔tech↔client |

## Phase 6 — Spec-gap closure *(post-review audit against the `.docx`)*

A senior-dev pass compared the build against the `.docx` stage by stage. Nearly
everything was covered; these were the real gaps.

| ID | Task | Status | Owner | Files | Notes |
|---|---|---|---|---|---|
| 6-1 | Customer role-unlock + multi-site seed | **done** | Session K (`main`) | `core/state.js`, `core/roles.js`, `views/insights.js`, `views/sites.js`, `data/seed.js`, `data/credentials.js` | Acme Foods is now 3 locations (Kocaeli/İzmir/Ankara) so §11's cross-location comparison is demonstrable. `visibleSites()` in state.js is the single visibility gate; client nav unlocked to `sites` + `insights`, both company-scoped. Credential cards surfaced to the customer in a new facility tab |
| 6-2 | Placement-list activity + activity-only reports | **done** | Session K (`main`) | `views/reportBodies.js`, `views/reports.js`, `data/catalog.js` | The last two `.docx` §10 reports. `REPORTS` now has seven entries. See the report-suite note below |
| 6-3 | Customer usage analytics (§12) | **todo** | — | — | The one whole numbered stage with no implementation: which customer logged in, how long they stayed, what they viewed, most-pulled chart. Lowest demo visibility (nothing on a projector shows it), genuinely from scratch — scope out or build last |
| 6-4 | Self-service password change (§11) | **todo** | — | — | Minor. `.docx` wants the customer able to change their own password |
| 6-5 | Annual visit plan + customer confirmation (§1) | **done** | Session L (`main`) | `data/schedule.js` | Closed by 7-2: the planner derives dated visits with time slots from each contract, and carries a `confirmed` flag for the customer teyit step |

## Phase 7 — Planning board & visit-report list

Driven by a reference screenshot of the incumbent system plus "add a calendar
that shows what to do and notifies the workers".

| ID | Task | Status | Owner | Files | Notes |
|---|---|---|---|---|---|
| 7-1 | Visit-report board | **done** | Session L (`main`) | `views/visitReports.js`, `index.html`, `styles.css` | 226 seeded visits as numbered `VR_…` reports. Filters: visit type / date range / client / branch (branch narrows to client), plus search, page size and CSV. Report number opens the existing printable service report — no second renderer |
| 7-2 | Real service calendar | **done** | Session L (`main`) | `ui/calendar.js`, `data/schedule.js` | Replaces the fixed 31-cell grid. Month navigation, correct weekday alignment, served days from history + future days from the contract-derived plan |
| 7-3 | Dispatch assignments to technicians | **done** | Session L (`main`) | `core/notify.js`, `ui/demo.js` | Day- and month-level publish; per-technician queue persisted in `state`. Commercial fields are stripped on the way out (§1) |

## Phase 8 — Hardcoding audit

A pass over "what can a user actually create?". The answer was: facilities, work
orders, inspections, chemical *usage*, stock refills, recommendations, device
swaps, file uploads and contract edits — and nothing else.

| ID | Task | Status | Owner | Files | Notes |
|---|---|---|---|---|---|
| 8-1 | Single source of truth for sites | **done** | Session M (`main`) | `core/state.js`, `data/history.js`, `data/schedule.js`, `data/compliance.js`, `views/reportBodies.js`, `views/reports.js` | `allSites()` added; planning, reports, ranking and compliance now read the live portfolio. See note below |
| 8-2 | Fix s7/s8 geo drift | **done** | Session M (`main`) | `views/team.js`, `api/mobileData.js` | İzmir/Ankara existed only in `seed.js` — no map pin, no geofence, invisible to the mobile API |
| 8-3 | Visit-report client filter went stale | **done** | Session M (`main`) | `views/visitReports.js` | Cached on a one-shot `dataset.built`, so an admin who had viewed as a customer was stuck filtering by that one company |
| 8-4 | Station / monitoring-point CRUD | **done** | Session N (`main`) | `views/floorPlan.js`, `index.html`, `styles.css` | Place by clicking the plan, drag to reposition, delete from the sidebar. Auto code + barcode per equipment family |
| 8-5 | Floor-plan upload + point placement | **done** | Session N (`main`) | `views/floorPlan.js`, `data/catalog.js` | Per-facility upload, downscaled before storage; falls back to the built-in template. See note below |
| 8-6 | Chemical catalog admin | **todo** | — | — | §9 requires add/edit/remove by Repellent admins. The 12 products in `catalog.js` are fixed; "Kimyasal Ekle" only records *usage* |
| 8-7 | Staff & user management | **todo** | — | — | `techData`/`techRates`/`CREDENTIALS` and the 3 accounts in `core/auth.js` are all fixed. §11 also wants customer self-service password change |
| 8-8 | Replace hardcoded display rows | **todo** | — | — | `renderAiPredictions()` is 4 fixed cards under an "AI AKTİF" badge; `dashboard.js` prepends a fixed `curated[]` feed and a 3-row schedule above the derived rows |

## Phase 9 — Customer & technician experience

The two roles were auditable but not *usable*: the customer landed inside one
building with no way to ask for a visit, and the technician got the same generic
board an office user sees.

| ID | Task | Status | Owner | Files | Notes |
|---|---|---|---|---|---|
| 9-1 | Customer sees other companies' data | **done** | Session O (`main`) | `ui/demo.js` | **Privacy bug.** `operationalNotifs()` had no `client` branch, so a customer fell through to the office alerts and was shown another company's work orders and the whole portfolio's stock levels |
| 9-2 | Customer overview ("Genel Durum") | **done** | Session O (`main`) | `views/customerHome.js` | Next visit with crew and scope, actions the customer owes, facility cards. Replaces landing inside a single facility |
| 9-3 | Service request (acil çağrı / ek servis) | **done** | Session O (`main`) | `views/customerHome.js` | §1 prices call-outs and extra visits but the portal could not ask for one. Creates a real work order flagged `requestedByCustomer`, priced from the contract |
| 9-4 | Technician "Bugün" panel | **done** | Session O (`main`) | `views/techToday.js` | Next stop with address, one-tap navigation and phone, contract-derived task list, day counters, own certificate validity |
| 9-5 | Real addresses + derived service frequency | **done** | Session O (`main`) | `data/seed.js`, `core/state.js`, `views/companyDetail.js` | Address/period/frequency fell back to per-site-id hardcoded strings, so any site past s3 showed another site's address |
| 9-6 | Customer usage analytics (§12) | **todo** | — | — | Still the one whole `.docx` stage with no implementation |

---

## Notes for future sessions

**Caching bit us once — don't lose an hour to it again.** `server.js` used to
send `Cache-Control: immutable` on JS, and `service-worker.js` was cache-first
for every GET. Together they served a stale module that looked exactly like a
code bug: the file on disk was correct, `curl` returned the correct bytes, and
the browser still ran the old version. Both are fixed (server sends `no-cache`
for source; SW is network-first), but if you ever see an edit "not take
effect", verify with:

```js
await import('./src/app.js?p='+Date.now())   // surfaces the real module error
await fetch('./src/core/dom.js',{cache:'reload'})  // forces past a pinned entry
```

**`node --check` is not enough.** It validates syntax per file but will not
catch a missing `export` — that only fails at import time. Always verify a
refactor by loading the page and probing with the dynamic import above.

**Browser-console `import()` runs in an isolated module map.** Dynamically
importing a module from the devtools/automation context gives you a *different
instance* than the page's `<script type="module">` graph — mutations made by
the app are invisible in it. Do not use it to assert on shared state like
`ui`; it will read stale defaults and look like a bug. Assert on observable
DOM instead (e.g. switch site, count the rendered station rows).

**Check imports statically after any refactor.** The browser test only covers
paths you actually click; `bind()` has many branches it will not reach. Run:

```bash
python scripts/checkimports.py
```

It flags any module referencing an exported symbol it never imports. The
pattern also matches comments and strings, so the false-positive list grows as
the codebase does — fifteen as of Phase 4a:
the codebase does — eleven as of Phase 5a:

| File | Symbol | Why it is spurious |
|---|---|---|
| `core/session.js` | `applyRoleAccess` | comment |
| `data/seed.js` | `state` | object keys named `state:` |
| `data/catalog.js` | `save` | comment |
| `ui/signature.js` | `state` | comment |
| `views/reportBodies.js` | `ui`, `state`, `modal` | all three in one header comment |
| `views/reports.js` | `render`, `modal`, `state` | comment, the `'#modal'` selector string, and the `te-cov-state` class name |
| `data/billing.js` | `state`, `renderFinance` | both in comments |
| `views/finance.js` | `render`, `ui`, `modal` | comments and the `'#modal'` selector string |
| `ui/demo.js` | `modal` | the `$('#modal')` selector string |

Anything beyond these is real — but confirm before believing it. Print the hit
in context rather than trusting the count:

```python
import io, re
body = re.sub(r'^import .*$', '', io.open(F, encoding='utf8').read(), flags=re.M)
for m in re.finditer(r'(?<![\w$.])' + SYM + r'', body):
    print(body[:m.start()].count('
') + 1, body.splitlines()[body[:m.start()].count('
')])
```

**Run `git status` after you commit — it must come back clean.** Session A
wired `insights.js` to `#trendCaption` but the matching one-line `index.html`
change never made it into the commit; the feature silently half-worked until
the merge (fixed in `00201cc`). In a shared folder your uncommitted file hides
among other sessions' dirt. Worktrees (now mandated in the Wave 2 prompts)
make a leftover file impossible to miss.

**Browser tabs from before the cache fix are still poisoned.** The `no-cache`
header only helps requests made *after* it shipped; a tab (or automation
profile) that loaded the app in the `immutable` era holds year-valid HTTP cache
entries and will resurrect the old monolithic module graph — symptom: only ~6
JS files in the network log instead of 25. Recover with an explicit refresh of
every app URL via `fetch(url, {cache:'reload'})` plus SW unregister + cache
delete, then reload. Checking `performance.getEntriesByType('resource')` length
is the fastest way to confirm which graph actually loaded.

**Charts and export are available (0c).** Tasks 0b-2, 1-8, 2-2 consume these.

```js
import { lineChart, barChart, stackedBarChart, donutChart, mountChart } from '../ui/charts.js';
import { downloadCSV, downloadChartPNG, printElement } from '../ui/export.js';

mountChart('#trendChart', lineChart({
  labels: ['Oca','Şub','Mar'],
  series: [{ name: 'Kemirgen', values: [13,11,15] }]   // bare arrays also work
}));
downloadCSV('istasyonlar.csv', rows, [{ key:'code', label:'İstasyon' }]);
printElement('#reportBody', { title: 'Servis_Raporu' });  // browser "Save as PDF"
```

The chart builders are pure — options in, SVG markup string out — so the same
call serves the screen, the print layout and the PNG/SVG download. Sizing is
`viewBox`-driven; do **not** set a pixel width, `.ct-svg` handles responsiveness.

`demo/charts.html` is a live gallery of all four types plus both export paths.
It's a verification harness, not part of the app — delete it freely if it ever
gets in the way.

**Mounting a chart inside a CSS grid needs `min-width: 0` on the grid item.**
A grid item defaults to `min-width:auto`, which resolves to the SVG's *intrinsic*
viewBox width (640px) and refuses to shrink — `.ct-svg { width:100% }` then has
nothing to shrink into, so the chart overflows and `main`'s `overflow-x:hidden`
silently clips it. Symptom: the chart looks fine on desktop and is cut off on a
phone, with no horizontal scrollbar to hint at why. Phase 2 hit this on
`.analytics-grid`; the fix is one rule, not a media query. Inline
`grid-template-columns: repeat(N, 1fr)` has the same problem for non-chart
cards — prefer `repeat(auto-fit, minmax(190px, 1fr))`.

A bare `window.print()` (the existing report and QR-sticker buttons) now prints
the open modal, or the active view, without app chrome — the print stylesheet
handles that with no JS. Use `printElement()` when you need to print one
specific node instead.

**`recommendationStats()` gained fields; the original five are unchanged (1-6).**
`total / open / resolved / hygiene / isolation` keep their exact meaning —
`resolved` still counts only fully closed findings. The closed-loop detail lives
in a new `stage` field on each recommendation
(`raised` → `customer_actioned` → `approved`, plus `rejected`), exposed as the
additive counts `raised / awaitingApproval / approved / rejected / actioned /
withPhotoEvidence`. The invariants worth knowing:
`resolved === approved`, and `open === raised + awaitingApproval + rejected`
(an item the customer has actioned is **not** closed until a technician
approves it).

**A generator bug was fixed in `history.js`, so the seeded numbers moved.**
`readStation()` called `pick()` twice — once for `pestCode`, once for
`pestName` — so a reading's code and species name described *different*
species (e.g. code `ARI` labelled "Diğer Uçan"). It now draws once. This
consumes one fewer random number per catch, which shifts the whole seeded
stream: totals, trends and recommendation counts all differ from before the
fix. Output is still identical run-to-run; only the pre-fix values are gone.

**The technician role cannot reach the facility page.** `applyRoleAccess()`
restricts `tech` to `work` and `mobileSim`, so the closed loop's approval step
is performed from the `admin` role — which matches the roadmap's own wording
("Aksiyon alınanların kaçı **Repellent tarafından** onaylandı"). If a future
session wants the field technician approving from their own login, that is a
nav-access change in `core/roles.js`.

**`setView()` does not populate the facility page** — it only toggles which
section is visible. `applyRoleAccess()` used to send the `client` role there
with `setView('companyDetail')`, so customers landed on a blank screen; it now
calls `showCompanyDetail('s1')`. This adds a `roles.js → companyDetail.js`
import cycle (companyDetail → router → roles). ESM resolves it because the
calls happen at runtime, not module-eval — but it is worth knowing before
adding another edge to that cycle.
**The report suite is available (1-8 / 2-4 / 5-1).**

`views/reportBodies.js` exports five pure builders — `visitReport(visit)`,
`trendReport(siteId)`, `comparisonReport()`, `nonConformityReport(siteId?)` and
`auditPackage(standardId, siteId?)` — each returning an HTML string, the same
contract as `ui/charts.js`. `views/reports.js` owns only the registry, the
modal shell and the handlers; add a report by adding one entry to `REPORTS`
with `scope`, `build`, `filename` and `csv`, and the toolbar chips, CSV export
and print button all wire themselves.

`data/compliance.js` scores audit readiness from the visit history. Checks are
graded `major`/`minor` the way the standards themselves grade findings: one
major failure fails the site. Thresholds in `STANDARDS[].requires` and
`ACTIVITY_LIMIT` are calibrated against the seeded data — if the history
generator's seed ever changes, re-check them or every badge turns the same
colour and the strip stops telling a story.

**The `.docx` report set is now complete (6-2).** `docs/PLAN.md` phase 1 item 7
lists five — service, placement-list activity, pesticide usage, activity-only,
recommendation. Visit ≈ service and non-conformity ≈ recommendation; pesticide
usage is covered inside the visit report, the activity report's applied-products
section and the audit package's chemical log. The two that were previously owed
are now built as `placementActivityReport(siteId)` and `activityReport(visit)`,
bringing `REPORTS` to seven entries.

`placementActivityReport` is the roadmap's "yerleşim listesi": points grouped
into one sheet per equipment family (§4), each row carrying the point's current
barcode, whole-window reading and finding totals, dominant species and last
status, plus a device-replacement log. It is the clearest on-screen proof of §8
— F-01 at Acme shows 46 readings preserved across a swap onto a 2nd-generation
barcode, because `placementPoints()` keys history off the point code, never the
barcode. Export that helper's rows rather than re-deriving them: the CSV and the
printed sheet must not drift.

`activityReport` is deliberately *not* a filtered service report — it carries no
clean stations at all, only what was found, per §7's "10 nolu yem istasyonunda 2
adet fare" framing, with a species rollup naming the points each species came
from. Its `defaultSelection` deliberately anchors on the most recent visit with
`totals.all > 0`; opening on an empty sheet would undersell it on the first
click. The zero-activity path is still handled (badge flips to "Aktivite yok",
the species section and its donut are suppressed rather than rendered empty) —
7 of the seeded visits are clean, so that path is reachable in the demo.

**Role feeds must each have their own branch (9-1).** `operationalNotifs()` in
`ui/demo.js` returns early per role. The `client` branch was missing, so a
customer silently inherited the office feed — other companies' work orders, the
whole portfolio's risk sites and stock levels. When adding a notification
source, ask which roles it belongs to *first*; the office branch is the fallback
and it is not safe as a default.

**`load()` backfills fields the seed has gained (9-5).** A saved session keeps
its own `sites`, so a field added to the seed later (e.g. `address`) never
appeared for anyone with existing state. `load()` now fills *missing* keys from
the seed per site — user edits are never overwritten, because only `undefined`
keys are filled. This is why the per-site-id hardcoded address/frequency
fallbacks could finally be deleted: they existed to paper over that gap and
handed any site past s3 another site's address.

**Facility setup is now performable in-app (8-4 / 8-5).** `views/floorPlan.js`
owns the whole §3 "sistem kurulumu" loop: upload the facility's own plan, click
to place a monitoring point, drag it to the right spot, delete it. Points get an
auto code per equipment family (`nextStationCode` → R-01, R-02 … DZG-01) and a
barcode from the existing `barcodeFor()`, so a placed point is immediately real
to the plan, the placement list, the QR sheet and the reports.

Three things worth keeping in mind:

- **Uploaded plans are downscaled to 1400 px / JPEG 0.72 before storage.** State
  goes to localStorage *and* is PUT to the server on every `save()`, so an
  unprocessed phone photo would blow the quota and stall every write. A 2400×1600
  test plan lands at 1400×933 / ~29 KB. SVGs are stored as-is — they have no
  useful raster size and stay crisp.
- **`stationAreaName(site, station)` replaced bare `getStationArea(x, y)`.** The
  zone lookup only describes the built-in template; once a facility has its own
  plan those five room names are fiction, so it falls back to the placement
  record and otherwise says "Belirtilmedi" rather than inventing a room. Uploading
  or removing a plan therefore has to re-render the station tables, not just the
  image — the zone column depends on it.
- **`refreshPlanViews()` deliberately avoids `showCompanyDetail()`**, which would
  reset the facility page to the "Genel Bakış" tab and throw the user off the
  plan they are working on. It updates the counters inline and dynamic-imports
  companyDetail for the two renderers, which also keeps the two modules out of a
  static import cycle.

Drag uses pointer events on `document` with a 4 px threshold, so markers
re-rendered after a save keep working without rebinding, and a plain click still
selects. `floorPlanClicks` sits before `planCanvasClicks` in the chain and
swallows the click that ends a drag.

**`initial.sites` is the frozen seed; `allSites()` is the live portfolio (8-1).**
The app had two site lists that quietly disagreed: the UI read `state.sites`,
while history, planning, reports, ranking and compliance all read
`initial.sites`. A facility created through "Tesis ekle" therefore appeared in
the sites list and then existed nowhere else — no plan, no report scope, no
ranking row, `0 kayıt` on the visit board. It degraded quietly rather than
crashing, which is why it survived this long.

The split now has a clear rule:

- **History *generation* still walks `initial.sites`** and must keep doing so.
  The generator's per-site RNG is keyed on site id, but `visitSeq`/`recSeq` are
  global counters, so generating over a mutable list would renumber `VH-…`/`RH-…`
  ids and shift every calibrated threshold with them.
- **Everything else reads `allSites()`** (or `visibleSites()` where a role
  should narrow it). A new site gets a plan from its contract immediately, ranks
  last with zeros, and renders reports with honest empty states.

A new site deliberately gets *no* back-history — fabricating twelve months of
service records for a customer signed today would be a lie, not a feature.
Verified unchanged after the switch: 226 visits, 4077 findings, s1 2260, ranking
`s1:799 s7:182 s2:177 s8:90 …`, and every compliance badge.

Note `views/team.js` still keeps its own `SITE_GEO`, and `api/mobileData.js` its
own site list — coordinates and QR tokens the web seed does not carry. Those are
the remaining duplicates, and 8-2 exists because they silently drifted.

**The planner is contract-derived, and the history stream must not move (7-1/7-2).**
`data/schedule.js` reads each site's `serviceScope` to decide both how often a
site is attended (the busiest scope sets the rate) and *what* each visit covers —
a scope contracted at 2/month on a site attended 4 times lands on alternating
visits rather than the first two. `monthEntries()` returns served days from the
real history and only plans days after the dataset's `demoToday()`, so a month
never shows a planned visit beside the real one that fulfilled it.

Visits gained `team` / `teamLabel` / `description` / `reportNo`. These are
assigned in a **post-pass keyed on the visit id** (`rng('crew|'+id)`), never from
the main `r()` stream — drawing extra numbers inside the generation loop shifts
every downstream value and silently invalidates `ACTIVITY_LIMIT` in
`data/compliance.js` and the short-visit rule in `views/work.js`. Verified
unchanged after the change: 226 visits, 4077 findings, s1 recentPests 799.

**Technician notifications are state, not session (7-3).** `core/notify.js`
persists to `state.techNotifications` so a dispatched job survives a reload —
unlike the presenter's `window.__DEMO_NOTIFS__`. `notifyTechnicians()` strips
pricing and tax fields before queueing, because §1 says the technician receives
the schedule and the work, "ticari bilgiler hariç". The bell badge counts
*unread* for a technician but *total live alerts* for office roles; using one
rule for both meant a technician's badge never cleared.

`getStationArea()` and `placementSummary()` moved from `views/companyDetail.js`
to `data/catalog.js` as part of this, so the report bodies could resolve a
"Bölge Adı" without a view import — `reportBodies.js` stays pure (data + charts
only). Both were used solely inside companyDetail before the move.

**Field realism landed (Phase 3a / Session G).** `views/team.js` runs a
self-contained GPS simulation: a module-local `setInterval` (1.1s) drifts the
four `.map-person` elements between waypoints and detects geofence crossings.
It is started idempotently from `renderTeam()` via `startFieldSimulation()` and
can be paused with `stopFieldSimulation()`. The abstract canvas uses
percentage coordinates, not real geo. Site pins/fences live in `SITE_PINS`.

**The mobile offline outbox is in-memory only, by design.** `views/mobile.js`
holds `syncQueue` at module scope — it is NOT part of `core/state.js`, so a
reload empties it (that is the intended demo). `syncRecord(label)` is called at
each save point; offline it queues + badges, online it logs an immediate sync.
NFC and QR entry share `startFirstScan(code, method)`.

**Audit warnings (`views/work.js`, `auditWarnings()`) are derived, not stored.**
Short-visit is honest (`onSiteMin < 0.8 ×` the site's own average — calibrated
to the current seed; the tightest real visit is 0.707, so re-check if the seed
moves). QR-outside-fence and GPS-no-QR are deterministic hashes of the visit id
plus any live work order sitting in `arrived_gps`. No `app.js` handlers were
added this wave — new clicks fold into `teamRosterClicks` / `mobileClicks`, and
live audit rows reuse the existing `[data-work]` handler.
**Billing is available (4-1 / 4-3).** `data/billing.js` turns completed visits
into documents, deterministically:

```js
import { billableGroups, groupFor, invoiceFromGroup, irsaliyeFromVisit, irsaliyeNo }
  from '../data/billing.js';

const g = groupFor('s1', '2026-07');   // one site, one month
const invoice = invoiceFromGroup(g);   // superset of a seed invoice + lineItems
const irs = irsaliyeFromVisit(visit);  // delivery note view-model
```

Numbering is stable across demo re-runs: `FTR-YYYYMM-<site>` for invoices,
`IRS-YYYY-<visitseq>` for delivery notes. Revenue = the visit's share of the
monthly contract, with AC/ES visits billed on top; sites without a seeded
contract get a synthetic one (flagged `synthetic:true`). Generated invoices are
`unshift`ed into `state.invoices`, so they render in the existing finance ledger
and profitability bars unchanged — the shape is a superset of the seed invoices.
A loss-making month is real, not a bug: Acme (the risk site) runs negative in
June because contract revenue is diluted across many high-cost visits.

**Reset demo state properly** — it lives in three places:
```bash
rm -f data/state.json state.js     # server-side
```
plus `localStorage.clear()` in the page. Clearing only one leaves the app
restoring half-finished work orders, which makes flow tests lie.

