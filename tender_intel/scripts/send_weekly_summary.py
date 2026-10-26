#!/usr/bin/env python3
"""Entry point for the scheduled Monday digest (see
.github/workflows/tender_weekly_summary.yml).

Runs ingestion fresh against an ephemeral in-memory database on every
invocation, rather than relying on state persisted across CI runs -- a
GitHub Actions runner starts clean each time, so there's no durable
tender_intel.db to diff against without wiring up a hosted database (out
of scope for this prototype; see README). The tradeoff: this sends a
"here's everything currently open and relevant" snapshot each week, not a
"here's what's new since last week" delta. Simpler, and arguably still
useful -- it also surfaces scraper health, since a source that starts
erroring shows up in the digest every week until fixed.

Required environment variables:
    GMAIL_ADDRESS        Gmail account to send from.
    GMAIL_APP_PASSWORD   An App Password for that account (NOT its login
                          password) -- see README for how to generate one.
    SUMMARY_RECIPIENTS   Comma-separated recipient list, e.g.
                          "info@skystar.co.ke".

Exits non-zero on any failure to send (propagates the exception), so a
misconfigured secret shows up as a failed GitHub Actions run rather than a
silently-missing email. Per-source ingest failures do NOT fail the run --
run_ingest() already isolates those; they're surfaced inside the digest
body instead (see email/weekly_summary.py).

Run manually:
    GMAIL_ADDRESS=... GMAIL_APP_PASSWORD=... SUMMARY_RECIPIENTS=... \\
        python tender_intel/scripts/send_weekly_summary.py
"""
import os
import sys

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from tender_intel.company import load_profile  # noqa: E402
from tender_intel.db import init_db, session_scope  # noqa: E402
from tender_intel.email.weekly_summary import (  # noqa: E402
    build_summary,
    render_summary_email,
    send_via_smtp,
)
from tender_intel.sources.ingest import run_ingest  # noqa: E402


def main():
    gmail_address = os.environ["GMAIL_ADDRESS"]
    gmail_app_password = os.environ["GMAIL_APP_PASSWORD"]
    recipients = [addr.strip() for addr in os.environ["SUMMARY_RECIPIENTS"].split(",") if addr.strip()]
    if not recipients:
        raise SystemExit("SUMMARY_RECIPIENTS is set but contains no addresses")

    init_db("sqlite:///:memory:")
    company_profile = load_profile()

    with session_scope() as session:
        print("Running ingest across all enabled sources...")
        ingest_result = run_ingest(session)
        print(f"  fetched={ingest_result['fetched']} relevant={ingest_result['relevant']} "
              f"created={ingest_result['created']} updated={ingest_result['updated']} "
              f"errors={list(ingest_result['errors'])}")

        summary = build_summary(session, ingest_result=ingest_result)
        subject, body = render_summary_email(summary, company_profile)

    send_via_smtp(subject, body, recipients, gmail_address, gmail_app_password)
    print(f"Sent weekly summary to {', '.join(recipients)}: {subject}")


if __name__ == "__main__":
    main()
