import os
from pathlib import Path

ROOT          = Path(__file__).parent.parent
DASHBOARD_DIR = ROOT / "docs"
DATA_JS_PATH  = DASHBOARD_DIR / "data.js"
ADOBE_CSV_PATH = ROOT / "inputs" / "adobe_export.csv"

# ─── Databricks ───────────────────────────────────────────────────────────────
# Find these in your Databricks workspace → SQL Warehouses → Connection Details
DB_HOST      = os.environ.get("DATABRICKS_HOST", "")        # e.g. adb-1234.azuredatabricks.net
DB_TOKEN     = os.environ.get("DATABRICKS_TOKEN", "")       # personal access token
DB_HTTP_PATH = os.environ.get("DATABRICKS_HTTP_PATH", "")   # /sql/1.0/warehouses/<id>
DB_TABLE     = "analytics_us_east_2_production_sandbox_mktg.jyorgason.marketing_funnel"
DB_ATTRIBUTION = "First 90 Days"

# ─── Google Sheets ─────────────────────────────────────────────────────────────
# Create a GCP service account, share the sheet with it, download credentials.json
GOOGLE_CREDS_JSON   = os.environ.get("GOOGLE_CREDS_JSON", str(ROOT / "credentials.json"))
SHEETS_ID           = "1hivWayz53ql8qywV88hv3oygJJX-qqQNZHwnGTku9ks"
SHEET_TARGETS_TAB   = "2026 Marketing Targets"  # Update if tab name differs
SHEET_OVERRIDES_TAB = "Pipeline Overrides"       # Create this tab; see README

# Target rows are found by searching column A for label text — no row numbers needed.
# If the pipeline prints "Could not find sheet rows for: [...]", update _LABEL_SEARCH
# in sheets_utils.py to match the exact label text your sheet uses for those metrics.
