from tender_intel.catalog.matcher import match_all, match_requirement

CATALOG = [
    {
        "key": "fortinet_fortigate_1800f",
        "name": "Fortinet FortiGate 1800F Series Next-Gen Firewall",
        "vendor": "Fortinet",
        "category": "networking_cybersecurity",
    },
    {
        "key": "hikvision_ds_k1t804amf",
        "name": "Hikvision DS-K1T804AMF Fingerprint Access Control Terminal",
        "vendor": "Hikvision",
        "category": "security_systems",
    },
]


def test_match_requirement_finds_close_match():
    item, score = match_requirement("Fortinet FortiGate 1800F Series Next-Gen Firewall", CATALOG)
    assert item is not None
    assert item["key"] == "fortinet_fortigate_1800f"
    assert score >= 55


def test_match_requirement_returns_none_below_threshold():
    item, score = match_requirement("Office stationery and printing paper supply", CATALOG)
    assert item is None
    assert score < 55


def test_match_requirement_distinguishes_similar_but_different_items():
    item, _ = match_requirement("Hikvision DS-K1T804AMF Fingerprint Access Control Terminal", CATALOG)
    assert item["key"] == "hikvision_ds_k1t804amf"


def test_match_requirement_empty_description_returns_none():
    item, score = match_requirement("", CATALOG)
    assert item is None
    assert score == 0.0


def test_match_all_returns_one_result_per_description():
    descriptions = [
        "Fortinet FortiGate 1800F Series Next-Gen Firewall",
        "Provision of catering services for staff canteen",
    ]
    results = match_all(descriptions, CATALOG)

    assert len(results) == 2
    assert results[0][0] == descriptions[0]
    assert results[0][1]["key"] == "fortinet_fortigate_1800f"
    assert results[1][1] is None


def test_match_requirement_custom_threshold_widens_or_narrows_matches():
    # A stricter threshold rejects a partial-word match...
    item, _ = match_requirement("firewall equipment", CATALOG, threshold=90.0)
    assert item is None
    # ...but a looser threshold accepts the same partial match.
    item_loose, _ = match_requirement("firewall equipment", CATALOG, threshold=5.0)
    assert item_loose is not None
