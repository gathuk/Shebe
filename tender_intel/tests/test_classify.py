from tender_intel.analysis.classify import best_category, classify_relevance


def test_classify_relevance_matches_fortinet_firewall():
    result = classify_relevance(
        "Supply, Installation and Configuration of Fortinet FortiGate Next-Gen Firewalls"
    )
    assert result["score"] > 0
    assert "networking_cybersecurity" in result["matched_categories"]


def test_classify_relevance_matches_solar():
    result = classify_relevance(
        "Design and installation of a solar water pump and Victron inverter backup system"
    )
    assert "power_solar" in result["matched_categories"]


def test_classify_relevance_matches_security_systems():
    result = classify_relevance(
        "Supply and installation of CCTV cameras and Hikvision biometric access control terminals"
    )
    assert "security_systems" in result["matched_categories"]


def test_classify_relevance_zero_for_unrelated_text():
    result = classify_relevance("Supply of office stationery and cleaning services")
    assert result["score"] == 0
    assert result["matched_categories"] == []


def test_classify_relevance_generic_ict_terms_count_even_without_category():
    result = classify_relevance("Provision of managed ICT helpdesk support services")
    assert result["score"] > 0


def test_best_category_picks_highest_hit_count():
    text = "CCTV cameras, access control, biometric fingerprint readers and video surveillance system"
    assert best_category(text) == "security_systems"


def test_best_category_returns_none_for_unrelated_text():
    assert best_category("Supply of fresh produce to the staff canteen") is None
