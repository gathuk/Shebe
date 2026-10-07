"""Keyword/taxonomy-based relevance scorer for ICT/licensing-relevant
tenders.

Deliberately simple (substring keyword matching, not ML) -- transparent,
fast, and good enough to triage a stream of tender titles/summaries into
"worth a human look" vs "not our line of business". It is not a precision
instrument: false positives/negatives should be expected and are cheap to
correct with a quick human skim of the dashboard.
"""
import re

from tender_intel.config import CATEGORY_KEYWORDS, GENERIC_ICT_TERMS


def _normalize(text):
    return re.sub(r"\s+", " ", (text or "").lower())


def classify_relevance(text):
    """Score free text (a tender title + summary, or extracted requirement
    text) for ICT/licensing/Skystar-catalog relevance.

    Returns {"score": int, "matched_terms": [...], "matched_categories": [...]}.
    Score is simply the count of distinct matched terms/phrases --
    deliberately unweighted so it stays easy to reason about and tune by eye.
    """
    normalized = _normalize(text)
    matched_terms = set()
    matched_categories = set()

    for category, keywords in CATEGORY_KEYWORDS.items():
        for kw in keywords:
            if kw.lower() in normalized:
                matched_terms.add(kw)
                matched_categories.add(category)

    for kw in GENERIC_ICT_TERMS:
        if kw.lower() in normalized:
            matched_terms.add(kw)

    return {
        "score": len(matched_terms),
        "matched_terms": sorted(matched_terms),
        "matched_categories": sorted(matched_categories),
    }


def best_category(text):
    """Return the single product-line category with the most keyword hits
    in `text`, or None if nothing matched."""
    normalized = _normalize(text)
    counts = {}
    for category, keywords in CATEGORY_KEYWORDS.items():
        count = sum(1 for kw in keywords if kw.lower() in normalized)
        if count:
            counts[category] = count
    if not counts:
        return None
    return max(counts, key=counts.get)
