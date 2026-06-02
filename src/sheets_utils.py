"""
Google Sheets helpers: fetch monthly targets and human override rows.

Auth: service account credentials (credentials.json).
  1. Create a GCP project → Service Account → download JSON key
  2. Share the spreadsheet (editor access not needed — viewer is enough)
     with the service account's email address.
  3. Set GOOGLE_CREDS_JSON env var to the path of the JSON key file.

Override tab format (SHEET_OVERRIDES_TAB, row 1 = header):
    A: period       – "June 2026"
    B: metric_key   – matches REPORT.metrics[].key  (e.g. "mql", "sao_ta")
    C: field        – "target" or "forecast"
    D: value        – numeric override
    E: note         – free-text reason
    F: by           – who made the override
    G: at           – ISO date  (e.g. 2026-06-03)
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from googleapiclient.discovery import build
from google.oauth2 import service_account
import config

_SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]


def _service():
    creds = service_account.Credentials.from_service_account_file(
        config.GOOGLE_CREDS_JSON, scopes=_SCOPES
    )
    return build("sheets", "v4", credentials=creds)


def _read_tab(tab: str) -> list[list]:
    result = (
        _service()
        .spreadsheets()
        .values()
        .get(spreadsheetId=config.SHEETS_ID, range=f"'{tab}'")
        .execute()
    )
    return result.get("values", [])


def _find_month_col(rows: list[list], period_label: str) -> int | None:
    """Return 0-indexed column whose header contains the period label."""
    if not rows:
        return None
    label_lower = period_label.lower()
    for i, cell in enumerate(rows[0]):
        if label_lower in str(cell).strip().lower():
            return i
    return None


def _cell_float(rows: list[list], row_0idx: int, col_0idx: int) -> float | None:
    """Read a single cell (both 0-indexed) as float."""
    try:
        raw = rows[row_0idx][col_0idx]
        return float(str(raw).replace(",", "").replace("%", "").strip())
    except (IndexError, ValueError, TypeError):
        return None


# How each metric key maps to text fragments we look for in column A of the sheet.
# The search is case-insensitive and uses substring matching, so partial labels work.
# Add or adjust entries here if the sheet uses different label text.
_LABEL_SEARCH: dict[str, list[str]] = {
    "visits":    ["marketable visit"],
    "cvr":       ["website cvr", "site cvr", "web cvr"],
    "mql":       ["total mql", "mql total", "mql1 total"],
    "mql_ta":    ["ta mql", "mql ta", "mql1 ta"],
    "mql_micro": ["micro mql", "mql micro"],
    "mql_sao":   ["mql.*sao", "mql to sao", "mql → sao", "mql->sao"],
    "sao":       ["total sao", "sao total"],
    "sao_ta":    ["ta sao", "sao ta"],
    "sao_micro": ["micro sao", "sao micro"],
}


def _find_label_row(rows: list[list], fragments: list[str]) -> int | None:
    """Return 0-indexed row whose column-A cell matches any fragment (case-insensitive)."""
    import re
    for i, row in enumerate(rows):
        cell_text = str(row[0]).strip().lower() if row else ""
        for frag in fragments:
            # Treat fragments with .* as regex, others as plain substring
            if ".*" in frag:
                if re.search(frag, cell_text):
                    return i
            elif frag.lower() in cell_text:
                return i
    return None


def get_targets(period_label: str) -> dict:
    """
    Return {metric_key: float} for the given period.

    Finds each metric's target row by searching column A for label text —
    no hardcoded row numbers needed. The search terms are in _LABEL_SEARCH above;
    update those strings if the sheet uses different labels.
    """
    rows = _read_tab(config.SHEET_TARGETS_TAB)
    col = _find_month_col(rows, period_label)
    if col is None:
        raise ValueError(
            f"Period '{period_label}' not found in row 1 of '{config.SHEET_TARGETS_TAB}'. "
            f"Headers visible: {[str(c) for c in (rows[0] if rows else [])]}"
        )

    targets = {}
    missing = []
    for key, fragments in _LABEL_SEARCH.items():
        row_idx = _find_label_row(rows, fragments)
        if row_idx is None:
            missing.append(key)
            targets[key] = None
        else:
            targets[key] = _cell_float(rows, row_idx, col)

    if missing:
        print(f"  [warn] Could not find sheet rows for: {missing}")
        print(f"         Update _LABEL_SEARCH in sheets_utils.py to match your sheet labels.")

    return targets


def get_overrides(period_label: str) -> dict:
    """
    Return override entries for the given period from SHEET_OVERRIDES_TAB.
    Key format: "{metric_key}.{field}"  (e.g. "mql.forecast")
    Value: {value, note, by, at}

    Returns {} if the tab doesn't exist yet — no overrides is a valid state.
    """
    try:
        rows = _read_tab(config.SHEET_OVERRIDES_TAB)
    except Exception:
        return {}

    out = {}
    for row in rows[1:]:  # skip header row
        if not row or len(row) < 4:
            continue
        row_period = str(row[0]).strip()
        if row_period.lower() != period_label.lower():
            continue
        metric_key = str(row[1]).strip()
        field      = str(row[2]).strip()  # "target" or "forecast"
        try:
            value = float(str(row[3]).replace(",", "").strip())
        except ValueError:
            continue
        out[f"{metric_key}.{field}"] = {
            "value": value,
            "note": str(row[4]).strip() if len(row) > 4 else "",
            "by":   str(row[5]).strip() if len(row) > 5 else "",
            "at":   str(row[6]).strip() if len(row) > 6 else "",
        }
    return out
