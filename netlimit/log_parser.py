"""Parses Squid access logs (native format) for batch/offline usage ingestion.

Real-time enforcement happens via squid_helper.py (the external_acl_type
helper). This module is for backfilling historical logs and for periodic
reporting jobs that re-derive usage from the raw access log as a
cross-check.

Expected Squid "native" log line format:
    <unix-ts>.<ms> <elapsed-ms> <client-ip> <status>/<code> <bytes> <method> <url> ...
"""
import datetime
import re
from collections import defaultdict
from urllib.parse import urlparse

from netlimit import policy_engine
from netlimit.models import Category, User

LOG_LINE_RE = re.compile(
    r"^(?P<timestamp>\d+\.\d+)\s+(?P<elapsed>\d+)\s+(?P<client_ip>\S+)\s+"
    r"(?P<status>\S+)\s+(?P<bytes>\d+)\s+(?P<method>\S+)\s+(?P<url>\S+)"
)


def extract_hostname(url):
    candidate = url if "://" in url else f"http://{url}"
    return urlparse(candidate).hostname


def parse_line(line):
    """Parse a single access.log line into a dict, or None if unparseable."""
    match = LOG_LINE_RE.match(line.strip())
    if not match:
        return None
    data = match.groupdict()
    hostname = extract_hostname(data["url"])
    if hostname is None:
        return None
    return {
        "timestamp": datetime.datetime.fromtimestamp(float(data["timestamp"])),
        "client_ip": data["client_ip"],
        "bytes": int(data["bytes"]),
        "hostname": hostname,
    }


def ingest_lines(session, lines):
    """Parse and aggregate log lines into UsageRecord rows.

    "Active minutes" are counted as distinct one-minute buckets in which a
    user made at least one request to a given host, since raw proxy logs
    don't record continuous session/dwell time.
    """
    per_host = defaultdict(lambda: {"minutes": set(), "bytes": 0})
    processed = 0

    for line in lines:
        parsed = parse_line(line)
        if parsed is None:
            continue
        processed += 1
        minute_bucket = parsed["timestamp"].replace(second=0, microsecond=0)
        key = (parsed["client_ip"], parsed["timestamp"].date(), parsed["hostname"])
        per_host[key]["minutes"].add(minute_bucket)
        per_host[key]["bytes"] += parsed["bytes"]

    ip_to_user = {}
    unmatched_ips = set()
    per_category = defaultdict(lambda: {"minutes": set(), "bytes": 0})

    for (ip, date, hostname), agg in per_host.items():
        if ip not in ip_to_user:
            ip_to_user[ip] = session.query(User).filter_by(ip_address=ip).first()
        user = ip_to_user[ip]
        if user is None:
            unmatched_ips.add(ip)
            continue
        category = policy_engine.classify_domain(session, hostname)
        cat_key = (user.id, date, category.id if category else None)
        per_category[cat_key]["minutes"] |= agg["minutes"]
        per_category[cat_key]["bytes"] += agg["bytes"]

    updated_users = set()
    for (user_id, date, category_id), agg in per_category.items():
        user = session.get(User, user_id)
        category = session.get(Category, category_id) if category_id else None
        policy_engine.record_usage(
            session,
            user,
            category,
            minutes=len(agg["minutes"]),
            data_mb=agg["bytes"] / (1024 * 1024),
            date=date,
        )
        updated_users.add(user_id)

    return {
        "processed_lines": processed,
        "users_updated": len(updated_users),
        "unmatched_ips": sorted(unmatched_ips),
    }


def ingest_log_file(session, path):
    with open(path) as f:
        return ingest_lines(session, f)
