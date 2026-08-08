"""Builds a priced Bill of Quantities from requirement items matched
against the catalog. Missing/unpriced catalog matches are flagged
explicitly rather than silently priced as 0 -- a BOQ with unpriced lines is
not ready to submit, and this module makes that impossible to miss.
"""
from dataclasses import dataclass, field

from tender_intel.catalog.matcher import match_requirement
from tender_intel.config import CONTINGENCY_RATE, VAT_RATE


@dataclass
class BOQLine:
    description: str
    category: str = None
    quantity: float = 1.0
    unit: str = "unit"
    catalog_key: str = None
    matched: bool = False
    match_score: float = 0.0
    unit_price: float = None
    price_available: bool = False
    line_total: float = None
    notes: str = ""


@dataclass
class BOQResult:
    lines: list = field(default_factory=list)
    subtotal: float = 0.0
    contingency_rate: float = CONTINGENCY_RATE
    contingency_amount: float = 0.0
    vat_rate: float = VAT_RATE
    vat_amount: float = 0.0
    grand_total: float = 0.0
    unpriced_line_count: int = 0
    fully_priced: bool = False


def _get(req, key, default=None):
    if isinstance(req, dict):
        return req.get(key, default)
    return getattr(req, key, default)


def build_boq(requirement_items, catalog, match_threshold=55.0):
    """`requirement_items` -- iterable of dicts or objects with at least a
    `description` attribute/key (and optionally `quantity`, `unit`).
    `catalog` -- list of catalog dicts (see catalog/catalog.yaml).

    Note: subtotal/contingency/VAT/grand_total only ever sum *priced*
    lines. Unpriced lines are counted in `unpriced_line_count` and flagged
    on each BOQLine's `notes` -- they are never silently treated as 0.
    """
    lines = []
    subtotal = 0.0
    unpriced_count = 0

    for req in requirement_items:
        description = _get(req, "description")
        quantity = _get(req, "quantity") or 1.0
        unit = _get(req, "unit") or "unit"

        item, score = match_requirement(description, catalog, threshold=match_threshold)
        line = BOQLine(description=description, quantity=quantity, unit=unit)

        if item is not None:
            line.catalog_key = item["key"]
            line.category = item.get("category")
            line.matched = True
            line.match_score = score
            unit_price = item.get("unit_price")
            if unit_price is not None:
                line.unit_price = float(unit_price)
                line.price_available = True
                line.line_total = round(float(unit_price) * quantity, 2)
                subtotal += line.line_total
            else:
                line.price_available = False
                line.notes = "Matched to catalog but unit_price is TODO -- not yet in the cost sheet."
                unpriced_count += 1
        else:
            line.matched = False
            line.match_score = score
            line.notes = "No confident catalog match -- needs manual pricing / a new catalog entry."
            unpriced_count += 1

        lines.append(line)

    contingency_amount = round(subtotal * CONTINGENCY_RATE, 2)
    taxable = subtotal + contingency_amount
    vat_amount = round(taxable * VAT_RATE, 2)
    grand_total = round(taxable + vat_amount, 2)

    return BOQResult(
        lines=lines,
        subtotal=round(subtotal, 2),
        contingency_rate=CONTINGENCY_RATE,
        contingency_amount=contingency_amount,
        vat_rate=VAT_RATE,
        vat_amount=vat_amount,
        grand_total=grand_total,
        unpriced_line_count=unpriced_count,
        fully_priced=(unpriced_count == 0),
    )


def landed_cost(unit_price, catalog_item, quantity=1.0):
    """Optional Kenya import-duty landed-cost helper for one equipment BOQ
    line, using the catalog item's import_landed_cost config (import duty,
    IDF 2%, RDL 2%, VAT 16% by default). Returns None if that config is
    missing/disabled or unit_price is None -- this is an opt-in estimate,
    never applied to the BOQ total automatically."""
    cfg = (catalog_item or {}).get("import_landed_cost") or {}
    if not cfg.get("enabled") or unit_price is None:
        return None

    cost = float(unit_price) * quantity
    duty = cost * cfg.get("duty_rate", 0.0)
    idf = cost * cfg.get("idf_rate", 0.0)
    rdl = cost * cfg.get("rdl_rate", 0.0)
    vat_base = cost + duty + idf + rdl
    vat = vat_base * cfg.get("vat_rate", VAT_RATE)
    landed = vat_base + vat
    return {
        "cost": round(cost, 2),
        "import_duty": round(duty, 2),
        "idf": round(idf, 2),
        "rdl": round(rdl, 2),
        "vat": round(vat, 2),
        "landed_cost": round(landed, 2),
    }
