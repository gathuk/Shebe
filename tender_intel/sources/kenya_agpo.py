"""Connector for Kenya's Public Procurement Regulatory Authority (PPRA) /
AGPO (Access to Government Procurement Opportunities) tender listings,
ppra.go.ke.

IMPORTANT: not verified against the live site from this build environment
(no outbound network access here) -- selectors below are a reconstructed
approximation of a typical listing-table shape. Re-verify against the live
DOM before production use; see tender_intel/README.md, "Live scraping".
"""
import datetime

from bs4 import BeautifulSoup

from tender_intel.sources.base import TenderListing, polite_fetch

SOURCE_NAME = "kenya_agpo"
BASE_URL = "https://tenders.ppra.go.ke"
LISTING_URL = f"{BASE_URL}/tenders/agpo"

# Verify against the live site before depending on this in production.
SELECTORS = {
    "row": "table.agpo-tenders tbody tr, div.agpo-tender-item",
    "title_link": "a.tender-link, td.tender-title a",
    "procuring_entity": "td.entity, .procuring-entity",
    "category": "td.category, .agpo-category",
    "closing_date": "td.closing, .closing-date",
    "tender_no": "td.reference, .tender-reference",
}


def _parse_datetime(text):
    text = (text or "").strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%d %H:%M", "%d/%m/%Y %H:%M", "%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def parse_listing_page(html, base_url=BASE_URL):
    """Parse a PPRA/AGPO tender-listing page into normalized TenderListing
    rows. AGPO tenders are reserved for youth/women/PWD-owned enterprises --
    `category` typically carries that AGPO set-aside designation as well as
    the goods/services category, so both are kept in the free-text field."""
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

        ref_cell = row.select_one(SELECTORS["tender_no"])
        external_id = ref_cell.get_text(strip=True) if ref_cell else None

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
