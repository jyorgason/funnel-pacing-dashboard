/* ============================================================================
   Week 1 Forecast — DATA LAYER
   ----------------------------------------------------------------------------
   This is the ONLY file you need to wire up in Claude Code.

   Each metric supplies four raw inputs:
       target    – the v-plan target for the full month
       forecast  – projected full-month value (updates as actuals land)
       mom       – month-over-month % change   (already a %, e.g. 9.1)
       yoy       – year-over-year  % change   (already a %, e.g. -14)

   Everything visual (attainment %, RAG color, bar widths, the headline)
   is DERIVED from these four numbers by the helpers below — so a Databricks /
   Google-Sheets feed only has to populate target / forecast / mom / yoy.

   To connect a live source, replace REPORT.metrics + REPORT.period with the
   query result, keeping this shape. Nothing else changes.
   ============================================================================

   ----------------------------------------------------------------------------
   HANDOFF NOTE — MANUAL OVERRIDE LAYER (build this during data connection)
   ----------------------------------------------------------------------------
   Targets and forecasts get adjusted on the fly. Do NOT let those edits live in
   the dashboard's browser storage — numbers are shared decision data and need a
   single source of truth + provenance. (The executive summary is the ONE thing
   that may stay browser-local: it's presenter narrative, not data.)

   Instead, build a thin OVERRIDE LAYER here, at the data layer:

       Databricks ──► base target / forecast
                                 │   resolve():  value = override ?? source
       Override sheet ──► human  │
       (Google Sheet)            ▼
                              REPORT.metrics ──► dashboard (read-only + flag)

   Recommended per-value shape once sources are known (reshape freely to match
   the real feeds — this is illustrative, not binding):

       target:   { source: 7875, override: null },
       forecast: { source: 5836, override: 6100, note: "…", by: "Jane", at: "2026-05-03" }

   Then a resolve(field) helper prefers `override`, else `source`, and reports
   whether the value was overridden. Everything downstream (attainment, RAG,
   bars, the auto-draft) only needs the RESOLVED number plus a boolean
   `overridden` flag — so the warehouse/sheet merge can be built however the real
   data dictates without touching the UI.

   The dashboard already expects to FLAG overridden cells (small marker +
   "Overridden from <source> · <by> · <at>" tooltip). Wiring that flag is the
   only contract the display side needs.

   Tiers:
     • Agile v1  — humans edit the Google Sheet; pipeline merges; dashboard is
                   read-only and just shows flags. No write API needed.
     • Scalable v2 — inline edit in the dashboard writes back to the SAME
                   override sheet via the backend (needs auth + write path +
                   conflict handling). Same merge contract; only the writer changes.
   ============================================================================ */

/* ── SAMPLE DATA — run src/build_data_js.py to replace with live values ─────
   The override layer is wired below. Each metric carries:
     overridden: bool          – true when a human row exists in "Pipeline Overrides" sheet
     _ovr: { target, forecast }  – provenance object from the override sheet
   The resolved `target` and `forecast` fields are what the UI reads. */

window.REPORT = {
  period: "June 2026",
  // date-derived pacing context for the "Day X of Y" chip
  dayOfMonth: 3,
  daysInMonth: 30,

  // Funnel order = top → bottom. `kind` drives formatting:
  //   'count'      → whole number (e.g. 7,875)
  //   'rate'       → percentage value (e.g. 2.88%)
  // `role`:
  //   'volume'     → a funnel-stage count (a node in the funnel)
  //   'conversion' → a rate BETWEEN two stages (the connector)
  // `children`     → segment breakdown that rolls up into this total.
  // `overridden`   → true when a Pipeline Overrides row exists for this metric/period.
  // `_ovr`         → provenance: { target: {value,note,by,at}, forecast: {...} }
  metrics: [
    {
      key: "visits", label: "Marketable Visits", kind: "count", role: "volume",
      target: 378943, forecast: 579960, mom: 9.1, yoy: -14,
      overridden: false,
    },
    {
      key: "cvr", label: "Website CVR", kind: "rate", role: "conversion",
      target: 2.88, forecast: 3.54, mom: 18.6, yoy: 4,
      overridden: false,
    },
    {
      key: "mql", label: "Total MQLs", kind: "count", role: "volume",
      target: 8450, forecast: 7425, mom: 2.3, yoy: 6.7,
      overridden: false,
      children: [
        { key: "mql_ta",    label: "TA MQL",    kind: "count", target: 4095, forecast: 3960, mom: 5.1,  yoy: 9.7,  overridden: false },
        { key: "mql_micro", label: "Micro MQL", kind: "count", target: 4355, forecast: 3025, mom: -3.1, yoy: 5.5,  overridden: false },
      ],
    },
    {
      key: "mql_sao", label: "MQL → SAO", kind: "rate", role: "conversion",
      target: 35.86, forecast: 23.7, mom: -6.3, yoy: -14.1,
      overridden: false,
    },
    {
      key: "sao", label: "Total SAOs", kind: "count", role: "volume",
      target: 3030, forecast: 1760, mom: -19.0, yoy: -39.3,
      overridden: false,
      children: [
        { key: "sao_ta",    label: "TA SAO",    kind: "count", target: 1689, forecast: 946,  mom: -19.5, yoy: -46.8, overridden: false },
        { key: "sao_micro", label: "Micro SAO", kind: "count", target: 1341, forecast: 605,  mom: -18.4, yoy: -27.5, overridden: false },
      ],
    },
  ],

  // The single metric the report is ultimately about (bottom-of-funnel output).
  primaryKey: "sao",
};

/* ----------------------------- DERIVATIONS ------------------------------- */

// Attainment = forecast / target, as a whole-number %.
window.attainment = function (m) {
  if (!m.target) return null;
  return (m.forecast / m.target) * 100;
};

/* RAG thresholds (per spec):
     >= 100  → green   "On / above target"
     90–99   → yellow  "Slightly behind"
     < 90    → red     "Behind"
   Colors are Fabric tokens (greens/golds/reds). The gold band uses the
   poppy-yellow accent so the signal reads as a true yellow while staying
   legible (dark-gold text). */
window.STATUS = {
  green:  { key: "green",  label: "On / above target", text: "var(--success-dark)",    fill: "var(--success)",            tint: "var(--success-light)",                      bar: "var(--success)" },
  yellow: { key: "yellow", label: "Slightly behind",   text: "var(--accent-dark-gold)", fill: "var(--accent-poppy-yellow)", tint: "color-mix(in srgb, var(--accent-poppy-yellow) 20%, #fff)", bar: "var(--accent-poppy-yellow)" },
  red:    { key: "red",    label: "Behind",            text: "var(--error-dark)",       fill: "var(--error)",              tint: "var(--error-light)",                         bar: "var(--error)" },
};

window.statusFor = function (att) {
  if (att == null) return window.STATUS.green;
  if (att >= 100) return window.STATUS.green;
  if (att >= 90)  return window.STATUS.yellow;
  return window.STATUS.red;
};

/* ----------------------------- FORMATTERS -------------------------------- */

window.fmt = {
  count: (v) => Math.round(v).toLocaleString("en-US"),
  // compact 386,083 → 386K / 3,296 → 3.3K (used in tight viz labels)
  compact: (v) => {
    if (v >= 1000) {
      const k = v / 1000;
      return (k >= 100 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, "")) + "K";
    }
    return Math.round(v).toLocaleString("en-US");
  },
  rate: (v) => v.toFixed(2).replace(/\.?0+$/, "") + "%",
  pct: (v) => Math.round(v) + "%",
  // signed delta for M/M, Y/Y chips
  delta: (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(Math.abs(v) % 1 === 0 ? 0 : 1) + "%",
  value: (m) => (m.kind === "rate" ? window.fmt.rate(m.forecast) : window.fmt.count(m.forecast)),
  targetValue: (m) => (m.kind === "rate" ? window.fmt.rate(m.target) : window.fmt.count(m.target)),
};

/* Flatten to leaf+total rows in display order (for tables). */
window.flatRows = function () {
  const out = [];
  window.REPORT.metrics.forEach((m) => {
    out.push({ ...m, depth: 0 });
    (m.children || []).forEach((c) => out.push({ ...c, depth: 1, parent: m.key }));
  });
  return out;
};

/* Only the funnel VOLUME stages (Visits, MQLs, SAOs) in order. */
window.funnelStages = function () {
  return window.REPORT.metrics.filter((m) => m.role === "volume");
};
window.conversions = function () {
  return window.REPORT.metrics.filter((m) => m.role === "conversion");
};
