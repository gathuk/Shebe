from tender_intel.boq.engine import build_boq, landed_cost
from tender_intel.config import CONTINGENCY_RATE, VAT_RATE

CATALOG = [
    {
        "key": "fortinet_fortigate_1800f",
        "name": "Fortinet FortiGate 1800F Series Next-Gen Firewall",
        "vendor": "Fortinet",
        "category": "networking_cybersecurity",
        "unit_price": 1_500_000.0,
        "import_landed_cost": {
            "enabled": True, "duty_rate": 0.25, "idf_rate": 0.02, "rdl_rate": 0.02, "vat_rate": 0.16,
        },
    },
    {
        "key": "zebra_tc26",
        "name": "Zebra TC26 Rugged Mobile Computer",
        "vendor": "Zebra",
        "category": "data_capture",
        "unit_price": None,
        "import_landed_cost": {"enabled": False},
    },
]


def test_build_boq_prices_matched_items_and_flags_unpriced():
    requirements = [
        {"description": "Fortinet FortiGate 1800F Series Next-Gen Firewall", "quantity": 2, "unit": "unit"},
        {"description": "Zebra TC26 Rugged Mobile Computer", "quantity": 5, "unit": "unit"},
        {"description": "Completely unrelated widget with no catalog match at all", "quantity": 1, "unit": "unit"},
    ]
    result = build_boq(requirements, CATALOG)

    assert result.lines[0].matched is True
    assert result.lines[0].price_available is True
    assert result.lines[0].line_total == 3_000_000.0

    assert result.lines[1].matched is True
    assert result.lines[1].price_available is False
    assert result.lines[1].line_total is None
    assert "unit_price is TODO" in result.lines[1].notes

    assert result.lines[2].matched is False
    assert "No confident catalog match" in result.lines[2].notes

    assert result.unpriced_line_count == 2
    assert result.fully_priced is False


def test_build_boq_totals_apply_contingency_and_vat():
    requirements = [
        {"description": "Fortinet FortiGate 1800F Series Next-Gen Firewall", "quantity": 1, "unit": "unit"},
    ]
    result = build_boq(requirements, CATALOG)

    assert result.subtotal == 1_500_000.0
    expected_contingency = round(1_500_000.0 * CONTINGENCY_RATE, 2)
    assert result.contingency_amount == expected_contingency
    expected_vat = round((1_500_000.0 + expected_contingency) * VAT_RATE, 2)
    assert result.vat_amount == expected_vat
    assert result.grand_total == round(1_500_000.0 + expected_contingency + expected_vat, 2)


def test_build_boq_fully_priced_when_all_matched_and_priced():
    requirements = [
        {"description": "Fortinet FortiGate 1800F Series Next-Gen Firewall", "quantity": 1, "unit": "unit"},
    ]
    result = build_boq(requirements, CATALOG)
    assert result.fully_priced is True
    assert result.unpriced_line_count == 0


def test_build_boq_unpriced_lines_excluded_from_subtotal():
    requirements = [
        {"description": "Zebra TC26 Rugged Mobile Computer", "quantity": 10, "unit": "unit"},
    ]
    result = build_boq(requirements, CATALOG)
    # An unpriced line must never be silently treated as 0-cost-but-counted;
    # subtotal stays 0 and the line is flagged, not folded into totals.
    assert result.subtotal == 0.0
    assert result.grand_total == 0.0
    assert result.unpriced_line_count == 1


def test_landed_cost_disabled_by_default_returns_none():
    item = CATALOG[1]
    assert landed_cost(1000.0, item) is None


def test_landed_cost_none_when_unit_price_missing():
    item = CATALOG[0]
    assert landed_cost(None, item) is None


def test_landed_cost_computes_duty_idf_rdl_vat_when_enabled():
    item = CATALOG[0]
    result = landed_cost(1_500_000.0, item, quantity=1)

    assert result["import_duty"] == 375_000.0
    assert result["idf"] == 30_000.0
    assert result["rdl"] == 30_000.0
    vat_base = 1_500_000.0 + 375_000.0 + 30_000.0 + 30_000.0
    assert result["vat"] == round(vat_base * 0.16, 2)
    assert result["landed_cost"] == round(vat_base + result["vat"], 2)
