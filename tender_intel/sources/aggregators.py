"""Generic, config-driven scraper for third-party tender-aggregator sites.

Rather than one bespoke module per aggregator, each site is described as a
small selector config in AGGREGATOR_SITES below and run through the same
generic parser. Adding a new aggregator is then usually just adding a
config entry, not writing new parsing code.

None of the selectors below have been checked against the live sites from
this build environment (no outbound network access here) -- they are
plausible guesses at typical WordPress/listing-theme markup. Aggregator
sites tend to change markup/theme more often than government portals, so
re-verify each against the current DOM before enabling it (flip
"enabled": True) for real. See tender_intel/README.md, "Live scraping".
"""
import datetime

from bs4 import BeautifulSoup

from tender_intel.sources.base import TenderListing, polite_fetch

# Illustrative list of Kenyan tender aggregator/listing sites relevant to
# ICT/security/AV/solar procurement. All disabled by default until someone
# has verified the selectors against the live DOM.
AGGREGATOR_SITES = [
    {
        "name": "tenderskenya",
        "source": "tenderskenya_co_ke",
        "base_url": "https://tenderskenya.co.ke",
        "listing_url": "https://tenderskenya.co.ke/tenders/",
        "enabled": False,  # verify selectors against live site, then flip on
        "row_selector": "article.tender, div.tender-item",
        "title_selector": "h2 a, h3 a",
        "entity_selector": ".procuring-entity, .entity",
        "date_selector": ".closing-date, time",
    },
    {
        "name": "tendersunlimited",
        "source": "tendersunlimited_com",
        "base_url": "https://www.tendersunlimited.com",
        "listing_url": "https://www.tendersunlimited.com/tenders",
        "enabled": False,
        "row_selector": "div.tender-listing-item, tr.tender-row",
        "title_selector": "a.tender-link, td.title a",
        "entity_selector": "td.entity, .entity-name",
        "date_selector": "td.deadline, .deadline",
    },
    {
        "name": "kenyatenders",
        "source": "kenyatenders_com",
        "base_url": "https://kenyatenders.com",
        "listing_url": "https://kenyatenders.com/tenders",
        "enabled": False,
        "row_selector": "tr.tender, div.tender-card",
        "title_selector": "a",
        "entity_selector": ".entity, td.organisation",
        "date_selector": ".closes, td.closing",
    },
]


def _parse_datetime(text):
    text = (text or "").strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d %B %Y", "%d-%m-%Y", "%Y-%m-%d %H:%M"):
        try:
            return datetime.datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def parse_listing_page(html, site_config):
    """Parse a listing page for one aggregator site, using its
    `site_config` (see AGGREGATOR_SITES for the shape)."""
    soup = BeautifulSoup(html, "html.parser")
    listings = []
    base_url = site_config["base_url"]

    for row in soup.select(site_config["row_selector"]):
        link = row.select_one(site_config["title_selector"])
        if link is None or not link.get_text(strip=True):
            continue
        title = link.get_text(strip=True)
        href = link.get("href", "")
        url = href if href.startswith("http") else f"{base_url.rstrip('/')}/{href.lstrip('/')}"

        entity_el = row.select_one(site_config["entity_selector"])
        procuring_entity = entity_el.get_text(strip=True) if entity_el else ""

        date_el = row.select_one(site_config["date_selector"])
        closing_at = _parse_datetime(date_el.get_text(strip=True)) if date_el else None

        listings.append(TenderListing(
            source=site_config["source"],
            url=url,
            title=title,
            procuring_entity=procuring_entity,
            country="Kenya",
            closing_at=closing_at,
            raw_summary=row.get_text(" ", strip=True)[:500],
        ))
    return listings


def fetch_site(site_config, session=None):
    response = polite_fetch(site_config["listing_url"], session=session)
    return parse_listing_page(response.text, site_config)


def fetch_all(session=None, sites=None):
    """Fetch every *enabled* aggregator site (see AGGREGATOR_SITES) -- all
    are disabled by default until their selectors are verified against the
    live DOM."""
    sites = AGGREGATOR_SITES if sites is None else sites
    results = []
    for site in sites:
        if not site.get("enabled"):
            continue
        results.extend(fetch_site(site, session=session))
    return results
