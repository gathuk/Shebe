from netlimit import squid_config
from netlimit.models import ACTION_BLOCK, PolicyRule


def test_render_full_config_includes_category_acl(session, categories, dept, user):
    social = categories["social_media"]
    session.add(PolicyRule(department_id=dept.id, category_id=social.id, action=ACTION_BLOCK))
    session.flush()

    config = squid_config.render_full_config(session)

    assert "acl cat_social_media dstdomain" in config
    assert ".facebook.com" in config
    assert f"acl dept_{dept.name}" in config
    assert user.ip_address in config
    assert "http_access deny dept_Engineering cat_social_media" in config
    assert "external_acl_type netlimit_quota" in config
    assert "http_access deny !netlimit_allowed" in config


def test_exempt_users_get_allow_rule(session, categories, dept, user):
    user.is_exempt = True
    session.flush()

    config = squid_config.render_full_config(session)
    assert "acl exempt_users src 10.0.0.5" in config
    assert "http_access allow exempt_users" in config
