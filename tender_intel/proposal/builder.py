"""Assembles the final proposal PDF: cover letter, company profile,
technical response narrative, priced BOQ table, and an appendix section
listing which datasheets/statutory documents are attached vs missing.

Uses reportlab to build the core document, then -- if any local statutory/
datasheet PDFs are actually present on disk -- merges them on with pypdf
into one final submission-ready file. Missing attachments never crash the
build; they show up as an appendix line "Not yet supplied" instead.
"""
import datetime
import os

from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from tender_intel.company.documents import find_statutory_documents

_STYLES = getSampleStyleSheet()
_TITLE = ParagraphStyle("SkystarTitle", parent=_STYLES["Title"], fontSize=18, spaceAfter=6)
_H2 = ParagraphStyle("SkystarH2", parent=_STYLES["Heading2"], spaceBefore=14, spaceAfter=6)
_BODY = ParagraphStyle("SkystarBody", parent=_STYLES["BodyText"], spaceAfter=6, leading=14)
_SMALL = ParagraphStyle("SkystarSmall", parent=_STYLES["BodyText"], fontSize=8, textColor=colors.grey)


def _cover_letter_story(company, tender):
    today = datetime.date.today().strftime("%d %B %Y")
    story = [
        Paragraph(company["legal_name"], _TITLE),
        Paragraph(
            f"{company.get('website', '')} | {company.get('email', '')} | {company.get('phone', '')}",
            _SMALL,
        ),
        Spacer(1, 16),
        Paragraph(today, _BODY),
        Paragraph(f"To: {tender.get('procuring_entity') or 'The Procuring Entity'}", _BODY),
    ]
    subject = f"Re: {tender.get('title', '')}"
    if tender.get("tender_number"):
        subject += f" (Tender No. {tender['tender_number']})"
    story.append(Paragraph(subject, _H2))
    story.append(Paragraph(
        "Dear Sir/Madam,<br/><br/>"
        f"{company['legal_name']} is pleased to submit this proposal in response to the "
        "above-referenced tender. We are a Kenya-based ICT, security systems, "
        "audio-visual and solar systems integrator with direct experience across "
        "networking &amp; cybersecurity, enterprise computing, power backup/solar, "
        "security systems, and audio-visual/broadcast deployments. We confirm our "
        "understanding of the requirements set out in the tender documents and set "
        "out our technical response, priced Bill of Quantities, and supporting "
        "documents in the sections that follow.",
        _BODY,
    ))
    story.append(Paragraph(
        "We trust this proposal meets your requirements and look forward to the "
        "opportunity to be of service.",
        _BODY,
    ))
    story.append(Spacer(1, 20))
    story.append(Paragraph("Yours faithfully,", _BODY))
    story.append(Spacer(1, 20))
    for member in company.get("team", []):
        story.append(Paragraph(f"{member['name']} -- {member['role']}", _BODY))
    story.append(Paragraph(company["legal_name"], _BODY))
    return story


def _company_profile_story(company):
    story = [Paragraph("Company Profile", _H2), Paragraph(company.get("profile_summary", ""), _BODY)]

    story.append(Paragraph("Business lines:", _BODY))
    for line in company.get("business_lines", []):
        story.append(Paragraph(f"&bull; {line}", _BODY))

    story.append(Paragraph("Team:", _BODY))
    for member in company.get("team", []):
        story.append(Paragraph(f"&bull; {member['name']} -- {member['role']}", _BODY))

    reg = company.get("registration", {})
    reg_rows = [["Field", "Value"]]
    for label, key in [
        ("Certificate of Incorporation No.", "certificate_of_incorporation_no"),
        ("CR12 No.", "cr12_no"),
        ("KRA PIN", "kra_pin"),
        ("Tax Compliance Certificate No.", "tax_compliance_certificate_no"),
        ("VAT Registration No.", "vat_registration_no"),
        ("AGPO Certificate No.", "agpo_certificate_no"),
        ("Physical Address", "physical_address"),
    ]:
        reg_rows.append([label, str(reg.get(key, "TODO"))])
    reg_table = Table(reg_rows, colWidths=[70 * mm, 90 * mm])
    reg_table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eeeeee")),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
    ]))
    story.append(Spacer(1, 8))
    story.append(Paragraph(
        "Statutory/registration details (fill from Skystar's own records before submission):",
        _BODY,
    ))
    story.append(reg_table)
    return story


def _technical_response_story(requirement_lines, classify_result):
    story = [Paragraph("Technical Response", _H2)]
    categories = ", ".join((classify_result or {}).get("matched_categories", [])) or "general ICT"
    story.append(Paragraph(
        f"Based on our review of the tender requirements, this engagement falls within "
        f"our {categories} capability area(s). Our proposed technical approach addresses "
        "each requirement identified in the tender documents below.",
        _BODY,
    ))
    if requirement_lines:
        for i, line in enumerate(requirement_lines, 1):
            story.append(Paragraph(f"{i}. {line}", _BODY))
    else:
        story.append(Paragraph(
            "No discrete technical requirement lines were automatically extracted from "
            "the tender document -- this section should be completed manually from the "
            "full tender document before submission.",
            _BODY,
        ))
    return story


def _boq_story(boq_result):
    story = [Paragraph("Priced Bill of Quantities", _H2)]
    if not boq_result.lines:
        story.append(Paragraph("No requirement line items were available to price.", _BODY))
        return story

    rows = [["#", "Description", "Qty", "Unit", "Unit Price (KES)", "Line Total (KES)"]]
    for i, line in enumerate(boq_result.lines, 1):
        unit_price = f"{line.unit_price:,.2f}" if line.price_available else "TODO"
        line_total = f"{line.line_total:,.2f}" if line.price_available else "UNPRICED"
        rows.append([str(i), line.description[:80], f"{line.quantity:g}", line.unit, unit_price, line_total])

    table = Table(rows, colWidths=[8 * mm, 75 * mm, 12 * mm, 18 * mm, 30 * mm, 30 * mm], repeatRows=1)
    table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1c2438")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 7.5),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(table)
    story.append(Spacer(1, 10))

    totals_rows = [
        ["Subtotal", f"KES {boq_result.subtotal:,.2f}"],
        [f"Contingency ({boq_result.contingency_rate * 100:.0f}%)", f"KES {boq_result.contingency_amount:,.2f}"],
        [f"VAT ({boq_result.vat_rate * 100:.0f}%)", f"KES {boq_result.vat_amount:,.2f}"],
        ["Grand Total", f"KES {boq_result.grand_total:,.2f}"],
    ]
    totals_table = Table(totals_rows, colWidths=[60 * mm, 40 * mm])
    totals_table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
    ]))
    story.append(totals_table)

    if boq_result.unpriced_line_count:
        story.append(Spacer(1, 8))
        story.append(Paragraph(
            f"<b>Note:</b> {boq_result.unpriced_line_count} line item(s) above are unpriced "
            "(catalog unit_price is TODO, or no confident catalog match was found). Totals "
            "above only include priced lines -- this BOQ is NOT ready to submit until every "
            "line is priced from Skystar's current cost sheet.",
            _BODY,
        ))
    return story


def _appendix_story(statutory_docs, datasheet_status):
    story = [Paragraph("Appendix: Attachments", _H2)]
    story.append(Paragraph("Statutory documents:", _BODY))
    for info in statutory_docs.values():
        status = "Attached" if info["present"] else "Not yet supplied (see documents/statutory/README.md)"
        story.append(Paragraph(f"&bull; {info['label']}: {status}", _BODY))

    story.append(Paragraph("Product datasheets:", _BODY))
    if datasheet_status:
        for info in datasheet_status.values():
            status = "Attached" if info["present"] else "Not yet supplied"
            story.append(Paragraph(f"&bull; {info['label']}: {status}", _BODY))
    else:
        story.append(Paragraph("No catalog items were matched to this tender's requirements.", _BODY))
    return story


def build_proposal_pdf(
    output_path,
    tender,
    requirement_lines,
    classify_result,
    boq_result,
    company_profile,
    statutory_base_dir=None,
    datasheet_status=None,
    merge_attachments=True,
):
    """Build the core proposal PDF with reportlab, then (if
    merge_attachments and any attached statutory/datasheet PDFs exist on
    disk) merge them in with pypdf so the output is one submission-ready
    file. Returns output_path.

    `tender` is a dict with at least `title` (and optionally
    `procuring_entity`, `tender_number`). `requirement_lines` is a list of
    strings.
    """
    out_dir = os.path.dirname(os.path.abspath(output_path))
    os.makedirs(out_dir, exist_ok=True)

    core_path = output_path + ".core.pdf" if merge_attachments else output_path

    doc = SimpleDocTemplate(core_path, pagesize=A4, topMargin=20 * mm, bottomMargin=20 * mm)
    story = []
    story += _cover_letter_story(company_profile, tender)
    story.append(PageBreak())
    story += _company_profile_story(company_profile)
    story.append(PageBreak())
    story += _technical_response_story(requirement_lines, classify_result)
    story.append(PageBreak())
    story += _boq_story(boq_result)
    story.append(PageBreak())

    statutory_docs = find_statutory_documents(statutory_base_dir)
    story += _appendix_story(statutory_docs, datasheet_status or {})
    doc.build(story)

    if not merge_attachments:
        return output_path

    writer = PdfWriter()
    for page in PdfReader(core_path).pages:
        writer.add_page(page)

    attachment_paths = [info["path"] for info in statutory_docs.values() if info["present"]]
    for info in (datasheet_status or {}).values():
        if info.get("present") and info.get("path"):
            attachment_paths.append(info["path"])

    for path in attachment_paths:
        try:
            for page in PdfReader(path).pages:
                writer.add_page(page)
        except Exception:
            # A corrupt/unreadable attachment shouldn't take down the whole
            # proposal build -- it just won't be merged in.
            continue

    with open(output_path, "wb") as out_f:
        writer.write(out_f)

    if os.path.exists(core_path) and core_path != output_path:
        os.remove(core_path)

    return output_path
