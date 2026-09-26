"""Connector for mygov.go.ke's tender listings -- the Kenyan government's
public services portal, which mirrors/links a subset of active tenders
alongside its other citizen-facing content.

IMPORTANT: not verified against the live site from this build environment
(no outbound network access here) -- selectors below are a reconstructed
approximation. Re-verify against the live DOM before production use; see
tender_intel/README.md, "Live scraping".
"""
import datetime

from bs4 import BeautifulSoup

from tender_intel.sources.base import TenderListing, polite_fetch

SOURCE_NAME = "mygov"
BASE_URL = "https://www.mygov.go.ke"
LISTING_URL = f"{BASE_URL}/tenders"

# Verify against the live site before depending on this in production.
SELECTORS = {
    "row": "div.view-tenders .views-row, table.tenders-table tbody tr",
    "title_link": "h3 a, td.title a",
    "procuring_entity": ".field-name-field-procuring-entity, td.entity",
    "closing_date": ".field-name-field-closing-date, td.closing-date",
}


def _parse_datetime(text):
    text = (text or "").strip()
    if not text:
        return None
    for fmt in ("%d %B %Y", "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def parse_listing_page(html, base_url=BASE_URL):
    """Parse a mygov.go.ke tender-listing page into normalized
    TenderListing rows. mygov.go.ke doesn't consistently expose a tender
    reference number in the listing view, so `external_id` is usually left
    None here -- dedupe then falls back to the URL (see sources/ingest.py)."""
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

        close_cell = row.select_one(SELECTORS["closing_date"])
        closing_at = _parse_datetime(close_cell.get_text(strip=True)) if close_cell else None

        listings.append(TenderListing(
            source=SOURCE_NAME,
            url=url,
            title=title,
            procuring_entity=procuring_entity,
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
