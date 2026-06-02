"""
Databricks query helpers for the marketing funnel table.

Segmentation:
  TA    = MARKETING_TARGET_AUDIENCE = 'TA'   (25-150 and 151+ headcount)
  Micro = everything else (Non TA, Unknown)   (<25 headcount)

Attribution model: 'First 90 Days' (config.DB_ATTRIBUTION)

Business-day fields used for pacing:
  IS_BUSINESS_DAY_MARKETING  – 1 if this date counts as a marketing business day
  BUSINESS_DAY_OF_MONTH      – sequential business-day counter within the month
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from databricks import sql as dbsql
import config


def _conn():
    """
    Supports two auth methods — whichever env vars are present wins:

    Personal access token (dev / local):
        DATABRICKS_HOST, DATABRICKS_TOKEN, DATABRICKS_HTTP_PATH

    Service principal / OAuth M2M (CI / GitHub Actions — preferred for production):
        DATABRICKS_HOST, DATABRICKS_CLIENT_ID, DATABRICKS_CLIENT_SECRET, DATABRICKS_HTTP_PATH
        Ask your Databricks admin to create a service principal and grant it
        SELECT on analytics_us_east_2_production_sandbox_mktg.jyorgason.marketing_funnel.
    """
    if config.DB_CLIENT_ID and config.DB_CLIENT_SECRET:
        from databricks.sdk.oauth import ClientCredentials
        from databricks.sdk.config import Config as DatabricksConfig
        credentials_provider = ClientCredentials(
            client_id=config.DB_CLIENT_ID,
            client_secret=config.DB_CLIENT_SECRET,
            host=f"https://{config.DB_HOST}",
            scopes=["sql", "offline_access"],
        )
        return dbsql.connect(
            server_hostname=config.DB_HOST,
            http_path=config.DB_HTTP_PATH,
            credentials_provider=credentials_provider,
        )

    # Fall back to personal access token
    return dbsql.connect(
        server_hostname=config.DB_HOST,
        http_path=config.DB_HTTP_PATH,
        access_token=config.DB_TOKEN,
    )


def _query(sql_text: str) -> list[dict]:
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql_text)
            cols = [d[0].lower() for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]


def get_current_month_actuals() -> dict:
    """
    Returns actuals to date for the current month plus business-day pacing metadata.

    Keys returned:
      mql_ta, mql_micro, mql_total        – MQL1 counts by segment
      sao_ta, sao_micro, sao_total        – SAO counts by segment
      bdays_elapsed                       – marketing business days elapsed so far
      total_bdays                         – total marketing business days in the month
    """
    rows = _query(f"""
        SELECT
            /* MQL actuals (all calendar days up to today) */
            SUM(CASE WHEN DATE <= CURRENT_DATE()
                      AND MARKETING_TARGET_AUDIENCE = 'TA'  THEN MQL1 ELSE 0 END)       AS mql_ta,
            SUM(CASE WHEN DATE <= CURRENT_DATE()
                      AND MARKETING_TARGET_AUDIENCE != 'TA' THEN MQL1 ELSE 0 END)       AS mql_micro,
            SUM(CASE WHEN DATE <= CURRENT_DATE() THEN MQL1 ELSE 0 END)                  AS mql_total,

            /* SAO actuals (all calendar days up to today) */
            SUM(CASE WHEN DATE <= CURRENT_DATE()
                      AND MARKETING_TARGET_AUDIENCE = 'TA'  THEN SAO  ELSE 0 END)       AS sao_ta,
            SUM(CASE WHEN DATE <= CURRENT_DATE()
                      AND MARKETING_TARGET_AUDIENCE != 'TA' THEN SAO  ELSE 0 END)       AS sao_micro,
            SUM(CASE WHEN DATE <= CURRENT_DATE() THEN SAO  ELSE 0 END)                  AS sao_total,

            /* Business-day pacing counters */
            MAX(CASE WHEN DATE <= CURRENT_DATE()
                      AND IS_BUSINESS_DAY_MARKETING = 1
                     THEN BUSINESS_DAY_OF_MONTH END)                                     AS bdays_elapsed,
            MAX(CASE WHEN IS_BUSINESS_DAY_MARKETING = 1
                     THEN BUSINESS_DAY_OF_MONTH END)                                     AS total_bdays

        FROM   {config.DB_TABLE}
        WHERE  DATE >= DATE_TRUNC('MONTH', CURRENT_DATE())
          AND  DATE <  ADD_MONTHS(DATE_TRUNC('MONTH', CURRENT_DATE()), 1)
          AND  ATTRIBUTION_MODEL = '{config.DB_ATTRIBUTION}'
    """)

    row = rows[0] if rows else {}
    # Coerce to int; default 0/1 to avoid downstream div-by-zero
    out = {}
    for k, v in row.items():
        if k in ("bdays_elapsed", "total_bdays"):
            out[k] = int(v) if v is not None else (1 if k == "bdays_elapsed" else 22)
        else:
            out[k] = int(v) if v is not None else 0
    return out


def get_period_actuals(year: int, month: int) -> dict:
    """
    Full-month actuals for any completed month — used as M/M and Y/Y baseline.

    Returns same keys as get_current_month_actuals() except pacing fields.
    """
    start = f"{year}-{month:02d}-01"
    end_year  = year + 1 if month == 12 else year
    end_month = 1 if month == 12 else month + 1
    end = f"{end_year}-{end_month:02d}-01"

    rows = _query(f"""
        SELECT
            SUM(CASE WHEN MARKETING_TARGET_AUDIENCE = 'TA'  THEN MQL1 ELSE 0 END)  AS mql_ta,
            SUM(CASE WHEN MARKETING_TARGET_AUDIENCE != 'TA' THEN MQL1 ELSE 0 END)  AS mql_micro,
            SUM(MQL1)                                                                AS mql_total,
            SUM(CASE WHEN MARKETING_TARGET_AUDIENCE = 'TA'  THEN SAO  ELSE 0 END)  AS sao_ta,
            SUM(CASE WHEN MARKETING_TARGET_AUDIENCE != 'TA' THEN SAO  ELSE 0 END)  AS sao_micro,
            SUM(SAO)                                                                 AS sao_total
        FROM   {config.DB_TABLE}
        WHERE  DATE >= '{start}'
          AND  DATE <  '{end}'
          AND  ATTRIBUTION_MODEL = '{config.DB_ATTRIBUTION}'
    """)

    row = rows[0] if rows else {}
    return {k: int(v or 0) for k, v in row.items()}
