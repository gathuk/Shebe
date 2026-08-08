"""Connector for Kenya's Public Procurement Information Portal (PPIP),
tenders.go.ke -- the government's official tender advertising site.

IMPORTANT: this build environment has no outbound route to tenders.go.ke,
so the selectors below were written against a *reconstructed*
approximation of a typical government tender-listing table (title link,
procuring entity, category, closing date columns), not verified against the
live DOM. Before relying on this in production:
  1. View source on the live PPIP tender listing page and confirm the
     table/row/column structure below.
  2. Update SELECTORS to match.
  3. Run from a host with real outbound network access -- see
     tender_intel/README.md, "Live scraping".
"""
import datetime
import re

from bs4 import BeautifulSoup

from tender_intel.sources.base import TenderListing, polite_fetch

SOURCE_NAME = "kenya_ppip"
BASE_URL = "https://www.tenders.go.ke"
LISTING_URL = f"{BASE_URL}/website/tenders/index"

# Verify against the live site before depending on this in production.
SELECTORS = {
    "row": "table.tender-list tr.tender-row, table#tenders-table tbody tr",
    "title_link": "a.tender-title, td.title a",
    "procuring_entity": "td.procuring-entity, td.pe-name",
    "category": "td.category",
    "closing_date": "td.closing-date, td.close-date",
    "tender_no": "td.tender-no",
}

_TENDER_NO_RE = re.compile(r"[A-Z0-9]+/[A-Z0-9\-/]+/\d{4}[\-/]\d{2,4}")


def _parse_datetime(text):
    text = (text or "").strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%d %H:%M", "%d/%m/%Y %H:%M", "%d-%m-%Y %H:%M", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def parse_listing_page(html, base_url=BASE_URL):
    """Parse a PPIP tender-listing page into normalized TenderListing rows.

    Best-effort: skips a row rather than crashing the whole page when an
    expected cell is missing, since real-world government portal HTML is
    rarely perfectly uniform.
    """
    soup = BeautifulSoup(html, "html.parser")
    listings = []

    for row in soup.select(SELECTORS["row"]):
        link = row.select_one(SELECTORS["title_link"])
        if link is None or not link.get_text(strip=True):
            continue
        title = link.get_text(strip=True)
        href = link.get("href", "")
        url = href if href.startswith("http") else f"{base_url.rstrip('/')}/{href.lstrip('/')}"

        pe_cell = row.select_one(SELECTORS["procuring_entity"])
        procuring_entity = pe_cell.get_text(strip=True) if pe_cell else ""

        cat_cell = row.select_one(SELECTORS["category"])
        category = cat_cell.get_text(strip=True) if cat_cell else ""

        close_cell = row.select_one(SELECTORS["closing_date"])
        closing_at = _parse_datetime(close_cell.get_text(strip=True)) if close_cell else None

        tno_cell = row.select_one(SELECTORS["tender_no"])
        external_id = tno_cell.get_text(strip=True) if tno_cell else None
        if not external_id:
            match = _TENDER_NO_RE.search(f"{title} {href}")
            external_id = match.group(0) if match else None

        listings.append(TenderListing(
            source=SOURCE_NAME,
            url=url,
            title=title,
            procuring_entity=procuring_entity,
            external_id=external_id,
            category=category,
            country="Kenya",
            closing_at=closing_at,
            raw_summary=row.get_text(" ", strip=True)[:500],
        ))
    return listings


def fetch(session=None, listing_url=LISTING_URL):
    """Live fetch + parse. Not exercised in this build -- see module
    docstring."""
    response = polite_fetch(listing_url, session=session)
    return parse_listing_page(response.text, base_url=BASE_URL)
