"""Best-effort tender PDF/text parser: title, procuring entity, tender
number, category, closing date/time, tender fee, bid bond/tender security,
mandatory/eligibility documents checklist, and technical requirement line
items.

This is inherently approximate. Real-world government/company tender
documents vary wildly in layout (scanned images, multi-column PDFs,
inconsistent labelling, differing terminology between procuring entities),
and pdfplumber's page.extract_text() only handles text-layer PDFs -- a
scanned tender notice would need OCR (not implemented here) to extract
anything at all. Treat every field this module returns as a *draft* a human
reviews before it goes into a proposal, never as ground truth.
"""
import re
from dataclasses import dataclass, field

import pdfplumber

# Ordered per field: the first pattern that matches wins. Patterns are
# intentionally loose (labels vary a lot between procuring entities).
FIELD_PATTERNS = {
    "tender_number": [
        r"tender\s*no\.?\s*[:\-]?\s*([A-Z0-9][A-Z0-9/\-\.]{3,})",
        r"reference\s*no\.?\s*[:\-]?\s*([A-Z0-9][A-Z0-9/\-\.]{3,})",
    ],
    "procuring_entity": [
        r"procuring\s+entity\s*[:\-]?\s*(.+)",
        r"issued\s+by\s*[:\-]?\s*(.+)",
    ],
    "category": [
        r"category\s*[:\-]?\s*(.+)",
        r"tender\s+for\s*[:\-]?\s*(.+)",
    ],
    "closing_date": [
        r"closing\s+date(?:\s*(?:and|&)\s*time)?\s*[:\-]?\s*(.+)",
        r"deadline\s+for\s+submission\s*[:\-]?\s*(.+)",
    ],
    "tender_fee": [
        r"tender\s+fee\s*[:\-]?\s*(.+)",
        r"non[- ]refundable\s+fee\s*[:\-]?\s*(.+)",
    ],
    "bid_bond": [
        r"(?:tender|bid)\s+security\s*[:\-]?\s*(.+)",
        r"bid\s+bond\s*[:\-]?\s*(.+)",
    ],
}

# Keyword checklist for commonly-required mandatory/eligibility documents in
# Kenyan (and broadly East African) government tenders. Substring match on
# the lowered full text -- not exhaustive, and a document being *absent*
# from this list doesn't mean it isn't required, just that this heuristic
# didn't recognize the wording used.
MANDATORY_DOC_KEYWORDS = [
    "certificate of incorporation", "cr12", "kra pin", "tax compliance certificate",
    "business permit", "vat certificate", "audited accounts",
    "bid security", "tender security", "power of attorney",
    "agpo certificate", "professional license", "professional licence",
    "confidential business questionnaire", "cbq",
]

# Matches lines that look like a numbered/bulleted requirement item, e.g.
# "1. Supply and install...", "- Configure...", "(2) Provide...".
REQUIREMENT_LINE_RE = re.compile(
    r"^\s*(?:[-*•]|\(?\d{1,3}[\).:]|item\s*\d+[:.]?)\s*(.{8,300})$",
    re.IGNORECASE,
)


@dataclass
class ExtractedTender:
    title: str = None
    tender_number: str = None
    procuring_entity: str = None
    category: str = None
    closing_date_text: str = None
    tender_fee: str = None
    bid_bond: str = None
    mandatory_documents: list = field(default_factory=list)
    requirement_lines: list = field(default_factory=list)
    raw_text: str = ""


def extract_text_from_pdf(path):
    """Extract all text-layer text from a PDF, page by page. Pages
    pdfplumber can't get text from (e.g. scanned/image-only pages)
    contribute an empty string -- OCR is out of scope for this prototype."""
    chunks = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            chunks.append(page.extract_text() or "")
    return "\n".join(chunks)


def _first_match(patterns, text):
    for pattern in patterns:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            return m.group(1).strip().splitlines()[0].strip(" .:-")
    return None


def _find_mandatory_documents(text):
    lower = text.lower()
    return [doc for doc in MANDATORY_DOC_KEYWORDS if doc in lower]


def _find_requirement_lines(text):
    lines = []
    for raw_line in text.splitlines():
        m = REQUIREMENT_LINE_RE.match(raw_line)
        if m:
            candidate = m.group(1).strip()
            if candidate and candidate not in lines:
                lines.append(candidate)
    return lines


def parse_tender_text(text, title_hint=None):
    """Heuristically parse a tender document's plain text into structured
    fields. Best-effort regex/keyword matching -- see module docstring for
    limitations."""
    text = text or ""
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    title = title_hint or (lines[0] if lines else None)

    return ExtractedTender(
        title=title,
        tender_number=_first_match(FIELD_PATTERNS["tender_number"], text),
        procuring_entity=_first_match(FIELD_PATTERNS["procuring_entity"], text),
        category=_first_match(FIELD_PATTERNS["category"], text),
        closing_date_text=_first_match(FIELD_PATTERNS["closing_date"], text),
        tender_fee=_first_match(FIELD_PATTERNS["tender_fee"], text),
        bid_bond=_first_match(FIELD_PATTERNS["bid_bond"], text),
        mandatory_documents=_find_mandatory_documents(text),
        requirement_lines=_find_requirement_lines(text),
        raw_text=text,
    )


def parse_tender_pdf(path, title_hint=None):
    """Convenience wrapper: extract text from a PDF then parse it."""
    text = extract_text_from_pdf(path)
    return parse_tender_text(text, title_hint=title_hint)
