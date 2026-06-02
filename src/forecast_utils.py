"""
Business-day pacing and comparison helpers.

Pacing logic (per data-source context):
  1. Find how many marketing business days have elapsed this month.
  2. Compute a daily average:  actual / bdays_elapsed
  3. Project to end-of-month:  actual + (daily_avg × remaining_bdays)
"""

import calendar
from datetime import date


def pace_to_eom(actual: float, bdays_elapsed: int, total_bdays: int) -> float:
    """
    Project a running metric to end-of-month using business-day pacing.
    Returns `actual` unchanged when bdays_elapsed == 0 (avoids div-by-zero
    on the first calendar day before any marketing business day has closed).
    """
    if bdays_elapsed <= 0 or total_bdays <= 0:
        return float(actual)
    remaining = max(0, total_bdays - bdays_elapsed)
    daily_avg = actual / bdays_elapsed
    return actual + daily_avg * remaining


def pct_change(current: float, prior: float, decimals: int = 1) -> float:
    """Signed percent change rounded to `decimals` places. Returns 0.0 if prior is 0."""
    if not prior:
        return 0.0
    return round((current - prior) / abs(prior) * 100, decimals)


def get_month_info(today: date | None = None) -> dict:
    """Calendar metadata for the current (or supplied) month."""
    if today is None:
        today = date.today()
    _, days_in_month = calendar.monthrange(today.year, today.month)
    return {
        "day_of_month":  today.day,
        "days_in_month": days_in_month,
        "period_label":  today.strftime("%B %Y"),   # "June 2026"
        "year":          today.year,
        "month":         today.month,
    }
