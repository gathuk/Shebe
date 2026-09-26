"""Orchestrates all enabled tender sources: fetch, normalize, dedupe by
(source, external_id or URL), filter to ICT/licensing relevance, persist.

No network calls happen at import time; `run_ingest()` is what triggers
actual fetching, and even that is source-by-source with per-source error
isolation so one broken connector doesn't take down the whole run.
"""
import logging

from tender_intel.analysis.classify import classify_relevance
from tender_intel.config import RELEVANCE_MIN_SCORE
from tender_intel.models import Tender

logger = logging.getLogger(__name__)


def dedupe_listings(listings):
    """Drop duplicate TenderListing objects, keyed by
    (source, external_id or url). Keeps the first occurrence."""
    seen = set()
    deduped = []
    for listing in listings:
        key = (listing.source, listing.external_id or listing.url)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(listing)
    return deduped


def filter_relevant(listings, min_score=RELEVANCE_MIN_SCORE):
    """Score each listing's title+summary for ICT/licensing relevance and
    keep only those clearing `min_score`. Returns a list of
    (listing, classify_result) tuples."""
    relevant = []
    for listing in listings:
        result = classify_relevance(f"{listing.title} {listing.raw_summary}")
        if result["score"] >= min_score:
            relevant.append((listing, result))
    return relevant


def persist_listings(session, scored_listings):
    """Insert new Tenders, update relevance fields on existing ones (matched
    by source + external_id, falling back to source + url). Returns
    (created_count, updated_count)."""
    created = 0
    updated = 0
    for listing, result in scored_listings:
        query = session.query(Tender).filter_by(source=listing.source)
        if listing.external_id:
            existing = query.filter_by(external_id=listing.external_id).first()
        else:
            existing = query.filter_by(url=listing.url).first()

        if existing is None:
            session.add(Tender(
                source=listing.source,
                external_id=listing.external_id,
                url=listing.url,
                title=listing.title,
                procuring_entity=listing.procuring_entity,
                category=listing.category,
                country=listing.country,
                closing_at=listing.closing_at,
                published_at=listing.published_at,
                tender_fee=listing.tender_fee,
                raw_summary=listing.raw_summary,
                relevance_score=result["score"],
                relevance_matched_terms=", ".join(result["matched_terms"]),
                status="new",
            ))
            created += 1
        else:
            existing.title = listing.title
            existing.procuring_entity = listing.procuring_entity or existing.procuring_entity
            existing.closing_at = listing.closing_at or existing.closing_at
            existing.relevance_score = result["score"]
            existing.relevance_matched_terms = ", ".join(result["matched_terms"])
            updated += 1
    session.flush()
    return created, updated


def _default_source_fetchers():
    """Registry of source fetch functions used by run_ingest() when no
    override is supplied. Imported lazily (inside the function, not at
    module load time) so a single connector's import error doesn't break
    importing this whole module."""
    from tender_intel.sources import aggregators, company_sites, east_africa, kenya_agpo, kenya_ppip, mygov
    return {
        "kenya_ppip": kenya_ppip.fetch,
        "kenya_agpo": kenya_agpo.fetch,
        "mygov": mygov.fetch,
        "aggregators": aggregators.fetch_all,
        "company_sites": company_sites.fetch_all,
        "east_africa": east_africa.fetch_all,
    }


def run_ingest(session, sources=None, min_score=RELEVANCE_MIN_SCORE):
    """Run every enabled source connector, normalize + dedupe + filter +
    persist. `sources` optionally overrides the fetcher registry -- tests
    inject fixture-backed fetchers here instead of hitting the network.

    Returns a summary dict: fetched/deduped/relevant/created/updated counts
    plus an `errors` dict of {source_name: error message} for any source
    that raised.
    """
    sources = _default_source_fetchers() if sources is None else sources
    all_listings = []
    errors = {}
    for name, fetch_fn in sources.items():
        try:
            all_listings.extend(fetch_fn())
        except Exception as exc:  # one bad source shouldn't kill the run
            logger.warning("Source %s failed: %s", name, exc)
            errors[name] = str(exc)

    deduped = dedupe_listings(all_listings)
    scored = filter_relevant(deduped, min_score=min_score)
    created, updated = persist_listings(session, scored)
    return {
        "fetched": len(all_listings),
        "deduped": len(deduped),
        "relevant": len(scored),
        "created": created,
        "updated": updated,
        "errors": errors,
    }
