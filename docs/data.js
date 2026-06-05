/* ============================================================================
   Week 1 Forecast — DATA LAYER
   Auto-generated 2026-06-05T15:33 UTC
   Pacing: business day 4 of 22 (run_rate)

   To refresh: python src/build_data_js.py
   Override any value: add a row to the "Pipeline Overrides" tab in Sheets.
   ============================================================================ */

window.REPORT = {
  period: "June 2026",
  dayOfMonth: 5,
  daysInMonth: 30,
  primaryKey: "sao",

  metrics: [
    { key: "visits", label: "Marketable Visits", kind: "count", role: "volume",
      target: 378943, forecast: 485736, prior_month: 506503, prior_year: 451847, overridden: false },
    { key: "cvr", label: "Website CVR", kind: "rate", role: "conversion",
      target: 2.88, forecast: 3.05, prior_month: 5.45, prior_year: 4.86, overridden: false },
    { key: "mql", label: "Total MQLs", kind: "count", role: "volume",
      target: 7656, forecast: 9365, prior_month: 8514, prior_year: 8943, overridden: false,
      children: [
        { key: "mql_ta", label: "TA MQL", kind: "count",
          target: 3694, forecast: 5409, prior_month: 4917, prior_year: 4398, overridden: false },
        { key: "mql_micro", label: "Micro MQL", kind: "count",
          target: 3962, forecast: 3956, prior_month: 3597, prior_year: 4545, overridden: false },
      ] },
    { key: "mql_sao", label: "MQL \u2192 SAO", kind: "rate", role: "conversion",
      target: 35.86, forecast: 25.42, prior_month: 25.42, prior_year: 33.83, overridden: false },
    { key: "sao", label: "Total SAOs", kind: "count", role: "volume",
      target: 3030, forecast: 2380, prior_month: 2164, prior_year: 3025, overridden: false,
      children: [
        { key: "sao_ta", label: "TA SAO", kind: "count",
          target: 1689, forecast: 1408, prior_month: 1280, prior_year: 1862, overridden: false },
        { key: "sao_micro", label: "Micro SAO", kind: "count",
          target: 1341, forecast: 972, prior_month: 884, prior_year: 1163, overridden: false },
      ] },
  ],
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
