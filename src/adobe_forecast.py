#!/usr/bin/env python3
"""
adobe_forecast.py — Project Marketable Visits and Form Fill CVR for the current month.

Methodology (mirrors the Gemini gem that previously handled this):
  Visits  — compute day-of-week average traffic from the last 30 days,
             then project each remaining calendar day of the current month
             using the matching day-of-week average.
  CVR     — blend Form Fills / Visits over the most recent 14 days
             (excludes anomalous event spikes that inflate the 30-day average).
  MoM/YoY — derived from Historicals.csv monthly totals.

Reads:  Adobe Data/Projection.csv   (last 30 days of daily data)
        Adobe Data/Historicals.csv  (monthly totals, last 12+ months)
Writes: inputs/adobe_export.csv     (processed row consumed by build_data_js.py)
"""

import csv
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent))
import config

ADOBE_DIR        = config.ROOT / "Adobe Data"
PROJECTION_CSV   = ADOBE_DIR / "Projection.csv"
HISTORICALS_CSV  = ADOBE_DIR / "Historicals.csv"
OUTPUT_CSV       = config.ROOT / "inputs" / "adobe_export.csv"

CVR_LOOKBACK_DAYS = 14   # days used for blended CVR estimate


# ── Parsers ───────────────────────────────────────────────────────────────────

def _parse_adobe(path: Path) -> list[dict]:
    """
    Parse any Adobe Analytics CSV export.
    Skips comment lines (#...) and the aggregate totals row (Day / Month).
    Returns list of {date, visits, fills} dicts.
    """
    data_lines = []
    in_data = False
    with open(path, newline="", encoding="utf-8-sig") as f:
        for line in f:
            if line.strip().startswith(",Visits"):
                in_data = True
            if in_data:
                data_lines.append(line)

    if not data_lines:
        raise ValueError(f"Could not find data header in {path}")

    rows = []
    reader = csv.reader(data_lines)
    next(reader)  # skip header row  (,Visits,Form Fills,Form Fill CVR)
    for row in reader:
        if not row or not row[0].strip():
            continue
        date_str = row[0].strip()
        try:
            d = date.fromisoformat(date_str)
        except ValueError:
            continue  # skip "Day" / "Month" aggregate row
        rows.append({
            "date":   d,
            "visits": int(float(row[1].replace(",", ""))),
            "fills":  int(float(row[2].replace(",", ""))),
        })
    return rows


# ── Core forecast ─────────────────────────────────────────────────────────────

def compute_forecast(today: date | None = None) -> dict:
    today = today or date.today()

    projection  = _parse_adobe(PROJECTION_CSV)
    historicals = _parse_adobe(HISTORICALS_CSV)

    # ── Day-of-week visit averages (from last 30 days) ─────────────────────
    dow_visits = defaultdict(list)
    for row in projection:
        dow_visits[row["date"].weekday()].append(row["visits"])   # 0=Mon … 6=Sun
    dow_avg = {dow: sum(vs) / len(vs) for dow, vs in dow_visits.items()}

    # ── Split projection into current-month actuals vs prior ──────────────
    cur_month_start = today.replace(day=1)
    june_actuals = [r for r in projection if r["date"] >= cur_month_start and r["date"] <= today]
    june_actual_visits = sum(r["visits"] for r in june_actuals)
    june_actual_fills  = sum(r["fills"]  for r in june_actuals)

    # ── Project remaining days (today+1 through end of month) ─────────────
    import calendar as cal
    _, days_in_month = cal.monthrange(today.year, today.month)
    end_of_month = today.replace(day=days_in_month)

    projected_visits = 0
    d = today + __import__("datetime").timedelta(days=1)
    while d <= end_of_month:
        projected_visits += round(dow_avg.get(d.weekday(), 0))
        d += __import__("datetime").timedelta(days=1)

    visits_forecast = june_actual_visits + projected_visits

    # ── CVR: blended rate over the most recent N days ─────────────────────
    recent = sorted(projection, key=lambda r: r["date"])[-CVR_LOOKBACK_DAYS:]
    recent_visits = sum(r["visits"] for r in recent)
    recent_fills  = sum(r["fills"]  for r in recent)
    cvr_forecast  = round(recent_fills / recent_visits * 100, 2) if recent_visits else 2.88

    # ── MoM / YoY from Historicals ─────────────────────────────────────────
    hist_by_month = {}
    for row in historicals:
        key = (row["date"].year, row["date"].month)
        hist_by_month[key] = row

    prior_month = (today.year, today.month - 1) if today.month > 1 else (today.year - 1, 12)
    same_month_lly = (today.year - 1, today.month)

    prior_visits = hist_by_month.get(prior_month, {}).get("visits", 0)
    lly_visits   = hist_by_month.get(same_month_lly, {}).get("visits", 0)

    prior_fills  = hist_by_month.get(prior_month, {}).get("fills", 0)
    lly_fills    = hist_by_month.get(same_month_lly, {}).get("fills", 0)

    prior_cvr = prior_fills / prior_visits * 100 if prior_visits else 0
    lly_cvr   = lly_fills   / lly_visits   * 100 if lly_visits   else 0

    def pct(a, b):
        return round((a - b) / b * 100, 1) if b else 0.0

    visits_mom = pct(visits_forecast, prior_visits)
    visits_yoy = pct(visits_forecast, lly_visits)
    cvr_mom    = pct(cvr_forecast,    prior_cvr)
    cvr_yoy    = pct(cvr_forecast,    lly_cvr)

    period_label = today.strftime("%B %Y")

    return {
        "period":           period_label,
        "visits_forecast":  visits_forecast,
        "visits_mom":       visits_mom,
        "visits_yoy":       visits_yoy,
        "cvr_forecast":     cvr_forecast,
        "cvr_mom":          cvr_mom,
        "cvr_yoy":          cvr_yoy,
        # extras for logging
        "_june_actual_visits":  june_actual_visits,
        "_days_projected":      days_in_month - len(june_actuals),
        "_recent_cvr_days":     len(recent),
        "_prior_month_visits":  prior_visits,
        "_lly_visits":          lly_visits,
    }


# ── Writer ────────────────────────────────────────────────────────────────────

def write_adobe_csv(result: dict) -> None:
    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "period", "visits_forecast", "visits_mom", "visits_yoy",
        "cvr_forecast", "cvr_mom", "cvr_yoy",
    ]
    existing = []
    if OUTPUT_CSV.exists():
        with open(OUTPUT_CSV, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            existing = [r for r in reader if r.get("period") != result["period"]]

    row = {k: result[k] for k in fieldnames}
    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in existing:
            writer.writerow(r)
        writer.writerow(row)


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    result = compute_forecast()

    print(f"\nAdobe forecast for {result['period']}")
    print(f"  Visits forecast : {result['visits_forecast']:,}  "
          f"(actuals: {result['_june_actual_visits']:,} + "
          f"{result['_days_projected']} projected days)")
    print(f"  Visits MoM      : {result['visits_mom']:+.1f}%  "
          f"(vs {result['_prior_month_visits']:,} prior month)")
    print(f"  Visits YoY      : {result['visits_yoy']:+.1f}%  "
          f"(vs {result['_lly_visits']:,} same month last year)")
    print(f"  CVR forecast    : {result['cvr_forecast']:.2f}%  "
          f"(blended last {result['_recent_cvr_days']} days)")
    print(f"  CVR MoM         : {result['cvr_mom']:+.1f}%")
    print(f"  CVR YoY         : {result['cvr_yoy']:+.1f}%")
    print(f"\n  Written to {OUTPUT_CSV}")

    write_adobe_csv(result)
    return result


if __name__ == "__main__":
    main()
