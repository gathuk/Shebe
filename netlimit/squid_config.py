"""Generates a Squid configuration snippet from the current policy state.

The generated file is meant to be included from the organization's main
squid.conf (e.g. `include /etc/squid/netlimit.conf`). It covers:

  * Static category ACLs (dstdomain lists) and department/user block rules,
    for fast, local enforcement of always-on blocks.
  * Time-restricted ACLs for categories that are only blocked during a
    window (e.g. streaming blocked 09:00-17:00).
  * An `external_acl_type` hook into `squid_helper.py`, which is the
    *authoritative* check: it calls the same policy engine used by the
    dashboard, so daily time/data quotas (which change throughout the day
    and can't be expressed as static Squid ACLs) are enforced correctly.

Static ACLs give cheap, instant blocking for the common case; the external
helper is what makes per-user daily quotas actually work.
"""
import datetime

from netlimit.models import ACTION_BLOCK, ACTION_TIME_RESTRICTED, Department, PolicyRule, User

HEADER = """\
# NetLimit generated Squid configuration
# Generated at: {timestamp}
# Do not edit by hand -- regenerate from the dashboard (Policies > Export Squid Config).
# Include this file from your main squid.conf, e.g.:
#   include /etc/squid/netlimit.conf
"""


def _acl_name(prefix, raw):
    safe = "".join(c if c.isalnum() else "_" for c in str(raw))
    return f"{prefix}_{safe}"


def generate_category_acls(categories):
    """ACLs matching destination domains for each category that has domains."""
    lines = ["# --- Category ACLs (destination domains) ---"]
    for category in categories:
        domains = [d.domain for d in category.domains]
        if not domains:
            continue
        acl = _acl_name("cat", category.name)
        domain_list = " ".join(f".{d}" for d in domains)
        lines.append(f"acl {acl} dstdomain {domain_list}")
    return lines


def generate_scope_acls(departments, users):
    """ACLs matching source IPs for each department and for exempt users."""
    lines = ["", "# --- Department / user source ACLs ---"]
    for dept in departments:
        ips = [u.ip_address for u in dept.users if not u.is_exempt]
        if not ips:
            continue
        acl = _acl_name("dept", dept.name)
        lines.append(f"acl {acl} src {' '.join(ips)}")

    exempt_ips = [u.ip_address for u in users if u.is_exempt]
    if exempt_ips:
        lines.append(f"acl exempt_users src {' '.join(exempt_ips)}")

    for user in users:
        acl = _acl_name("user", user.username)
        lines.append(f"acl {acl} src {user.ip_address}")

    return lines


def _time_acl_line(rule):
    acl = f"time_rule_{rule.id}"
    start = rule.restricted_start.strftime("%H:%M")
    end = rule.restricted_end.strftime("%H:%M")
    return acl, f"acl {acl} time {start}-{end}"


def generate_http_access_rules(rules):
    """http_access deny lines for BLOCK and TIME_RESTRICTED policy rules."""
    lines = ["", "# --- Access rules ---", "http_access allow exempt_users"]
    time_acl_lines = []

    for rule in rules:
        if rule.category is None or not rule.category.domains:
            continue
        cat_acl = _acl_name("cat", rule.category.name)
        scope_acl = (
            _acl_name("user", rule.user.username)
            if rule.user_id
            else _acl_name("dept", rule.department.name)
        )

        if rule.action == ACTION_BLOCK:
            lines.append(f"http_access deny {scope_acl} {cat_acl}")
        elif rule.action == ACTION_TIME_RESTRICTED and rule.restricted_start and rule.restricted_end:
            time_acl, time_line = _time_acl_line(rule)
            time_acl_lines.append(time_line)
            lines.append(f"http_access deny {scope_acl} {cat_acl} {time_acl}")

    if time_acl_lines:
        lines = lines[:2] + ["# --- Time window ACLs ---"] + time_acl_lines + [""] + lines[2:]

    lines.append("")
    lines.append("# --- Authoritative dynamic check (quotas + live policy) ---")
    lines.append(
        "external_acl_type netlimit_quota ttl=60 concurrency=50 %SRC %DST "
        "/opt/netlimit/squid_helper.py"
    )
    lines.append("acl netlimit_allowed external netlimit_quota")
    lines.append("http_access deny !netlimit_allowed")

    return lines


def render_full_config(session):
    from netlimit.models import Category

    categories = session.query(Category).all()
    departments = session.query(Department).all()
    users = session.query(User).all()
    rules = session.query(PolicyRule).all()

    out = [HEADER.format(timestamp=datetime.datetime.utcnow().isoformat() + "Z")]
    out += generate_category_acls(categories)
    out += generate_scope_acls(departments, users)
    out += generate_http_access_rules(rules)
    return "\n".join(out) + "\n"
