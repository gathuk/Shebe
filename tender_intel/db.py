"""Database engine/session setup for the tender_intel app -- mirrors
netlimit/db.py's structure so the two Flask tools in this repo behave the
same way operationally (same sqlite-by-default, same postgres:// handling).
"""
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import StaticPool

Base = declarative_base()
SessionLocal = sessionmaker(autoflush=False, autocommit=False)
_engine = None


def init_db(db_url="sqlite:///tender_intel.db"):
    """Create the engine, bind the session factory, and create tables."""
    global _engine
    if db_url.startswith("postgres://"):
        # SQLAlchemy 1.4+ dropped the legacy "postgres://" scheme; some hosts
        # still hand out URLs with it.
        db_url = "postgresql://" + db_url[len("postgres://"):]

    engine_kwargs = {}
    if db_url.startswith("sqlite"):
        engine_kwargs["connect_args"] = {"check_same_thread": False}
        if ":memory:" in db_url:
            # A plain in-memory sqlite DB is per-connection: without a shared
            # pool, each new session would see an empty database.
            engine_kwargs["poolclass"] = StaticPool
    _engine = create_engine(db_url, **engine_kwargs)
    SessionLocal.configure(bind=_engine)

    import tender_intel.models  # noqa: F401  (ensure models are registered)

    Base.metadata.create_all(_engine)
    return _engine


@contextmanager
def session_scope():
    """Provide a transactional session, committing on success."""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
