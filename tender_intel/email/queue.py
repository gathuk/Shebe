"""Email queue: turns a generated Proposal into an EmailQueueItem with
rendered subject/body, ready to be sent (or drafted) via Gmail.

The actual send is NOT implemented here -- see send_via_gmail_api() below.
This session's own demo send/draft, if any, was handled OUTSIDE this
codebase entirely, by the orchestrating Claude session's own Gmail tool
access -- not by this module.
"""
from tender_intel.config import CONTINGENCY_RATE, VAT_RATE
from tender_intel.models import EmailQueueItem


def render_email(tender, company_profile, proposal):
    """Return (subject, body) text for the proposal email. `tender` and
    `proposal` may be ORM objects or any object/namespace exposing the same
    attributes (title, external_id, procuring_entity / grand_total,
    unpriced_line_count) -- useful for tests and the demo script, which
    don't always have a persisted ORM Tender/Proposal on hand."""
    subject = f"Proposal: {tender.title}"
    ref = getattr(tender, "external_id", None)
    if ref:
        subject += f" (Ref: {ref})"

    if getattr(proposal, "unpriced_line_count", 0):
        total_line = (
            "Total: pending -- one or more BOQ line items are still unpriced "
            "(see attached proposal)."
        )
    else:
        total_line = (
            f"Total (incl. {CONTINGENCY_RATE * 100:.0f}% contingency, "
            f"{VAT_RATE * 100:.0f}% VAT): KES {proposal.grand_total:,.2f}"
        )

    body_lines = [
        f"Dear {getattr(tender, 'procuring_entity', None) or 'Sir/Madam'},",
        "",
        f"Please find attached {company_profile['legal_name']}'s proposal in response to "
        f"\"{tender.title}\".",
        "",
        total_line,
        "",
        "We remain available for any clarification required.",
        "",
        "Kind regards,",
        company_profile["legal_name"],
        company_profile.get("email", ""),
        company_profile.get("phone", ""),
    ]
    return subject, "\n".join(body_lines)


def queue_email(session, proposal, tender, company_profile, to_address=None):
    """Create (and persist) an EmailQueueItem for `proposal` in "queued"
    status. Does not send anything -- see send_via_gmail_api()."""
    subject, body = render_email(tender, company_profile, proposal)
    item = EmailQueueItem(
        proposal_id=proposal.id,
        to_address=to_address or "TODO-procuring-entity-contact-email",
        subject=subject,
        body=body,
        status="queued",
    )
    session.add(item)
    session.flush()
    return item


def send_via_gmail_api(email_queue_item, credentials=None):
    """NOT IMPLEMENTED in this prototype.

    Sending (or drafting) email for real requires Gmail API OAuth
    credentials configured in a deployed environment -- this sandbox build
    has neither the credentials nor a real mailbox to send from, and isn't
    meant to send real email on its own. Wire this up with the
    `google-api-python-client` / `google-auth` stack (or an existing org
    integration) before using this in production. For this build's own
    demo, any drafting/sending performed was done directly by the
    orchestrating Claude session via its own Gmail tool access, outside
    this codebase.
    """
    raise NotImplementedError(
        "send_via_gmail_api is a stub -- see docstring. Configure Gmail API "
        "OAuth credentials and implement this before using in production."
    )
