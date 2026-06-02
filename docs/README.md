# Handoff: Funnel Pacing Dashboard — Data Connection

## What this is

A **finished, working HTML dashboard** that reports how the marketing demand-gen
funnel is pacing against target for a given month. It is presented to marketing
leadership at the start of each month and screenshotted into a slide deck.

**This is NOT a UI-recreation task.** The design is done and the HTML is the
shipping artifact. Your job is to **connect live data to it** — replace the
hard-coded sample numbers with values from Databricks and a Google Sheet, and
build the manual override layer described below. Do not rebuild the UI in
another framework unless the team explicitly decides to; everything visual
(layout, RAG color logic, attainment math, the auto-drafted summary) already
works and should be preserved.

The entire integration surface is **one file: `data.js`.** Nothing else needs to
change for the data connection.

---

## The task, in order

1. **Feed the metrics from the real sources.** Populate `REPORT.metrics` and
   `REPORT.period` from Databricks (and whatever produces the funnel numbers).
2. **Build the manual override layer** (targets & forecasts get adjusted on the
   fly). Merge a human-owned Google Sheet on top of the source values.
3. **Surface the `overridden` flag** so the dashboard can mark adjusted cells.
4. **Leave the executive summary alone** — it auto-drafts from the data and is
   human-editable in the browser (localStorage). That is intentional and correct
   for narrative text. Do **not** move numbers into localStorage.

---

## The data contract (what the UI consumes)

### Current shape (sample data — see `data.js`)

Each metric supplies four raw inputs; everything visual is derived from them:

```js
{
  key: "mql", label: "Total MQLs", kind: "count", role: "volume",
  target: 7875, forecast: 5836, mom: -7, yoy: -42,
  children: [
    { key: "mql_ta",    label: "TA MQL",    kind: "count", target: 3846, forecast: 3296, mom: -5,  yoy: -38 },
    { key: "mql_micro", label: "Micro MQL", kind: "count", target: 4029, forecast: 2541, mom: -10, yoy: -46 },
  ],
}
```

Field meanings:
- `key` — stable id (used as React key and for the override join).
- `label` — display name.
- `kind` — `"count"` (whole number, e.g. 5,836) or `"rate"` (percentage, e.g. 2.88%).
- `role` — `"volume"` (a funnel stage / node) or `"conversion"` (a rate *between*
  stages — Website CVR, MQL→SAO). Conversions render as connector rows.
- `target` — full-month plan target.
- `forecast` — projected full-month value (updates as actuals land).
- `mom` / `yoy` — month-over-month / year-over-year % change, already as a number
  (e.g. `9.1` means +9.1%).
- `children` — optional segment breakdown that rolls up into the total
  (TA + Micro → Total). Children use the same fields.

`REPORT.period` is the month label (e.g. `"May 2026"`). `REPORT.dayOfMonth` /
`REPORT.daysInMonth` drive the "Day 7 of 31" pacing chip (date-derived, not a metric).
`REPORT.primaryKey` (`"sao"`) is the bottom-of-funnel metric the headline is about.

### Derived (do not recompute upstream — helpers already do it)
- **Attainment** = `forecast / target × 100`, via `window.attainment(m)`.
- **RAG status** via `window.statusFor(att)`:
  - `>= 100%` → **green** ("On / above target")
  - `90–99%`  → **yellow/gold** ("Slightly behind")
  - `< 90%`   → **red** ("Behind")
- Bar widths, pill colors, and the auto-draft headline all flow from these.
  **Keep these thresholds and the math as-is** — they are the agreed business rules.

---

## The manual override layer (build this)

Targets and forecasts are adjusted on the fly. Those edits are **shared decision
data** and must have a single source of truth + provenance — so they do **not**
belong in browser storage. Build a thin override layer at the data layer:

```
Databricks  ──►  base target / forecast
                            │   resolve():  value = override ?? source
Google Sheet ──► human edits │   (one row per metric per period, only when overriding)
                            ▼
                     REPORT.metrics  ──►  dashboard (read-only + "edited" flag)
```

Recommended per-value shape (reshape to fit the real feeds — illustrative, not binding):

```js
target:   { source: 7875, override: null },
forecast: { source: 5836, override: 6100, note: "Pulled paid spend", by: "Jane", at: "2026-05-03" }
```

Then a `resolve(field)` helper prefers `override`, else `source`, and reports
whether the value was overridden. **Everything downstream only needs the resolved
number plus a boolean `overridden` flag** — so build the warehouse/sheet merge
however the real data dictates without touching the UI. The join key is `metric.key`
× `period`.

Implementation tiers:
- **v1 (agile):** humans edit the Google Sheet; the pipeline merges it; the
  dashboard is read-only and just shows flags. No write API needed.
- **v2 (scalable):** inline editing in the dashboard writes back to the *same*
  override sheet via a backend (needs auth + write path + conflict handling).
  Same merge contract; only the writer changes.

> A full version of this note also lives at the top of `data.js`.

### Display hook for the flag
The dashboard should mark any overridden cell (small marker + a
"Overridden from `<source>` · `<by>` · `<at>`" tooltip). Wiring that boolean is the
only contract the display side needs — the visual treatment can be added in
`dir-table.jsx` (the `VolumeRow` / `ChildRow` / `ConversionRow` components).

---

## File map

| File | Role |
|---|---|
| `Funnel Pacing Dashboard.html` | **The production dashboard.** Entry point. Loads everything below. |
| `data.js` | **The integration point.** All numbers + the override-layer handoff note live here. This is the file you edit. |
| `dashboard.jsx` | Production component: the editable executive summary (`draftSummary()` = the auto-draft rules) + the table assembly. |
| `dir-table.jsx` | Table row components (`VolumeRow`, `ChildRow`, `ConversionRow`, `TableHeaderRow`) — where the overridden-cell flag would render. |
| `board.jsx` | Board chrome (header, period chip, takeaway slot, RAG legend) + `getInsights()` for the summary. |
| `shared.jsx` | Primitives: attainment pill, attainment bar, delta chip, status dot, legend. |
| `fabric-tokens.css` | BambooHR Fabric (Encore) design tokens — colors, type, spacing. |
| `fonts/` | Fields display serif (woff2 + ttf). Inter + Source Code Pro load from Google Fonts. |

Also in the project (reference only, not required to run the dashboard):
`Week 1 Forecast.html` — the original four-direction exploration canvas.

## Stack notes
- Plain React 18 + Babel-in-browser via CDN (no build step). The `.jsx` files are
  loaded as `<script type="text/babel">`. If the team wants a build step or to port
  into an existing app, the data contract above is what matters — the rest is
  presentational.
- Colors are Fabric/Encore tokens. If recreating inside an existing BambooHR app,
  use that app's Fabric theme rather than this copied `fabric-tokens.css`.
