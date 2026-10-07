"""Production WSGI entrypoint (gunicorn: `gunicorn tender_intel.wsgi:app`).

Unlike netlimit/wsgi.py, this does NOT auto-seed demo data on boot --
tender data here should come from real ingest runs (tender_intel.sources.
ingest.run_ingest), not synthetic seed data, since it's meant to reflect
actually-advertised tenders. Use tender_intel/scripts/demo_run.py for a
scripted, schema/plumbing-only demo instead.
"""
import os

from tender_intel.app import create_app

app = create_app(os.environ.get("TENDER_INTEL_DB_URL"))
