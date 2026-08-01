"""Production WSGI entrypoint (gunicorn: `gunicorn netlimit.wsgi:app`).

Auto-seeds demo data on boot if the database is empty. This matters on
free-tier hosts (Render, Railway) whose disks are ephemeral between
deploys/restarts: rather than booting to an empty, unusable dashboard,
the app reseeds itself so there's always something to test against.
Manual edits made during a session are lost on the next cold start --
that's an accepted tradeoff for a free demo instance, not a production
persistence guarantee (see README for a real deployment).
"""
import os

from netlimit.app import create_app
from netlimit.db import SessionLocal
from netlimit.models import User
from netlimit.seed import seed

app = create_app(os.environ.get("NETLIMIT_DB_URL"))

with SessionLocal() as _session:
    if _session.query(User).count() == 0:
        seed(_session)
        _session.commit()
