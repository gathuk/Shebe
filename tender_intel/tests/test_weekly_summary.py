import datetime

from tender_intel.company import load_profile
from tender_intel.email.weekly_summary import build_summary, render_summary_email
from tender_intel.models import Tender


def _tender(session, **kwargs):
    defaults = dict(
        source="kenya_ppip", url="https://tenders.go.ke/tenders/1", title="Supply of Firewalls",
        procuring_entity="KRA", category="networking_cybersecurity", status="new",
    )
    defaults.update(kwargs)
    t = Tender(**defaults)
    session.add(t)
    session.flush()
    return t


def test_build_summary_empty_db(session):
    summary = build_summary(session)
    assert summary["total_open"] == 0
    assert summary["closing_soon"] == []
    assert summary["by_category"] == {}
    assert summary["source_errors"] == {}


def test_build_summary_counts_open_and_closing_soon(session):
    now = datetime.datetime.utcnow()
    _tender(session, url="https://x/1", closing_at=now + datetime.timedelta(days=5))
    _tender(session, url="https://x/2", closing_at=now + datetime.timedelta(days=45))
    _tender(session, url="https://x/3", closing_at=now - datetime.timedelta(days=1), status="archived")

    summary = build_summary(session, upcoming_window_days=21)

    assert summary["total_open"] == 2
    assert len(summary["closing_soon"]) == 1
    assert summary["closing_soon"][0].url == "https://x/1"


def test_build_summary_groups_by_category(session):
    _tender(session, url="https://x/1", category="networking_cybersecurity")
    _tender(session, url="https://x/2", category="power_solar")
    _tender(session, url="https://x/3", category="power_solar")

    summary = build_summary(session)

    assert len(summary["by_category"]["networking_cybersecurity"]) == 1
    assert len(summary["by_category"]["power_solar"]) == 2


def test_build_summary_surfaces_ingest_errors(session):
    ingest_result = {"errors": {"kenya_ppip": "boom"}}
    summary = build_summary(session, ingest_result=ingest_result)
    assert summary["source_errors"] == {"kenya_ppip": "boom"}


def test_render_summary_email_empty_db_mentions_no_tenders(session):
    summary = build_summary(session)
    subject, body = render_summary_email(summary, load_profile())
    assert "Tender Watch" in subject
    assert "No relevant tenders are currently tracked" in body


def test_render_summary_email_lists_closing_soon(session):
    now = datetime.datetime.utcnow()
    _tender(session, url="https://x/1", title="Supply of Firewalls",
            closing_at=now + datetime.timedelta(days=3))
    summary = build_summary(session)
    _subject, body = render_summary_email(summary, load_profile())
    assert "CLOSING SOON" in body
    assert "Supply of Firewalls" in body


def test_render_summary_email_lists_source_errors(session):
    summary = build_summary(session, ingest_result={"errors": {"mygov": "timeout"}})
    _subject, body = render_summary_email(summary, load_profile())
    assert "SOURCE ERRORS" in body
    assert "mygov: timeout" in body
