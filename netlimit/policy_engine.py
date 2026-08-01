"""Core business logic: rule resolution, quota tracking, access decisions.

This module is deliberately Flask-free so it can be unit tested and reused
by both the web dashboard and the log ingestion / Squid-helper code paths.
"""
import datetime

from netlimit.models import (
    ACTION_ALLOW,
    ACTION_BLOCK,
    ACTION_TIME_RESTRICTED,
    Alert,
    Category,
    CategoryDomain,
    PolicyRule,
    UsageRecord,
    User,
)

QUOTA_WARNING_THRESHOLD = 0.8  # fraction of quota that triggers a "warning" alert


def classify_domain(session, hostname):
    """Return the Category matching hostname, or None if uncategorized.

    Matches exact domains and subdomains, e.g. a rule for "facebook.com"
    also matches "www.facebook.com" and "m.facebook.com".
    """
    hostname = (hostname or "").lower().strip().rstrip(".")
    if not hostname:
        return None

    domains = session.query(CategoryDomain).all()
    best_match = None
    best_len = -1
    for cd in domains:
        d = cd.domain.lower()
        if hostname == d or hostname.endswith("." + d):
            if len(d) > best_len:
                best_match = cd.category
                best_len = len(d)
    return best_match


def resolve_rule(session, user, category):
    """Return the effective PolicyRule for (user, category): user rule wins over
    department rule; returns None if no rule exists (defaults to allow)."""
    if category is None:
        return None

    user_rule = (
        session.query(PolicyRule)
        .filter_by(user_id=user.id, category_id=category.id)
        .first()
    )
    if user_rule is not None:
        return user_rule

    return (
        session.query(PolicyRule)
        .filter_by(department_id=user.department_id, user_id=None, category_id=category.id)
        .first()
    )


def is_blocked_now(session, user, category, now=None):
    """Return (blocked: bool, reason: str|None) for whether `category` is
    currently blocked for `user`, considering time-restricted windows."""
    if user.is_exempt:
        return False, None

    rule = resolve_rule(session, user, category)
    if rule is None or rule.action == ACTION_ALLOW:
        return False, None

    if rule.action == ACTION_BLOCK:
        return True, f"Category '{category.name}' is blocked by policy"

    if rule.action == ACTION_TIME_RESTRICTED:
        now = now or datetime.datetime.now()
        current_time = now.time()
        start, end = rule.restricted_start, rule.restricted_end
        if start is None or end is None:
            return False, None
        in_window = (start <= current_time <= end) if start <= end else (
            current_time >= start or current_time <= end
        )
        if in_window:
            return True, (
                f"Category '{category.name}' is restricted between "
                f"{start.strftime('%H:%M')} and {end.strftime('%H:%M')}"
            )
        return False, None

    return False, None


def get_quota(user):
    """Return (time_quota_minutes, data_quota_mb) for a user, honoring
    per-user overrides and falling back to the department defaults."""
    time_quota = user.custom_time_quota_minutes
    if time_quota is None:
        time_quota = user.department.daily_time_quota_minutes

    data_quota = user.custom_data_quota_mb
    if data_quota is None:
        data_quota = user.department.daily_data_quota_mb

    return time_quota, data_quota


def get_usage_today(session, user, date=None):
    """Return (minutes_used, data_mb_used) summed across all categories for the day."""
    date = date or datetime.date.today()
    records = session.query(UsageRecord).filter_by(user_id=user.id, date=date).all()
    minutes = sum(r.minutes_used for r in records)
    data_mb = sum(r.data_mb_used for r in records)
    return minutes, data_mb


def get_quota_status(session, user, date=None):
    """Return a dict summarizing quota usage for the user for the given day."""
    date = date or datetime.date.today()
    time_quota, data_quota = get_quota(user)
    minutes_used, data_used = get_usage_today(session, user, date)

    def status(used, quota):
        if user.is_exempt or quota <= 0:
            return {
                "used": used, "quota": quota, "remaining": max(quota - used, 0),
                "exceeded": False,
            }
        return {
            "used": used, "quota": quota, "remaining": max(quota - used, 0),
            "exceeded": used >= quota,
        }

    return {
        "date": date,
        "time": status(minutes_used, time_quota),
        "data": status(data_used, data_quota),
    }


def _get_or_create_usage_record(session, user, category, date):
    category_id = category.id if category else None
    record = (
        session.query(UsageRecord)
        .filter_by(user_id=user.id, category_id=category_id, date=date)
        .first()
    )
    if record is None:
        record = UsageRecord(user_id=user.id, category_id=category_id, date=date)
        session.add(record)
        session.flush()
    return record


def record_usage(session, user, category, minutes=0, data_mb=0.0, date=None, blocked=False):
    """Record usage (or a blocked attempt) and raise quota alerts if crossed."""
    date = date or datetime.date.today()
    record = _get_or_create_usage_record(session, user, category, date)
    if blocked:
        record.blocked_attempts += 1
    else:
        record.minutes_used += minutes
        record.data_mb_used += data_mb
    session.flush()

    if not blocked:
        check_and_alert(session, user, date)
    return record


def _has_alert_today(session, user, date, alert_type):
    return (
        session.query(Alert)
        .filter_by(user_id=user.id, date=date, alert_type=alert_type)
        .first()
        is not None
    )


def check_and_alert(session, user, date):
    """Create quota_warning / quota_exceeded alerts once per day, per type."""
    if user.is_exempt:
        return []

    status = get_quota_status(session, user, date)
    created = []

    for dimension, label, unit in (("time", "time", "minutes"), ("data", "data", "MB")):
        info = status[dimension]
        if info["quota"] <= 0:
            continue
        fraction = info["used"] / info["quota"]

        if info["exceeded"] and not _has_alert_today(session, user, date, f"{dimension}_exceeded"):
            alert = Alert(
                user_id=user.id, date=date, alert_type=f"{dimension}_exceeded",
                message=(
                    f"{user.full_name} has exceeded their daily {label} quota "
                    f"({info['used']:.0f}/{info['quota']} {unit})"
                ),
            )
            session.add(alert)
            created.append(alert)
        elif (
            fraction >= QUOTA_WARNING_THRESHOLD
            and not info["exceeded"]
            and not _has_alert_today(session, user, date, f"{dimension}_warning")
        ):
            alert = Alert(
                user_id=user.id, date=date, alert_type=f"{dimension}_warning",
                message=(
                    f"{user.full_name} has used {fraction * 100:.0f}% of their daily "
                    f"{label} quota ({info['used']:.0f}/{info['quota']} {unit})"
                ),
            )
            session.add(alert)
            created.append(alert)

    session.flush()
    return created


def evaluate_request(session, user, hostname, now=None, minutes=1, data_mb=0.0):
    """Decide whether `user` may access `hostname` right now, and record the
    outcome. This is the function a Squid external-ACL helper (or the log
    ingester) calls for each request.

    Returns a dict: {"allowed": bool, "reason": str|None, "category": str|None}
    """
    now = now or datetime.datetime.now()
    date = now.date()
    category = classify_domain(session, hostname)

    if not user.is_exempt:
        blocked, reason = is_blocked_now(session, user, category, now)
        if blocked:
            record_usage(session, user, category, date=date, blocked=True)
            return {"allowed": False, "reason": reason, "category": category.name if category else None}

        quota_status = get_quota_status(session, user, date)
        if quota_status["time"]["exceeded"] or quota_status["data"]["exceeded"]:
            record_usage(session, user, category, date=date, blocked=True)
            return {
                "allowed": False,
                "reason": "Daily internet usage quota exceeded",
                "category": category.name if category else None,
            }

    record_usage(session, user, category, minutes=minutes, data_mb=data_mb, date=date)
    return {"allowed": True, "reason": None, "category": category.name if category else None}
