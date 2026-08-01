import datetime

from netlimit import policy_engine
from netlimit.models import (
    ACTION_ALLOW,
    ACTION_BLOCK,
    ACTION_TIME_RESTRICTED,
    Alert,
    PolicyRule,
    UsageRecord,
)


def test_classify_domain_matches_subdomains(session, categories):
    category = policy_engine.classify_domain(session, "www.facebook.com")
    assert category is not None
    assert category.name == "social_media"


def test_classify_domain_unmatched_returns_none(session, categories):
    assert policy_engine.classify_domain(session, "internal-tool.example-org.com") is None


def test_user_rule_overrides_department_rule(session, categories, dept, user):
    social = categories["social_media"]
    session.add(PolicyRule(department_id=dept.id, category_id=social.id, action=ACTION_BLOCK))
    session.add(PolicyRule(user_id=user.id, category_id=social.id, action=ACTION_ALLOW))
    session.flush()

    rule = policy_engine.resolve_rule(session, user, social)
    assert rule.user_id == user.id


def test_block_rule_blocks(session, categories, dept, user):
    social = categories["social_media"]
    session.add(PolicyRule(department_id=dept.id, category_id=social.id, action=ACTION_BLOCK))
    session.flush()

    blocked, reason = policy_engine.is_blocked_now(session, user, social)
    assert blocked is True
    assert "social_media" in reason


def test_exempt_user_never_blocked(session, categories, dept, user):
    social = categories["social_media"]
    session.add(PolicyRule(department_id=dept.id, category_id=social.id, action=ACTION_BLOCK))
    session.flush()
    user.is_exempt = True

    blocked, _ = policy_engine.is_blocked_now(session, user, social)
    assert blocked is False


def test_time_restricted_blocks_only_within_window(session, categories, dept, user):
    streaming = categories["streaming"]
    session.add(PolicyRule(
        department_id=dept.id, category_id=streaming.id, action=ACTION_TIME_RESTRICTED,
        restricted_start=datetime.time(9, 0), restricted_end=datetime.time(17, 0),
    ))
    session.flush()

    inside = datetime.datetime(2026, 1, 5, 12, 0)
    outside = datetime.datetime(2026, 1, 5, 20, 0)

    blocked_inside, _ = policy_engine.is_blocked_now(session, user, streaming, now=inside)
    blocked_outside, _ = policy_engine.is_blocked_now(session, user, streaming, now=outside)

    assert blocked_inside is True
    assert blocked_outside is False


def test_quota_status_reports_exceeded(session, categories, dept, user):
    today = datetime.date.today()
    policy_engine.record_usage(session, user, None, minutes=70, data_mb=10, date=today)

    status = policy_engine.get_quota_status(session, user, today)
    assert status["time"]["used"] == 70
    assert status["time"]["quota"] == dept.daily_time_quota_minutes
    assert status["time"]["exceeded"] is True


def test_alerts_fire_once_per_day(session, categories, dept, user):
    today = datetime.date.today()
    # dept quota is 60 minutes; 50 minutes crosses the 80% warning threshold
    policy_engine.record_usage(session, user, None, minutes=50, date=today)
    warnings = session.query(Alert).filter_by(user_id=user.id, alert_type="time_warning").all()
    assert len(warnings) == 1

    # recording more usage the same day should not duplicate the warning
    policy_engine.record_usage(session, user, None, minutes=1, date=today)
    warnings = session.query(Alert).filter_by(user_id=user.id, alert_type="time_warning").all()
    assert len(warnings) == 1

    # crossing 100% should fire an exceeded alert
    policy_engine.record_usage(session, user, None, minutes=20, date=today)
    exceeded = session.query(Alert).filter_by(user_id=user.id, alert_type="time_exceeded").all()
    assert len(exceeded) == 1


def test_evaluate_request_blocks_category(session, categories, dept, user):
    social = categories["social_media"]
    session.add(PolicyRule(department_id=dept.id, category_id=social.id, action=ACTION_BLOCK))
    session.flush()

    result = policy_engine.evaluate_request(session, user, "www.facebook.com")
    assert result["allowed"] is False
    assert result["category"] == "social_media"

    record = session.query(UsageRecord).filter_by(user_id=user.id, category_id=social.id).first()
    assert record.blocked_attempts == 1


def test_evaluate_request_blocks_when_quota_exceeded(session, categories, dept, user):
    today = datetime.date.today()
    policy_engine.record_usage(session, user, None, minutes=dept.daily_time_quota_minutes, date=today)

    result = policy_engine.evaluate_request(session, user, "example.com", now=datetime.datetime.combine(today, datetime.time(12, 0)))
    assert result["allowed"] is False
    assert "quota" in result["reason"].lower()


def test_evaluate_request_allows_and_records_usage(session, categories, dept, user):
    result = policy_engine.evaluate_request(session, user, "bbc.com", minutes=5, data_mb=2.0)
    assert result["allowed"] is True
    assert result["category"] == "news"

    minutes_used, data_used = policy_engine.get_usage_today(session, user)
    assert minutes_used == 5
    assert data_used == 2.0
