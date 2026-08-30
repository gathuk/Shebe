import datetime
import time

from netlimit import log_parser
from netlimit.models import UsageRecord


def _ts(dt):
    return dt.timestamp()


def test_parse_line_extracts_hostname_and_bytes():
    ts = _ts(datetime.datetime(2026, 1, 5, 10, 30, 0))
    line = f"{ts:.3f}    120 10.0.0.5 TCP_MISS/200 5432 GET http://www.facebook.com/feed - HIER_DIRECT/1.2.3.4 text/html"
    parsed = log_parser.parse_line(line)
    assert parsed["client_ip"] == "10.0.0.5"
    assert parsed["hostname"] == "www.facebook.com"
    assert parsed["bytes"] == 5432


def test_parse_line_ignores_malformed_lines():
    assert log_parser.parse_line("not a valid squid log line") is None


def test_ingest_lines_updates_usage_and_classifies_category(session, categories, dept, user):
    day = datetime.datetime(2026, 1, 5, 10, 0, 0)
    lines = []
    for minute_offset in range(3):
        ts = day + datetime.timedelta(minutes=minute_offset)
        lines.append(
            f"{_ts(ts):.3f} 50 {user.ip_address} TCP_MISS/200 1048576 GET "
            f"http://www.facebook.com/ - HIER_DIRECT/1.2.3.4 text/html"
        )

    summary = log_parser.ingest_lines(session, lines)

    assert summary["processed_lines"] == 3
    assert summary["users_updated"] == 1
    assert summary["unmatched_ips"] == []

    record = (
        session.query(UsageRecord)
        .filter_by(user_id=user.id)
        .join(UsageRecord.category)
        .filter_by(name="social_media")
        .first()
    )
    assert record is not None
    assert record.minutes_used == 3  # 3 distinct one-minute buckets
    assert round(record.data_mb_used, 2) == 3.0  # 3 x 1MB


def test_ingest_lines_reports_unmatched_ip(session, categories, dept):
    ts = datetime.datetime(2026, 1, 5, 10, 0, 0)
    line = f"{_ts(ts):.3f} 50 192.168.99.99 TCP_MISS/200 1000 GET http://bbc.com/ - HIER_DIRECT/1.2.3.4 text/html"

    summary = log_parser.ingest_lines(session, [line])
    assert summary["unmatched_ips"] == ["192.168.99.99"]
    assert summary["users_updated"] == 0
