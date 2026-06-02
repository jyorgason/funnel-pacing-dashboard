#!/usr/bin/env python3
"""
build_data_js.py — Regenerate design_handoff_funnel_pacing/data.js with live data.

Usage:
    cd "Week 1 Forecast"
    python -m dotenv run -- python src/build_data_js.py
  or (with env vars already set):
    python src/build_data_js.py

Sources:
  - Databricks  : MQL + SAO actuals, business-day pacing metadata
  - Google Sheets: monthly targets + any human overrides (Pipeline Overrides tab)
  - inputs/adobe_export.csv (optional): Visits & CVR from Adobe Analytics

Output:
  - design_handoff_funnel_pacing/data.js  (safe to open in the browser immediately)
"""

import csv
import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import config
import db_utils
import forecast_utils
import sheets_utils


# ── Helpers ───────────────────────────────────────────────────────────────────

def _resolve(src_val: float, ovr: dict | None) -> tuple[float, bool]:
    """Return (resolved_value, is_overridden). Override wins when present."""
    if ovr and ovr.get("value") is not None:
        return float(ovr["value"]), True
    return float(src_val) if src_val is not None else 0.0, False


def _rate(sao: float, mql: float) -> float:
    return round(sao / mql * 100, 2) if mql else 0.0


def _n(v) -> str:
    """Python value → clean JS literal (no trailing .0 on whole numbers)."""
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        f = float(v)
        if f == int(f) and abs(f) < 1e15:
            return str(int(f))
        return str(round(f, 2))
    return json.dumps(v)


def _format_ovr(ovr: dict | None) -> str:
    """Serialize an override provenance dict to a JS object literal."""
    if not ovr:
        return "null"
    parts = []
    for field in ("value", "note", "by", "at"):
        v = ovr.get(field)
        parts.append(f'{field}: {_n(v)}')
    return "{ " + ", ".join(parts) + " }"


# ── Adobe Analytics CSV (manual drop) ─────────────────────────────────────────

def load_adobe(period_label: str) -> dict:
    """
    Read inputs/adobe_export.csv and return the row matching period_label.

    Expected CSV columns:
        period, visits_forecast, visits_mom, visits_yoy,
        cvr_forecast, cvr_mom, cvr_yoy

    Returns {} if the file doesn't exist or the period row isn't found.
    The Gemini gem that processes the raw Adobe export should write this format.
    """
    if not config.ADOBE_CSV_PATH.exists():
        return {}
    try:
        with open(config.ADOBE_CSV_PATH, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                if row.get("period", "").strip().lower() == period_label.lower():
                    return {
                        k: float(str(v).replace(",", ""))
                        for k, v in row.items()
                        if k != "period" and v.strip()
                    }
    except Exception as e:
        print(f"  [warn] Could not read Adobe CSV: {e}")
    return {}


# ── Metric builder ─────────────────────────────────────────────────────────────

def _metric(
    key: str,
    label: str,
    kind: str,
    role: str | None,
    tgt_src: float,
    fc_src: float,
    mom: float,
    yoy: float,
    overrides: dict,
    children: list | None = None,
) -> dict:
    """
    Build one metric dict with resolved target/forecast and override provenance.
    `overrides` is the full period override map {"{key}.{field}": {...}}.
    """
    tgt_ovr = overrides.get(f"{key}.target")
    fc_ovr  = overrides.get(f"{key}.forecast")

    tgt,   tgt_is_ovr = _resolve(tgt_src, tgt_ovr)
    fcast, fc_is_ovr  = _resolve(fc_src,  fc_ovr)
    is_ovr = tgt_is_ovr or fc_is_ovr

    # Round to integer for counts, 2 dp for rates
    tgt   = int(round(tgt))   if kind == "count" else round(tgt,   2)
    fcast = int(round(fcast)) if kind == "count" else round(fcast, 2)

    m: dict = {
        "key":       key,
        "label":     label,
        "kind":      kind,
        "target":    tgt,
        "forecast":  fcast,
        "mom":       round(float(mom), 1),
        "yoy":       round(float(yoy), 1),
        "overridden": is_ovr,
    }
    if role:
        m["role"] = role
    if is_ovr:
        m["_ovr"] = {
            "target":   tgt_ovr,
            "forecast": fc_ovr,
        }
    if children is not None:
        m["children"] = children
    return m


# ── JS serialiser ──────────────────────────────────────────────────────────────

def _metric_to_js(m: dict, depth: int = 2) -> str:
    """Render one metric dict as a readable JS object literal."""
    pad  = "  " * depth
    ipad = "  " * (depth + 1)

    role_part = f', role: {_n(m.get("role"))}' if "role" in m else ""
    ovr_part  = ""
    if m.get("overridden") and m.get("_ovr"):
        tgt_ovr_js = _format_ovr(m["_ovr"].get("target"))
        fc_ovr_js  = _format_ovr(m["_ovr"].get("forecast"))
        ovr_part = (
            f",\n{ipad}_ovr: {{ "
            f"target: {tgt_ovr_js}, forecast: {fc_ovr_js} }}"
        )

    children_part = ""
    if m.get("children"):
        child_strs = [_metric_to_js(c, depth + 2) for c in m["children"]]
        children_sep = f",\n{'  ' * (depth + 2)}"
        children_part = (
            f",\n{ipad}children: [\n"
            f"{'  ' * (depth + 2)}{children_sep.join(child_strs)},\n"
            f"{ipad}]"
        )

    return (
        f"{{ key: {_n(m['key'])}, label: {_n(m['label'])}, "
        f"kind: {_n(m['kind'])}{role_part},\n{ipad}"
        f"target: {_n(m['target'])}, forecast: {_n(m['forecast'])}, "
        f"mom: {_n(m['mom'])}, yoy: {_n(m['yoy'])}, "
        f"overridden: {_n(m['overridden'])}"
        f"{ovr_part}{children_part} }}"
    )


def _extract_helpers(data_js_path: Path) -> str:
    """
    Read the static helpers section from data.js (everything from the
    DERIVATIONS comment onwards).  This section never changes between runs —
    keeping it in the source file means a designer can edit it without touching
    any Python.
    """
    marker = "/* ----------------------------- DERIVATIONS"
    content = data_js_path.read_text(encoding="utf-8")
    idx = content.find(marker)
    if idx == -1:
        raise RuntimeError(
            f"Could not find DERIVATIONS marker in {data_js_path}. "
            "Make sure the file hasn't been manually edited to remove it."
        )
    return content[idx:]


# ── Main build ─────────────────────────────────────────────────────────────────

def build_report() -> dict:
    today = date.today()
    info  = forecast_utils.get_month_info(today)
    period = info["period_label"]

    # ── Databricks ─────────────────────────────────────────────────────────────
    print(f"[db] Fetching current month actuals ({period})…")
    cur = db_utils.get_current_month_actuals()

    bdays_elapsed = cur.get("bdays_elapsed") or 1
    total_bdays   = cur.get("total_bdays")   or 22

    print(f"[db] Day {bdays_elapsed} of {total_bdays} marketing business days")

    prior_m_year  = today.year  if today.month > 1 else today.year - 1
    prior_m_month = today.month - 1 if today.month > 1 else 12

    print(f"[db] Fetching prior month actuals ({prior_m_year}-{prior_m_month:02d})…")
    pm = db_utils.get_period_actuals(prior_m_year, prior_m_month)

    print(f"[db] Fetching prior year actuals ({today.year - 1}-{today.month:02d})…")
    py = db_utils.get_period_actuals(today.year - 1, today.month)

    # ── Pacing forecasts ────────────────────────────────────────────────────────
    def pace(actual: int) -> int:
        return round(forecast_utils.pace_to_eom(actual, bdays_elapsed, total_bdays))

    fc = {k: pace(v) for k, v in cur.items()
          if k not in ("bdays_elapsed", "total_bdays")}

    # MQL → SAO conversion rates (current forecast, prior month, prior year)
    mql_sao_fc = _rate(fc["sao_total"], fc["mql_total"])
    mql_sao_pm = _rate(pm["sao_total"], pm["mql_total"])
    mql_sao_py = _rate(py["sao_total"], py["mql_total"])

    def mom(key: str) -> float:
        return forecast_utils.pct_change(fc[key], pm[key])

    def yoy(key: str) -> float:
        return forecast_utils.pct_change(fc[key], py[key])

    # ── Adobe Analytics (optional) ──────────────────────────────────────────────
    print("[adobe] Checking for CSV drop…")
    adobe = load_adobe(period)
    if adobe:
        print(f"  [adobe] Found data for {period}")
    else:
        print("  [adobe] No CSV found — Visits/CVR will use target as forecast placeholder")

    visits_fc  = adobe.get("visits_forecast")
    visits_mom = adobe.get("visits_mom", 0.0)
    visits_yoy = adobe.get("visits_yoy", 0.0)
    cvr_fc     = adobe.get("cvr_forecast")
    cvr_mom    = adobe.get("cvr_mom", 0.0)
    cvr_yoy    = adobe.get("cvr_yoy", 0.0)

    # ── Google Sheets targets + overrides ──────────────────────────────────────
    print(f"[sheets] Fetching targets for {period}…")
    try:
        targets = sheets_utils.get_targets(period)
        print(f"  [sheets] Targets: {targets}")
    except Exception as e:
        print(f"  [warn] Could not fetch targets: {e}. Targets will be 0.")
        targets = {}

    def t(key: str) -> float:
        return targets.get(key) or 0.0

    print(f"[sheets] Fetching overrides for {period}…")
    overrides = sheets_utils.get_overrides(period)
    if overrides:
        print(f"  [sheets] Overrides active: {list(overrides.keys())}")
    else:
        print("  [sheets] No overrides for this period")

    # Derive mql_sao target from SAO/MQL targets if not in sheet
    mql_sao_target = t("mql_sao") or _rate(t("sao"), t("mql"))

    # ── Build metrics list ──────────────────────────────────────────────────────
    metrics = [
        _metric(
            "visits", "Marketable Visits", "count", "volume",
            tgt_src=t("visits"),
            fc_src=visits_fc or t("visits"),    # fallback: target = forecast if no Adobe data
            mom=visits_mom, yoy=visits_yoy,
            overrides=overrides,
        ),
        _metric(
            "cvr", "Website CVR", "rate", "conversion",
            tgt_src=t("cvr"),
            fc_src=cvr_fc or t("cvr"),
            mom=cvr_mom, yoy=cvr_yoy,
            overrides=overrides,
        ),
        _metric(
            "mql", "Total MQLs", "count", "volume",
            tgt_src=t("mql"), fc_src=fc["mql_total"],
            mom=mom("mql_total"), yoy=yoy("mql_total"),
            overrides=overrides,
            children=[
                _metric("mql_ta",    "TA MQL",    "count", None,
                        t("mql_ta"),    fc["mql_ta"],
                        mom("mql_ta"),    yoy("mql_ta"),    overrides),
                _metric("mql_micro", "Micro MQL", "count", None,
                        t("mql_micro"), fc["mql_micro"],
                        mom("mql_micro"), yoy("mql_micro"), overrides),
            ],
        ),
        _metric(
            "mql_sao", "MQL → SAO", "rate", "conversion",
            tgt_src=mql_sao_target, fc_src=mql_sao_fc,
            mom=forecast_utils.pct_change(mql_sao_fc, mql_sao_pm),
            yoy=forecast_utils.pct_change(mql_sao_fc, mql_sao_py),
            overrides=overrides,
        ),
        _metric(
            "sao", "Total SAOs", "count", "volume",
            tgt_src=t("sao"), fc_src=fc["sao_total"],
            mom=mom("sao_total"), yoy=yoy("sao_total"),
            overrides=overrides,
            children=[
                _metric("sao_ta",    "TA SAO",    "count", None,
                        t("sao_ta"),    fc["sao_ta"],
                        mom("sao_ta"),    yoy("sao_ta"),    overrides),
                _metric("sao_micro", "Micro SAO", "count", None,
                        t("sao_micro"), fc["sao_micro"],
                        mom("sao_micro"), yoy("sao_micro"), overrides),
            ],
        ),
    ]

    return {
        "period":      period,
        "dayOfMonth":  info["day_of_month"],
        "daysInMonth": info["days_in_month"],
        "primaryKey":  "sao",
        "metrics":     metrics,
        "_meta": {
            "generated_at":  datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M UTC"),
            "bdays_elapsed": bdays_elapsed,
            "total_bdays":   total_bdays,
        },
    }


def write_data_js(report: dict) -> None:
    meta    = report.pop("_meta", {})
    metrics = report.pop("metrics")
    helpers = _extract_helpers(config.DATA_JS_PATH)

    metrics_js_parts = [_metric_to_js(m) for m in metrics]
    metrics_js = (",\n" + "    ").join(metrics_js_parts)

    # Rebuild report body without metrics (already rendered above)
    report_scalar = {k: v for k, v in report.items()}

    content = f"""\
/* ============================================================================
   Week 1 Forecast — DATA LAYER
   Auto-generated {meta.get('generated_at', 'unknown')}
   Pacing: business day {meta.get('bdays_elapsed', '?')} of {meta.get('total_bdays', '?')}.

   To refresh: python src/build_data_js.py
   Override any value: add a row to the "Pipeline Overrides" tab in Sheets.
   ============================================================================ */

window.REPORT = {{
  period: {_n(report_scalar['period'])},
  dayOfMonth: {_n(report_scalar['dayOfMonth'])},
  daysInMonth: {_n(report_scalar['daysInMonth'])},
  primaryKey: {_n(report_scalar['primaryKey'])},

  metrics: [
    {metrics_js},
  ],
}};

{helpers}"""

    config.DATA_JS_PATH.write_text(content, encoding="utf-8")
    print(f"\n[ok] Wrote {config.DATA_JS_PATH}")
    print(f"     Open docs/index.html via a local server, or push to GitHub Pages.")


def git_push() -> None:
    """Stage data.js, commit with a datestamp, and push to GitHub Pages."""
    import subprocess

    def run(cmd):
        result = subprocess.run(cmd, cwd=config.ROOT, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"git command failed: {' '.join(cmd)}\n{result.stderr}")
        return result.stdout.strip()

    today = date.today().isoformat()
    run(["git", "add", str(config.DATA_JS_PATH)])

    # Only commit if data.js actually changed
    status = run(["git", "status", "--porcelain", str(config.DATA_JS_PATH)])
    if not status:
        print("[git] data.js unchanged — nothing to push.")
        return

    run(["git", "commit", "-m", f"data: refresh {today}"])
    run(["git", "push"])
    print(f"[git] Pushed — dashboard will update at your GitHub Pages URL shortly.")


def main():
    import argparse
    from dotenv import load_dotenv
    load_dotenv(config.ROOT / ".env")

    parser = argparse.ArgumentParser()
    parser.add_argument("--no-push", action="store_true",
                        help="Write data.js but skip the git push (preview locally only).")
    args = parser.parse_args()

    report = build_report()
    write_data_js(report)

    if not args.no_push:
        git_push()


if __name__ == "__main__":
    main()
