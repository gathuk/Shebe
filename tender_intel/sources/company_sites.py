"""Config-driven watcher for named companies' own "tenders / procurement"
pages -- large corporates and utilities often publish supplier tenders
directly on their own site rather than (or in addition to) a government
portal.

Site list lives in tender_intel/config/company_sources.yaml, which ships
with a handful of well-known large Kenyan ICT-relevant procurers as
*illustrative examples only* (Safaricom, Kenya Power, KRA). Their listing
URLs and selectors have not been verified against the live sites from this
build environment -- confirm/update them before enabling (flip
`enabled: true`) any entry. See tender_intel/README.md, "Live scraping".
"""
import datetime
import os

import yaml
from bs4 import BeautifulSoup

from tender_intel.sources.base import TenderListing, polite_fetch

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "company_sources.yaml")


def load_company_sources(path=CONFIG_PATH):
    """Load the list of company site configs from YAML. Returns [] if the
    file is missing rather than raising, so a fresh checkout without the
    config still runs (just watches nothing)."""
    if not os.path.isfile(path):
        return []
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    return data.get("companies", [])


def _parse_datetime(text):
    text = (text or "").strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d %B %Y", "%d-%m-%Y"):
        try:
            return datetime.datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def parse_listing_page(html, site_config):
    """Parse one company's tender/procurement listing page, using its
    `site_config` (see config/company_sources.yaml for the shape)."""
    soup = BeautifulSoup(html, "html.parser")
    listings = []
    base_url = site_config["base_url"]
    source = f"company:{site_config['name']}"

    for row in soup.select(site_config["row_selector"]):
        link = row.select_one(site_config["title_selector"])
        if link is None or not link.get_text(strip=True):
            continue
        title = link.get_text(strip=True)
        href = link.get("href", "")
        url = href if href.startswith("http") else f"{base_url.rstrip('/')}/{href.lstrip('/')}"

        date_selector = site_config.get("date_selector")
        closing_at = None
        if date_selector:
            date_el = row.select_one(date_selector)
            if date_el:
                closing_at = _parse_datetime(date_el.get_text(strip=True))

        listings.append(TenderListing(
            source=source,
            url=url,
            title=title,
            procuring_entity=site_config.get("display_name", site_config["name"]),
            country=site_config.get("country", "Kenya"),
            closing_at=closing_at,
            raw_summary=row.get_text(" ", strip=True)[:500],
        ))
    return listings


def fetch_site(site_config, session=None):
    response = polite_fetch(site_config["listing_url"], session=session)
    return parse_listing_page(response.text, site_config)


def fetch_all(session=None, sites=None):
    """Fetch every *enabled* company site from config/company_sources.yaml
    (or an injected `sites` list, for tests). All ship disabled by default
    until the URL/selectors have been confirmed against the live site."""
    sites = load_company_sources() if sites is None else sites
    results = []
    for site in sites:
        if not site.get("enabled"):
            continue
        results.extend(fetch_site(site, session=session))
    return results
