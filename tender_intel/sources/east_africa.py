"""Connectors for the other East African Community national procurement
portals Skystar's ICT/security/AV/solar business could plausibly bid into:

  - Uganda: PPDA (Public Procurement and Disposal of Public Assets Authority)
  - Tanzania: PPRA / TANeGP (Tanzania National e-Government Procurement System)
  - Rwanda: RPPA / Umucyo e-procurement portal

Each country gets its own parse function (parse_uganda_ppda,
parse_tanzania_tanegp, parse_rwanda_umucyo) since the three portals have
unrelated markup, but they share the same fetch-then-parse shape as the
other connectors in this package.

IMPORTANT: none of these have been verified against the live sites from
this build environment (no outbound network access here) -- selectors are
reconstructed best guesses at typical listing-table shapes. Re-verify
against each live DOM before production use; see tender_intel/README.md,
"Live scraping".
"""
import datetime

from bs4 import BeautifulSoup

from tender_intel.sources.base import TenderListing, polite_fetch


def _parse_datetime(text, formats):
    text = (text or "").strip()
    if not text:
        return None
    for fmt in formats:
        try:
            return datetime.datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


# --- Uganda: PPDA -----------------------------------------------------

UGANDA_SOURCE = "uganda_ppda"
UGANDA_BASE_URL = "https://www.ppda.go.ug"
UGANDA_LISTING_URL = f"{UGANDA_BASE_URL}/bid-notices"

UGANDA_SELECTORS = {
    "row": "table.bid-notices tbody tr, div.bid-notice-item",
    "title_link": "td.title a, a.bid-notice-link",
    "procuring_entity": "td.entity, .procuring-and-disposing-entity",
    "closing_date": "td.closing-date, .submission-deadline",
}


def parse_uganda_ppda(html, base_url=UGANDA_BASE_URL):
    soup = BeautifulSoup(html, "html.parser")
    listings = []
    for row in soup.select(UGANDA_SELECTORS["row"]):
        link = row.select_one(UGANDA_SELECTORS["title_link"])
        if link is None or not link.get_text(strip=True):
            continue
        title = link.get_text(strip=True)
        href = link.get("href", "")
        url = href if href.startswith("http") else f"{base_url.rstrip('/')}/{href.lstrip('/')}"

        pe_cell = row.select_one(UGANDA_SELECTORS["procuring_entity"])
        procuring_entity = pe_cell.get_text(strip=True) if pe_cell else ""

        close_cell = row.select_one(UGANDA_SELECTORS["closing_date"])
        closing_at = (
            _parse_datetime(close_cell.get_text(strip=True), ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"))
            if close_cell else None
        )

        listings.append(TenderListing(
            source=UGANDA_SOURCE, url=url, title=title,
            procuring_entity=procuring_entity, country="Uganda",
            closing_at=closing_at, raw_summary=row.get_text(" ", strip=True)[:500],
        ))
    return listings


def fetch_uganda(session=None, listing_url=UGANDA_LISTING_URL):
    response = polite_fetch(listing_url, session=session)
    return parse_uganda_ppda(response.text, base_url=UGANDA_BASE_URL)


# --- Tanzania: PPRA / TANeGP -------------------------------------------

TANZANIA_SOURCE = "tanzania_tanegp"
TANZANIA_BASE_URL = "https://tanepsportal.gov.go.tz"
TANZANIA_LISTING_URL = f"{TANZANIA_BASE_URL}/tenders"

TANZANIA_SELECTORS = {
    "row": "table.tender-list tbody tr, div.tender-notice",
    "title_link": "td.tender-title a, a.notice-title",
    "procuring_entity": "td.pe, .procuring-entity-name",
    "closing_date": "td.deadline, .closing-date-time",
}


def parse_tanzania_tanegp(html, base_url=TANZANIA_BASE_URL):
    soup = BeautifulSoup(html, "html.parser")
    listings = []
    for row in soup.select(TANZANIA_SELECTORS["row"]):
        link = row.select_one(TANZANIA_SELECTORS["title_link"])
        if link is None or not link.get_text(strip=True):
            continue
        title = link.get_text(strip=True)
        href = link.get("href", "")
        url = href if href.startswith("http") else f"{base_url.rstrip('/')}/{href.lstrip('/')}"

        pe_cell = row.select_one(TANZANIA_SELECTORS["procuring_entity"])
        procuring_entity = pe_cell.get_text(strip=True) if pe_cell else ""

        close_cell = row.select_one(TANZANIA_SELECTORS["closing_date"])
        closing_at = (
            _parse_datetime(close_cell.get_text(strip=True), ("%d-%m-%Y %H:%M", "%Y-%m-%d", "%d/%m/%Y"))
            if close_cell else None
        )

        listings.append(TenderListing(
            source=TANZANIA_SOURCE, url=url, title=title,
            procuring_entity=procuring_entity, country="Tanzania",
            closing_at=closing_at, raw_summary=row.get_text(" ", strip=True)[:500],
        ))
    return listings


def fetch_tanzania(session=None, listing_url=TANZANIA_LISTING_URL):
    response = polite_fetch(listing_url, session=session)
    return parse_tanzania_tanegp(response.text, base_url=TANZANIA_BASE_URL)


# --- Rwanda: RPPA / Umucyo ----------------------------------------------

RWANDA_SOURCE = "rwanda_umucyo"
RWANDA_BASE_URL = "https://umucyo.gov.rw"
RWANDA_LISTING_URL = f"{RWANDA_BASE_URL}/tenders"

RWANDA_SELECTORS = {
    "row": "table.tenders-table tbody tr, div.tender-row",
    "title_link": "td.title a, a.tender-name",
    "procuring_entity": "td.agency, .procuring-agency",
    "closing_date": "td.deadline, .submission-deadline",
}


def parse_rwanda_umucyo(html, base_url=RWANDA_BASE_URL):
    soup = BeautifulSoup(html, "html.parser")
    listings = []
    for row in soup.select(RWANDA_SELECTORS["row"]):
        link = row.select_one(RWANDA_SELECTORS["title_link"])
        if link is None or not link.get_text(strip=True):
            continue
        title = link.get_text(strip=True)
        href = link.get("href", "")
        url = href if href.startswith("http") else f"{base_url.rstrip('/')}/{href.lstrip('/')}"

        pe_cell = row.select_one(RWANDA_SELECTORS["procuring_entity"])
        procuring_entity = pe_cell.get_text(strip=True) if pe_cell else ""

        close_cell = row.select_one(RWANDA_SELECTORS["closing_date"])
        closing_at = (
            _parse_datetime(close_cell.get_text(strip=True), ("%d/%m/%Y", "%Y-%m-%d"))
            if close_cell else None
        )

        listings.append(TenderListing(
            source=RWANDA_SOURCE, url=url, title=title,
            procuring_entity=procuring_entity, country="Rwanda",
            closing_at=closing_at, raw_summary=row.get_text(" ", strip=True)[:500],
        ))
    return listings


def fetch_rwanda(session=None, listing_url=RWANDA_LISTING_URL):
    response = polite_fetch(listing_url, session=session)
    return parse_rwanda_umucyo(response.text, base_url=RWANDA_BASE_URL)


def fetch_all(session=None):
    """Fetch all three East African country connectors. Any one failing
    (e.g. network unreachable) propagates -- callers (ingest.py) wrap each
    registered source individually so one bad country doesn't take down the
    others when this is registered per-country instead of as one combined
    fetcher."""
    listings = []
    listings.extend(fetch_uganda(session=session))
    listings.extend(fetch_tanzania(session=session))
    listings.extend(fetch_rwanda(session=session))
    return listings
