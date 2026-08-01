#!/usr/bin/env python3
"""Squid external_acl_type helper for NetLimit.

This is the authoritative allow/deny decision point: it calls the same
policy_engine used by the dashboard, so daily time/data quotas (which
change throughout the day) are enforced correctly, not just static
category blocks.

Wire it up in squid.conf (see squid_config.render_full_config output):

    external_acl_type netlimit_quota ttl=60 concurrency=50 %SRC %DST \\
        /opt/netlimit/squid_helper.py
    acl netlimit_allowed external netlimit_quota
    http_access deny !netlimit_allowed

Protocol (concurrency mode): each input line is
    "<channel-id> <src-ip> <dst-domain>"
and the reply must echo the channel-id:
    "<channel-id> OK"
    "<channel-id> ERR message=\"<reason>\""
    "<channel-id> BH message=\"<error>\""   (backend hiccup -- fail-safe)

Set NETLIMIT_UNKNOWN_IP_POLICY=deny to block traffic from IPs that aren't
registered to any user (default: allow, so unregistered devices such as
guest Wi-Fi aren't silently cut off from the internet).
"""
import os
import sys

from netlimit import policy_engine
from netlimit.db import init_db, session_scope
from netlimit.models import User

UNKNOWN_IP_POLICY = os.environ.get("NETLIMIT_UNKNOWN_IP_POLICY", "allow").lower()


def handle_line(session, channel_id, src_ip, dst):
    user = session.query(User).filter_by(ip_address=src_ip).first()
    if user is None:
        if UNKNOWN_IP_POLICY == "deny":
            return f'{channel_id} ERR message="Unregistered device"'
        return f"{channel_id} OK"

    result = policy_engine.evaluate_request(session, user, dst)
    if result["allowed"]:
        return f"{channel_id} OK"
    reason = (result["reason"] or "Blocked by policy").replace('"', "'")
    return f'{channel_id} ERR message="{reason}"'


def main():
    init_db(os.environ.get("NETLIMIT_DB_URL", "sqlite:////opt/netlimit/netlimit.db"))

    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        parts = line.split()
        if len(parts) < 3:
            print('BH message="malformed request"')
            sys.stdout.flush()
            continue

        channel_id, src_ip, dst = parts[0], parts[1], parts[2]
        try:
            with session_scope() as session:
                print(handle_line(session, channel_id, src_ip, dst))
        except Exception as exc:  # fail-safe: never crash the helper loop
            print(f'{channel_id} BH message="{exc}"')
        sys.stdout.flush()


if __name__ == "__main__":
    main()
