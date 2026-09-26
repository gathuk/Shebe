"""Shared building blocks for tender source connectors.

Each connector module (kenya_ppip.py, kenya_agpo.py, mygov.py,
aggregators.py, east_africa.py, company_sites.py) follows the same shape:

  - a pure `parse_listing_page(html, ...) -> list[TenderListing]` function,
    unit-tested against local HTML fixtures in tests/fixtures/ with no
    network I/O.
  - a `fetch(...) -> list[TenderListing]` function that does the actual
    HTTP GET (via `polite_fetch` below) and then calls the parse function.

`sources/ingest.py` calls `fetch()` on each enabled source. Tests only ever
call the `parse_*` functions against saved fixture HTML -- this build
environment has no outbound route to the real tender portals, so nothing in
sources/ has been exercised against a live site. Before relying on any
connector in production: (1) re-verify its selectors against the live DOM,
since page markup drifts over time, and (2) run it from a host with real
outbound network access. See tender_intel/README.md.
"""
import urllib.robotparser
from dataclasses import dataclass
from urllib.parse import urljoin, urlparse

import requests

USER_AGENT = (
    "SkystarTenderIntelBot/0.1 (+https://www.skystarholdings.co.ke; "
    "info@skystar.co.ke) tender-discovery prototype"
)
DEFAULT_TIMEOUT = 20


@dataclass
class TenderListing:
    """Normalized shape every connector converts its site-specific HTML
    into. `ingest.py` dedupes and persists lists of these."""

    source: str
    url: str
    title: str
    procuring_entity: str = ""
    external_id: str = None
    category: str = ""
    country: str = "Kenya"
    closing_at: object = None       # datetime.datetime or None
    published_at: object = None     # datetime.datetime or None
    tender_fee: str = None
    raw_summary: str = ""


class RobotsBlocked(RuntimeError):
    """Raised when robots.txt disallows fetching a URL."""


_robots_cache = {}


def _get_robot_parser(url):
    parsed = urlparse(url)
    root = f"{parsed.scheme}://{parsed.netloc}"
    if root not in _robots_cache:
        rp = urllib.robotparser.RobotFileParser()
        rp.set_url(urljoin(root, "/robots.txt"))
        try:
            rp.read()
        except Exception:
            # robots.txt unreachable/unparseable -- fail open (assume
            # allowed) rather than block a connector on a transient hiccup.
            rp.allow_all = True
        _robots_cache[root] = rp
    return _robots_cache[root]


def check_robots_allowed(url, user_agent=USER_AGENT):
    """Best-effort robots.txt check. Fails open (returns True) if robots.txt
    can't be fetched/parsed -- see _get_robot_parser."""
    try:
        rp = _get_robot_parser(url)
        return rp.can_fetch(user_agent, url)
    except Exception:
        return True


def polite_fetch(url, session=None, timeout=DEFAULT_TIMEOUT, user_agent=USER_AGENT):
    """GET `url` after checking robots.txt, identifying with a descriptive
    User-Agent. Raises RobotsBlocked if disallowed, or requests' own
    exceptions on network/HTTP errors -- ingest.py wraps each source's
    fetch() call in a try/except so one broken source doesn't stop the
    whole ingest run.
    """
    if not check_robots_allowed(url, user_agent):
        raise RobotsBlocked(f"robots.txt disallows fetching {url}")
    http = session or requests
    response = http.get(url, timeout=timeout, headers={"User-Agent": user_agent})
    response.raise_for_status()
    return response


class SourceBase:
    """Optional common interface. Connectors in this package are written as
    plain functions (module-level `parse_listing_page` / `fetch`) rather
    than subclassing this -- see kenya_ppip.py -- but this base class is
    kept for callers that prefer an object with a `.fetch()` method."""

    name = "base"

    def fetch(self, session=None):
        raise NotImplementedError
