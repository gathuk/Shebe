import os

from tender_intel.analysis.classify import classify_relevance
from tender_intel.models import Tender
from tender_intel.sources import aggregators, company_sites, east_africa, kenya_agpo, kenya_ppip, mygov
from tender_intel.sources.base import TenderListing
from tender_intel.sources.ingest import dedupe_listings, filter_relevant, persist_listings, run_ingest

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")


def _read_fixture(name):
    with open(os.path.join(FIXTURES_DIR, name), encoding="utf-8") as f:
        return f.read()


def _listing(**kwargs):
    defaults = dict(
        source="kenya_ppip", url="https://tenders.go.ke/tenders/1", title="Supply of Firewalls",
        procuring_entity="KRA", raw_summary="Supply of Fortinet firewalls",
    )
    defaults.update(kwargs)
    return TenderListing(**defaults)


# --- connector parse functions against fixture HTML ---------------------

def test_kenya_ppip_parse_listing_page():
    listings = kenya_ppip.parse_listing_page(_read_fixture("kenya_ppip_listing.html"))
    assert len(listings) == 3
    firewall = next(l for l in listings if "Firewall" in l.title)
    assert firewall.source == "kenya_ppip"
    assert firewall.external_id == "KRA/ICT/2026-2027/00123"
    assert firewall.procuring_entity == "Kenya Revenue Authority"
    assert firewall.url.startswith("http")
    assert firewall.closing_at is not None

    # Third row has no tender-no cell -- external_id is regex-recovered
    # from the title text instead of left blank.
    cctv = next(l for l in listings if "CCTV" in l.title)
    assert cctv.external_id == "KPS/SEC/2026-2027"


def test_kenya_agpo_parse_listing_page():
    listings = kenya_agpo.parse_listing_page(_read_fixture("kenya_agpo_listing.html"))
    assert len(listings) == 2
    solar = listings[0]
    assert solar.source == "kenya_agpo"
    assert solar.external_id == "CG/AGPO/2026/00011"
    assert "Solar" in solar.title
    assert solar.closing_at is not None


def test_mygov_parse_listing_page():
    listings = mygov.parse_listing_page(_read_fixture("mygov_listing.html"))
    assert len(listings) == 2
    immigration = listings[0]
    assert immigration.source == "mygov"
    assert "Network Security" in immigration.title
    assert immigration.procuring_entity == "State Department for Immigration"
    assert immigration.closing_at is not None
    # mygov listings typically lack a reference number in the listing view
    assert immigration.external_id is None


def test_aggregators_parse_listing_page():
    site_config = aggregators.AGGREGATOR_SITES[0]
    listings = aggregators.parse_listing_page(_read_fixture("aggregator_listing.html"), site_config)
    assert len(listings) == 2
    fortinet = next(l for l in listings if "Fortinet" in l.title)
    assert fortinet.source == site_config["source"]
    assert fortinet.procuring_entity == "Kenya Ports Authority"


def test_company_sites_parse_listing_page():
    site_config = {
        "name": "example_corp",
        "display_name": "Example Corp",
        "base_url": "https://example.co.ke",
        "listing_url": "https://example.co.ke/tenders",
        "row_selector": "div.tender-notice",
        "title_selector": "a",
        "date_selector": "span.closing-date",
    }
    listings = company_sites.parse_listing_page(_read_fixture("company_sources_listing.html"), site_config)
    assert len(listings) == 2
    servers = next(l for l in listings if "Servers" in l.title)
    assert servers.source == "company:example_corp"
    assert servers.procuring_entity == "Example Corp"


def test_company_sites_load_company_sources_returns_illustrative_examples():
    sources = company_sites.load_company_sources()
    names = {s["name"] for s in sources}
    assert {"safaricom", "kenya_power", "kra"}.issubset(names)
    # Ship disabled by default -- URLs/selectors are unverified.
    assert all(not s.get("enabled") for s in sources)


def test_east_africa_uganda_parse():
    listings = east_africa.parse_uganda_ppda(_read_fixture("east_africa_uganda_listing.html"))
    assert len(listings) == 2
    ups = next(l for l in listings if "UPS" in l.title)
    assert ups.source == "uganda_ppda"
    assert ups.country == "Uganda"
    assert ups.closing_at is not None


def test_east_africa_tanzania_parse():
    listings = east_africa.parse_tanzania_tanegp(_read_fixture("east_africa_tanzania_listing.html"))
    assert len(listings) == 2
    cctv = next(l for l in listings if "CCTV" in l.title)
    assert cctv.source == "tanzania_tanegp"
    assert cctv.country == "Tanzania"


def test_east_africa_rwanda_parse():
    listings = east_africa.parse_rwanda_umucyo(_read_fixture("east_africa_rwanda_listing.html"))
    assert len(listings) == 2
    firewalls = next(l for l in listings if "Firewalls" in l.title)
    assert firewalls.source == "rwanda_umucyo"
    assert firewalls.country == "Rwanda"


# --- dedupe / filter / persist / orchestration ---------------------------

def test_dedupe_listings_by_source_and_external_id():
    listings = [
        _listing(external_id="KRA/001"),
        _listing(external_id="KRA/001", title="duplicate with same ref"),
        _listing(external_id="KRA/002"),
    ]
    assert len(dedupe_listings(listings)) == 2


def test_dedupe_listings_falls_back_to_url_when_no_external_id():
    listings = [
        _listing(url="https://x/1"), _listing(url="https://x/1"), _listing(url="https://x/2"),
    ]
    assert len(dedupe_listings(listings)) == 2


def test_dedupe_listings_same_external_id_different_source_not_deduped():
    listings = [_listing(source="kenya_ppip", external_id="001"), _listing(source="mygov", external_id="001")]
    assert len(dedupe_listings(listings)) == 2


def test_filter_relevant_drops_irrelevant_listings():
    listings = [
        _listing(title="Supply of Fortinet firewalls", raw_summary="network security tender"),
        _listing(url="https://x/unrelated", title="Supply of office stationery", raw_summary="paper and pens"),
    ]
    scored = filter_relevant(listings, min_score=1)
    assert len(scored) == 1
    assert scored[0][0].title == "Supply of Fortinet firewalls"


def test_persist_listings_creates_and_updates(session):
    listing = _listing(external_id="KRA/001")
    scored = [(listing, classify_relevance(f"{listing.title} {listing.raw_summary}"))]

    created, updated = persist_listings(session, scored)
    assert created == 1
    assert updated == 0
    assert session.query(Tender).count() == 1

    created2, updated2 = persist_listings(session, scored)
    assert created2 == 0
    assert updated2 == 1
    assert session.query(Tender).count() == 1


def test_run_ingest_uses_injected_source_fetchers(session):
    def fake_source():
        return [_listing(external_id="KRA/999", title="Supply of Fortinet firewalls")]

    summary = run_ingest(session, sources={"fake": fake_source}, min_score=1)
    assert summary["fetched"] == 1
    assert summary["created"] == 1
    assert session.query(Tender).count() == 1


def test_run_ingest_isolates_a_broken_source(session):
    def broken_source():
        raise RuntimeError("network unreachable in this sandbox")

    def working_source():
        return [_listing(external_id="KRA/888")]

    summary = run_ingest(session, sources={"broken": broken_source, "ok": working_source}, min_score=1)
    assert "broken" in summary["errors"]
    assert summary["created"] == 1
