import os

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from tender_intel.analysis import extract

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")


def _load_fixture_text():
    with open(os.path.join(FIXTURES_DIR, "sample_tender_document.txt"), encoding="utf-8") as f:
        return f.read()


def test_parse_tender_text_extracts_core_fields():
    result = extract.parse_tender_text(_load_fixture_text())

    assert result.tender_number == "KRA/ICT/2026-2027/00123"
    assert "Kenya Revenue Authority" in result.procuring_entity
    assert result.category
    assert result.closing_date_text
    assert result.tender_fee
    assert result.bid_bond


def test_parse_tender_text_finds_mandatory_documents():
    result = extract.parse_tender_text(_load_fixture_text())

    assert "certificate of incorporation" in result.mandatory_documents
    assert "cr12" in result.mandatory_documents
    assert "kra pin" in result.mandatory_documents
    assert "tax compliance certificate" in result.mandatory_documents
    assert "audited accounts" in result.mandatory_documents


def test_parse_tender_text_finds_requirement_lines():
    result = extract.parse_tender_text(_load_fixture_text())

    joined = " ".join(result.requirement_lines).lower()
    assert len(result.requirement_lines) >= 3
    assert "firewall" in joined
    assert "biometric fingerprint access control" in joined


def test_parse_tender_text_handles_empty_input():
    result = extract.parse_tender_text("")
    assert result.title is None
    assert result.requirement_lines == []
    assert result.mandatory_documents == []


def test_extract_text_from_pdf_and_parse(tmp_path):
    pdf_path = tmp_path / "sample.pdf"
    c = canvas.Canvas(str(pdf_path), pagesize=A4)
    c.drawString(50, 800, "Tender No: KRA/ICT/2026-2027/00123")
    c.drawString(50, 780, "Procuring Entity: Kenya Revenue Authority")
    c.drawString(50, 760, "1. Supply and installation of next-generation firewalls")
    c.save()

    text = extract.extract_text_from_pdf(str(pdf_path))
    assert "KRA/ICT/2026-2027/00123" in text
    assert "Kenya Revenue Authority" in text

    result = extract.parse_tender_text(text)
    assert result.tender_number == "KRA/ICT/2026-2027/00123"
    assert "firewalls" in " ".join(result.requirement_lines).lower()


def test_parse_tender_pdf_convenience_wrapper(tmp_path):
    pdf_path = tmp_path / "sample2.pdf"
    c = canvas.Canvas(str(pdf_path), pagesize=A4)
    c.drawString(50, 800, "Procuring Entity: Ministry of ICT")
    c.save()

    result = extract.parse_tender_pdf(str(pdf_path), title_hint="Sample Tender")
    assert result.title == "Sample Tender"
    assert "Ministry of ICT" in result.procuring_entity
