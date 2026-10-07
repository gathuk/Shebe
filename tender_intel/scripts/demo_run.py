#!/usr/bin/env python3
"""End-to-end scripted demo of the tender_intel pipeline.

Loads the synthetic fixture tender document (tests/fixtures/
sample_tender_document.txt -- not a real client document), runs relevance
classification and requirement extraction, builds a BOQ against the
(mostly unpriced) product catalog, and calls the proposal builder to
produce an actual PDF.

This is a schema/plumbing demo, not a real pricing demo: since
catalog.yaml's unit_price fields are all TODO, most/all BOQ lines will come
out flagged as unpriced -- that's expected and correct behaviour (see
boq/engine.py), not a bug.

Run:
    python tender_intel/scripts/demo_run.py

Output:
    tender_intel/demo_output/skystar_demo_proposal.pdf
"""
import os
import sys

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from tender_intel.analysis import extract  # noqa: E402
from tender_intel.analysis.classify import classify_relevance  # noqa: E402
from tender_intel.boq.engine import build_boq  # noqa: E402
from tender_intel.catalog.loader import datasheet_status_for_items, load_catalog  # noqa: E402
from tender_intel.company import load_profile  # noqa: E402
from tender_intel.proposal.builder import build_proposal_pdf  # noqa: E402

FIXTURE_PATH = os.path.join(
    os.path.dirname(__file__), "..", "tests", "fixtures", "sample_tender_document.txt"
)
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "demo_output", "skystar_demo_proposal.pdf")


def main():
    print("=== Skystar Tender Intelligence -- end-to-end demo run ===\n")

    with open(FIXTURE_PATH, encoding="utf-8") as f:
        raw_text = f.read()
    print(f"Loaded synthetic fixture tender document ({len(raw_text)} chars) from:\n  {FIXTURE_PATH}\n")

    # 1. Relevance classification.
    relevance = classify_relevance(raw_text)
    print("Relevance classification:")
    print(f"  score: {relevance['score']}")
    print(f"  matched categories: {relevance['matched_categories']}")
    print(f"  matched terms: {relevance['matched_terms']}\n")

    # 2. Heuristic requirement extraction.
    extracted = extract.parse_tender_text(raw_text)
    print("Extracted fields (best-effort/approximate -- see analysis/extract.py docstring):")
    print(f"  tender_number: {extracted.tender_number}")
    print(f"  procuring_entity: {extracted.procuring_entity}")
    print(f"  category: {extracted.category}")
    print(f"  closing_date_text: {extracted.closing_date_text}")
    print(f"  tender_fee: {extracted.tender_fee}")
    print(f"  bid_bond: {extracted.bid_bond}")
    print(f"  mandatory_documents ({len(extracted.mandatory_documents)}): {extracted.mandatory_documents}")
    print(f"  requirement_lines ({len(extracted.requirement_lines)}):")
    for line in extracted.requirement_lines:
        print(f"    - {line}")
    print()

    # 3. Build a priced BOQ against the catalog.
    catalog = load_catalog()
    requirement_items = [{"description": line, "quantity": 1.0, "unit": "unit"} for line in extracted.requirement_lines]
    if not requirement_items:
        requirement_items = [{"description": extracted.title or "Tender requirement", "quantity": 1.0, "unit": "unit"}]

    boq_result = build_boq(requirement_items, catalog)
    print("BOQ result:")
    for line in boq_result.lines:
        priced = f"KES {line.line_total:,.2f}" if line.price_available else "UNPRICED"
        match = line.catalog_key or "no confident match"
        print(f"  [{match}] {line.description[:70]!r} -> {priced}")
    print(f"  subtotal: KES {boq_result.subtotal:,.2f}")
    print(f"  contingency ({boq_result.contingency_rate * 100:.0f}%): KES {boq_result.contingency_amount:,.2f}")
    print(f"  VAT ({boq_result.vat_rate * 100:.0f}%): KES {boq_result.vat_amount:,.2f}")
    print(f"  grand_total: KES {boq_result.grand_total:,.2f}")
    print(f"  unpriced_line_count: {boq_result.unpriced_line_count} "
          f"(expected: catalog.yaml unit_price fields are all TODO in this build)\n")

    # 4. Assemble the proposal PDF.
    matched_keys = {line.catalog_key for line in boq_result.lines if line.catalog_key}
    matched_catalog_items = [item for item in catalog if item["key"] in matched_keys]
    datasheet_status = datasheet_status_for_items(matched_catalog_items)

    company = load_profile()
    tender = {
        "title": extracted.title or "Supply, Installation and Commissioning of Network Security and Access Control Equipment",
        "procuring_entity": extracted.procuring_entity,
        "tender_number": extracted.tender_number,
    }

    output_path = os.path.abspath(OUTPUT_PATH)
    build_proposal_pdf(
        output_path, tender, extracted.requirement_lines, relevance, boq_result, company,
        datasheet_status=datasheet_status,
    )

    size_bytes = os.path.getsize(output_path)
    print(f"Wrote proposal PDF ({size_bytes:,} bytes) to:\n  {output_path}\n")
    print("Demo complete. Note this is a schema/plumbing demo, not a real pricing")
    print("demo: BOQ unit prices are TODO until Skystar's real cost sheet is loaded")
    print("into tender_intel/catalog/catalog.yaml. See tender_intel/README.md.")


if __name__ == "__main__":
    main()
