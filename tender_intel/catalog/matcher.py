"""Fuzzy-matches free-text requirement line items against the product
catalog. Prefers rapidfuzz if it happens to be installed (faster, better
scoring); falls back to stdlib difflib so this package carries no hard new
dependency beyond what's already in requirements.txt.
"""
import difflib

try:
    from rapidfuzz import fuzz as _rapidfuzz_fuzz
    _HAVE_RAPIDFUZZ = True
except ImportError:
    _HAVE_RAPIDFUZZ = False


def _similarity(a, b):
    """Return a 0-100 similarity score between two strings."""
    a, b = (a or "").lower().strip(), (b or "").lower().strip()
    if not a or not b:
        return 0.0
    if _HAVE_RAPIDFUZZ:
        return _rapidfuzz_fuzz.token_set_ratio(a, b)
    return difflib.SequenceMatcher(None, a, b).ratio() * 100


def _fields_to_check(item):
    """Individual short strings to score a description against, rather than
    one long concatenation of every catalog field -- concatenating
    name+vendor+category+key into a single haystack dilutes difflib's
    character-overlap ratio for long descriptions, giving worse matches."""
    name = item.get("name", "")
    if name:
        yield name
    key_words = item.get("key", "").replace("_", " ")
    if key_words:
        yield key_words
    vendor = item.get("vendor", "")
    if vendor and name:
        yield f"{vendor} {name}"


def match_requirement(description, catalog, threshold=55.0):
    """Return (best_matching_catalog_item_or_None, best_score) for
    `description` against `catalog`. Returns (None, best_score) if nothing
    clears `threshold` -- best_score is still returned so callers can log/
    display "closest miss" information."""
    best_item = None
    best_score = 0.0
    for item in catalog:
        for field_text in _fields_to_check(item):
            score = _similarity(description, field_text)
            if score > best_score:
                best_score = score
                best_item = item

    if best_item is not None and best_score >= threshold:
        return best_item, best_score
    return None, best_score


def match_all(descriptions, catalog, threshold=55.0):
    """Match a list of requirement descriptions; returns a list of
    (description, matched_item_or_None, score) tuples."""
    return [
        (desc,) + match_requirement(desc, catalog, threshold=threshold)
        for desc in descriptions
    ]
