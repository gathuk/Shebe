"""Weekly digest email: summarizes currently-open, ICT-relevant tenders
across all enabled sources. Triggered by a scheduler (see
.github/workflows/tender_weekly_summary.yml) via
tender_intel/scripts/send_weekly_summary.py -- this module has no
knowledge of *how* or *when* it's triggered.

Unlike proposal emails (email/queue.py, still a stub pending Gmail API
OAuth), this digest is sent over plain SMTP using a Gmail "App Password" --
much simpler to wire into a scheduled CI job than full OAuth, and Google
supports App Passwords natively for exactly this kind of script-sends-mail
use case. See tender_intel/README.md for how to generate one.
"""
import datetime
import smtplib
import ssl
from email.mime.text import MIMEText

from tender_intel.models import Tender

DEFAULT_UPCOMING_WINDOW_DAYS = 21


def build_summary(session, upcoming_window_days=DEFAULT_UPCOMING_WINDOW_DAYS, ingest_result=None):
    """Return a plain dict describing the current state of the tender
    database: open ICT-relevant tenders (grouped by category), which of
    those close soonest, and -- if an ingest_result dict is supplied -- the
    per-source error report from that run, so a broken/blocked scraper
    shows up in the digest instead of failing silently."""
    now = datetime.datetime.utcnow()
    cutoff = now + datetime.timedelta(days=upcoming_window_days)

    open_tenders = (
        session.query(Tender)
        .filter(Tender.status != "archived")
        .filter((Tender.closing_at.is_(None)) | (Tender.closing_at >= now))
        .order_by(Tender.closing_at.is_(None), Tender.closing_at.asc())
        .all()
    )

    closing_soon = [t for t in open_tenders if t.closing_at and t.closing_at <= cutoff]

    by_category = {}
    for t in open_tenders:
        by_category.setdefault(t.category or "uncategorized", []).append(t)

    return {
        "generated_at": now,
        "total_open": len(open_tenders),
        "closing_soon": closing_soon,
        "closing_soon_window_days": upcoming_window_days,
        "by_category": by_category,
        "open_tenders": open_tenders,
        "source_errors": (ingest_result or {}).get("errors", {}),
        "ingest_stats": ingest_result,
    }


def render_summary_email(summary, company_profile):
    """Return (subject, body) plain-text for the weekly digest."""
    date_str = summary["generated_at"].strftime("%d %B %Y")
    legal_name = company_profile.get("legal_name", "Skystar Holdings Limited")
    subject = f"{legal_name} Tender Watch -- {date_str}"

    lines = [
        f"Weekly tender summary -- {date_str}",
        "",
        f"{summary['total_open']} open ICT/licensing-relevant tender(s) currently tracked.",
        f"{len(summary['closing_soon'])} closing within {summary['closing_soon_window_days']} days.",
        "",
    ]

    if summary["closing_soon"]:
        lines.append("CLOSING SOON")
        lines.append("-" * 40)
        for t in summary["closing_soon"]:
            closing = t.closing_at.strftime("%d %b %Y") if t.closing_at else "unknown date"
            lines.append(f"- [{closing}] {t.title}")
            if t.procuring_entity:
                lines.append(f"    {t.procuring_entity}")
            lines.append(f"    {t.url}")
        lines.append("")

    if summary["by_category"]:
        lines.append("BY CATEGORY")
        lines.append("-" * 40)
        for category, tenders in sorted(summary["by_category"].items()):
            lines.append(f"{category}: {len(tenders)}")
        lines.append("")

    if summary["source_errors"]:
        lines.append("SOURCE ERRORS THIS RUN (needs attention -- see README)")
        lines.append("-" * 40)
        for source, error in summary["source_errors"].items():
            lines.append(f"- {source}: {error}")
        lines.append("")

    if summary["total_open"] == 0:
        lines.append(
            "No relevant tenders are currently tracked. If this persists across "
            "several weekly runs, the scraper connectors likely need their "
            "selectors re-verified against the live sites -- see "
            "tender_intel/README.md ('Live scraping')."
        )
        lines.append("")

    lines.append("--")
    lines.append(legal_name)
    lines.append(company_profile.get("email", ""))
    lines.append(company_profile.get("phone", ""))

    return subject, "\n".join(lines)


def send_via_smtp(subject, body, to_addresses, smtp_address, smtp_app_password,
                   smtp_host="smtp.gmail.com", smtp_port=465):
    """Send a plain-text email via SMTP-over-SSL using a Gmail App Password.
    Raises on failure -- the scheduled script deliberately lets that
    propagate so a bad credential shows up as a failed CI run instead of a
    silently-missing email."""
    if isinstance(to_addresses, str):
        to_addresses = [to_addresses]

    message = MIMEText(body, "plain", "utf-8")
    message["Subject"] = subject
    message["From"] = smtp_address
    message["To"] = ", ".join(to_addresses)

    context = ssl.create_default_context()
    with smtplib.SMTP_SSL(smtp_host, smtp_port, context=context) as server:
        server.login(smtp_address, smtp_app_password)
        server.sendmail(smtp_address, to_addresses, message.as_string())
