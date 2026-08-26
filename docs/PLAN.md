# PestOps / Repellent — Demo Build Plan

## Governing constraint

This is a **pitch demo**, not a production system. The bar is:

> Every feature must be clickable and produce a real, believable result —
> but "real" may mean deterministic client-side simulation, not a server.

No backend work beyond the existing static `server.js`. No database. No auth
hardening. If a choice is between "architecturally correct" and "demonstrably
works on a projector", pick the second.

Corollary: **no dead buttons, no empty states, no "coming soon".** A demo is
judged by the worst thing the audience clicks.

## Source documents

| Doc | What it is | Authority |
|---|---|---|
| `Repellent Online sistem yol haritası.docx` | The client's own requirements, 14 stages | **Highest** — this is what Repellent asked for |
| `Dijital_Pest_Control_Platformu_Teknik_Dokum.md` | Architecture spec (React/Flutter/NestJS/PostGIS) | Vocabulary + data model reference only; not being built |
| `gemini-code-*.txt` | Original prompt | Historical |

Insectram (competitor) baseline is captured in `docs/COMPETITOR.md`.

---

## Phase 0 — Foundations

Load-bearing. Phases 1–2 depend on it; building them first means building twice.

### 0a. Module split
Break the 4,000-line `app.js` into ES modules under `src/`. Zero build step —
`<script type="module">` works from a static file.

### 0b. History engine
**The critical invisible gap.** There is currently no historical data at all —
every trend chart is a hardcoded 8-element array. Generate ~12 months of
deterministic (seeded) visit history across all sites: station readings, pest
counts, chemicals used, recommendations raised/closed, technician timings.
Seasonality baked in (flying pests peak Jun–Aug) so the seasonal contract
frequencies mean something on screen.

Without this, month/year comparison, per-pest trend filtering, recommendation
statistics and regional comparison **cannot be demonstrated at any fidelity**.

### 0c. Chart + export utilities
Hand-rolled SVG charts (line / bar / stacked / donut). No CDN dependency — a
demo that breaks on bad conference wifi is a dead demo. CSV via blob download,
PDF via dedicated print stylesheet.

---

## Phase 1 — Repellent Stage 1 gaps  *(client's own document)*

1. Per-equipment-type placement forms (fly units: tube length, power, UV type,
   purchase date, tube-change date; moth/beetle traps: trap type, purchase
   date, pheromone-change period)
2. Equipment replacement preserving point history (new barcode, same number,
   old readings still charted)
3. Multi-pest multi-count per device ("23 house flies + 67 humpback flies")
4. Chemical depth — MSDS / label / ministry permit attachments, plus the
   auto-calculator (quantity → m² coverage, dosage, water ratio)
5. Closed-loop recommendation workflow — technician photo → action + deadline →
   customer "after" photo → technician approval
6. Dual digital signature at visit completion (pads exist, not wired)
7. The five printable reports (service, placement-list activity, pesticide
   usage, activity-only, recommendation)

## Phase 2 — Customer portal depth

Multi-location + cross-city/region comparison · interactive multi-select chart
filters with per-chart download · recommendation statistics (raised/actioned/
approved, hygiene vs isolation) · 3rd Eye audit section · technician credential
cards.

> ⚠️ **KVKK:** the `.docx` asks for SGK records and health reports to be
> customer-visible. Build with **placeholder documents and a visible KVKK
> notice** — never realistic personal data. Demonstrates the capability without
> shipping a privacy problem into a sales meeting.

## Phase 3 — Field realism  *(the "and more")*

Live technician map with simulated GPS movement · geofence enter/exit firing
visibly · **offline sync simulation** (toggle queues records with a live badge,
reconnect drains them) · NFC alongside QR · route optimization before/after ·
audit warnings (GPS but no QR, QR outside geofence, too-short visit).

This is where the existing first-QR lock stops being one clever feature and
becomes an audit story Insectram doesn't tell.

## Phase 4 — Stage 2 business layer

Auto-irsaliye generation · travel-vs-onsite time and technician efficiency ·
invoice generation from completed visits · notification centre with simulated
"report emailed to customer".

## Phase 5 — Demo hardening

Compliance badges (BRCGS / SALSA / ISO 22000 / FSSC 22000 / Red Tractor / AIB) ·
one-click demo reset · guided tour walking the pitch narrative · fast role
switching without re-login.

---

## Sequencing note

Phase 1 proves you read Repellent's document. Phase 3 proves you can beat
Insectram. If the audience is Repellent → 1 before 3 (current order). If it's a
broader pitch → move 3 ahead of 2.
