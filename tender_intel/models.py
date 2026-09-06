"""SQLAlchemy models for the tender intelligence / proposal-response
prototype. Mirrors netlimit/models.py's style (plain declarative models,
explicit status string constants instead of enums)."""
import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from tender_intel.db import Base

# Tender.status values
STATUS_NEW = "new"
STATUS_REVIEWED = "reviewed"
STATUS_PROPOSAL_GENERATED = "proposal_generated"
STATUS_SUBMITTED = "submitted"
STATUS_ARCHIVED = "archived"

# RequirementItem.item_type values
ITEM_TYPE_TECHNICAL = "technical_requirement"
ITEM_TYPE_ELIGIBILITY_DOC = "eligibility_document"
ITEM_TYPE_MANDATORY_DOC = "mandatory_document"


class Tender(Base):
    """A single tender opportunity, discovered by one of the sources/ connectors."""

    __tablename__ = "tenders"

    id = Column(Integer, primary_key=True)
    source = Column(String(60), nullable=False)  # e.g. "kenya_ppip"
    external_id = Column(String(120), nullable=True)  # tender number/reference, if known
    url = Column(String(500), nullable=False)
    title = Column(String(500), nullable=False)
    procuring_entity = Column(String(300), default="")
    category = Column(String(120), default="")
    country = Column(String(80), default="Kenya")

    published_at = Column(DateTime, nullable=True)
    closing_at = Column(DateTime, nullable=True)
    tender_fee = Column(String(120), nullable=True)

    relevance_score = Column(Float, default=0.0)
    relevance_matched_terms = Column(String(500), default="")
    status = Column(String(30), default=STATUS_NEW)
    raw_summary = Column(Text, default="")

    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    documents = relationship("TenderDocument", back_populates="tender", cascade="all, delete-orphan")
    requirement_items = relationship("RequirementItem", back_populates="tender", cascade="all, delete-orphan")
    proposals = relationship("Proposal", back_populates="tender", cascade="all, delete-orphan")


class TenderDocument(Base):
    """A document (tender notice, addendum, bid document...) associated with
    a tender. `local_path` points at a file a user has downloaded onto disk
    -- this prototype does not auto-download real tender PDFs, since that
    requires live network access this build environment doesn't have (see
    README)."""

    __tablename__ = "tender_documents"

    id = Column(Integer, primary_key=True)
    tender_id = Column(Integer, ForeignKey("tenders.id"), nullable=False)
    doc_type = Column(String(60), default="tender_notice")
    filename = Column(String(255), nullable=True)
    local_path = Column(String(500), nullable=True)
    source_url = Column(String(500), nullable=True)
    extracted_text = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    tender = relationship("Tender", back_populates="documents")


class RequirementItem(Base):
    """A single technical requirement or eligibility/mandatory document,
    extracted (heuristically -- see analysis/extract.py) from a tender
    document, or entered manually."""

    __tablename__ = "requirement_items"

    id = Column(Integer, primary_key=True)
    tender_id = Column(Integer, ForeignKey("tenders.id"), nullable=False)
    document_id = Column(Integer, ForeignKey("tender_documents.id"), nullable=True)

    item_type = Column(String(40), default=ITEM_TYPE_TECHNICAL)
    description = Column(Text, nullable=False)
    category = Column(String(120), nullable=True)
    quantity = Column(Float, nullable=True, default=1.0)
    unit = Column(String(40), nullable=True, default="unit")
    mandatory = Column(Boolean, default=False)
    raw_line = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    tender = relationship("Tender", back_populates="requirement_items")


class Proposal(Base):
    """A generated proposal response for a Tender: the priced BOQ totals and
    a pointer to the assembled PDF (proposal/builder.py)."""

    __tablename__ = "proposals"

    id = Column(Integer, primary_key=True)
    tender_id = Column(Integer, ForeignKey("tenders.id"), nullable=False)
    status = Column(String(30), default="draft")  # draft/generated/queued/sent

    subtotal = Column(Float, default=0.0)
    contingency_amount = Column(Float, default=0.0)
    vat_amount = Column(Float, default=0.0)
    grand_total = Column(Float, default=0.0)
    unpriced_line_count = Column(Integer, default=0)

    pdf_path = Column(String(500), nullable=True)
    notes = Column(Text, nullable=True)
    generated_at = Column(DateTime, default=datetime.datetime.utcnow)

    tender = relationship("Tender", back_populates="proposals")
    boq_line_items = relationship("BOQLineItem", back_populates="proposal", cascade="all, delete-orphan")
    email_queue_items = relationship("EmailQueueItem", back_populates="proposal", cascade="all, delete-orphan")


class BOQLineItem(Base):
    """A single priced (or explicitly unpriced) line of a Proposal's Bill of
    Quantities -- the persisted counterpart of boq/engine.py's BOQLine."""

    __tablename__ = "boq_line_items"

    id = Column(Integer, primary_key=True)
    proposal_id = Column(Integer, ForeignKey("proposals.id"), nullable=False)
    requirement_item_id = Column(Integer, ForeignKey("requirement_items.id"), nullable=True)

    catalog_key = Column(String(120), nullable=True)
    description = Column(Text, nullable=False)
    category = Column(String(120), nullable=True)
    quantity = Column(Float, default=1.0)
    unit = Column(String(40), default="unit")
    unit_price = Column(Float, nullable=True)
    line_total = Column(Float, nullable=True)
    matched = Column(Boolean, default=False)
    price_available = Column(Boolean, default=False)
    notes = Column(Text, nullable=True)

    proposal = relationship("Proposal", back_populates="boq_line_items")


class EmailQueueItem(Base):
    """A rendered subject/body ready to be sent (or drafted) for a Proposal.
    See email/queue.py -- actual sending is a documented stub in this
    prototype, not implemented here."""

    __tablename__ = "email_queue_items"

    id = Column(Integer, primary_key=True)
    proposal_id = Column(Integer, ForeignKey("proposals.id"), nullable=False)
    to_address = Column(String(255), nullable=True)
    subject = Column(String(500), nullable=True)
    body = Column(Text, nullable=True)
    status = Column(String(30), default="queued")  # queued/draft_created/sent/failed
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    sent_at = Column(DateTime, nullable=True)

    proposal = relationship("Proposal", back_populates="email_queue_items")
