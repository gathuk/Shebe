"""Skystar Tender Intelligence -- tender discovery, requirement extraction,
BOQ pricing and proposal generation.

Run:
    python -m tender_intel.scripts.demo_run   # end-to-end scripted demo
    python -m tender_intel.app                # start the dashboard on :5060

See tender_intel/README.md for what is and isn't implemented in this
prototype build (live scraping unverified against real sites, no real
pricing yet, Gmail sending not wired up).
"""
import os

from flask import Flask, abort, g, redirect, render_template, request, send_file, url_for

from tender_intel.analysis.classify import classify_relevance
from tender_intel.analysis.extract import parse_tender_pdf
from tender_intel.boq.engine import build_boq
from tender_intel.catalog.loader import datasheet_status_for_items, load_catalog
from tender_intel.company import load_profile
from tender_intel.db import SessionLocal, init_db
from tender_intel.email.queue import queue_email
from tender_intel.models import BOQLineItem, Proposal, RequirementItem, Tender

DEFAULT_OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "generated", "proposals")


def create_app(db_url=None, output_dir=None):
    app = Flask(__name__)
    db_url = db_url or os.environ.get("TENDER_INTEL_DB_URL", "sqlite:///tender_intel.db")
    init_db(db_url)
    app.config["OUTPUT_DIR"] = output_dir or os.environ.get("TENDER_INTEL_OUTPUT_DIR", DEFAULT_OUTPUT_DIR)

    @app.before_request
    def open_session():
        g.db = SessionLocal()

    @app.teardown_request
    def close_session(exception=None):
        db = g.pop("db", None)
        if db is not None:
            if exception is None:
                db.commit()
            else:
                db.rollback()
            db.close()

    register_routes(app)
    return app


def register_routes(app):
    @app.route("/")
    def dashboard():
        db = g.db
        status_filter = request.args.get("status", "")
        query = db.query(Tender)
        if status_filter:
            query = query.filter_by(status=status_filter)
        tenders = query.order_by(Tender.relevance_score.desc(), Tender.closing_at.asc()).limit(200).all()

        return render_template(
            "dashboard.html",
            tenders=tenders,
            total_tenders=db.query(Tender).count(),
            new_tenders=db.query(Tender).filter_by(status="new").count(),
            proposals_generated=db.query(Proposal).count(),
            status_filter=status_filter,
        )

    @app.route("/tenders/<int:tender_id>")
    def tender_detail(tender_id):
        db = g.db
        tender = db.get(Tender, tender_id)
        if tender is None:
            abort(404)

        relevance = classify_relevance(f"{tender.title} {tender.raw_summary}")
        requirement_items = (
            db.query(RequirementItem).filter_by(tender_id=tender.id).order_by(RequirementItem.id).all()
        )
        proposals = db.query(Proposal).filter_by(tender_id=tender.id).order_by(Proposal.id.desc()).all()
        return render_template(
            "tender_detail.html",
            tender=tender,
            relevance=relevance,
            requirement_items=requirement_items,
            documents=tender.documents,
            proposals=proposals,
        )

    @app.route("/tenders/<int:tender_id>/extract", methods=["POST"])
    def extract_tender(tender_id):
        db = g.db
        tender = db.get(Tender, tender_id)
        if tender is None:
            abort(404)

        for document in tender.documents:
            if not document.local_path or not os.path.isfile(document.local_path):
                # No locally downloaded document to extract from -- this
                # prototype doesn't auto-download tender PDFs (needs live
                # network access; see README). generate_proposal() below
                # still works via a title-only fallback requirement.
                continue
            extracted = parse_tender_pdf(document.local_path, title_hint=tender.title)
            document.extracted_text = extracted.raw_text
            for line in extracted.requirement_lines:
                db.add(RequirementItem(
                    tender_id=tender.id, document_id=document.id,
                    item_type="technical_requirement", description=line, raw_line=line,
                ))
            for doc_name in extracted.mandatory_documents:
                db.add(RequirementItem(
                    tender_id=tender.id, document_id=document.id,
                    item_type="mandatory_document", description=doc_name,
                    mandatory=True, raw_line=doc_name,
                ))

        tender.status = "reviewed"
        return redirect(url_for("tender_detail", tender_id=tender.id))

    @app.route("/tenders/<int:tender_id>/generate-proposal", methods=["POST"])
    def generate_proposal(tender_id):
        db = g.db
        tender = db.get(Tender, tender_id)
        if tender is None:
            abort(404)

        requirement_rows = (
            db.query(RequirementItem)
            .filter_by(tender_id=tender.id, item_type="technical_requirement")
            .all()
        )
        # Fall back to a single requirement stub from the tender title so
        # the pipeline still produces a (mostly unpriced) BOQ/proposal
        # rather than failing outright when nothing has been extracted yet.
        requirement_items = requirement_rows or [{"description": tender.title, "quantity": 1.0, "unit": "unit"}]

        catalog = load_catalog()
        boq_result = build_boq(requirement_items, catalog)
        relevance = classify_relevance(f"{tender.title} {tender.raw_summary}")

        proposal = Proposal(
            tender_id=tender.id, status="generated",
            subtotal=boq_result.subtotal, contingency_amount=boq_result.contingency_amount,
            vat_amount=boq_result.vat_amount, grand_total=boq_result.grand_total,
            unpriced_line_count=boq_result.unpriced_line_count,
        )
        db.add(proposal)
        db.flush()

        matched_keys = set()
        for line in boq_result.lines:
            db.add(BOQLineItem(
                proposal_id=proposal.id, catalog_key=line.catalog_key,
                description=line.description, category=line.category,
                quantity=line.quantity, unit=line.unit, unit_price=line.unit_price,
                line_total=line.line_total, matched=line.matched,
                price_available=line.price_available, notes=line.notes,
            ))
            if line.catalog_key:
                matched_keys.add(line.catalog_key)
        db.flush()

        matched_catalog_items = [item for item in catalog if item["key"] in matched_keys]
        datasheet_status = datasheet_status_for_items(matched_catalog_items)
        requirement_lines = [
            (r.description if isinstance(r, RequirementItem) else r["description"])
            for r in requirement_items
        ]

        from tender_intel.proposal.builder import build_proposal_pdf

        company = load_profile()
        os.makedirs(app.config["OUTPUT_DIR"], exist_ok=True)
        pdf_path = os.path.join(app.config["OUTPUT_DIR"], f"proposal_{proposal.id}.pdf")
        tender_dict = {
            "title": tender.title, "procuring_entity": tender.procuring_entity,
            "tender_number": tender.external_id,
        }
        build_proposal_pdf(
            pdf_path, tender_dict, requirement_lines, relevance, boq_result, company,
            datasheet_status=datasheet_status,
        )
        proposal.pdf_path = pdf_path
        tender.status = "proposal_generated"

        return redirect(url_for("proposal_preview", proposal_id=proposal.id))

    @app.route("/proposals/<int:proposal_id>")
    def proposal_preview(proposal_id):
        db = g.db
        proposal = db.get(Proposal, proposal_id)
        if proposal is None:
            abort(404)
        return render_template(
            "proposal_preview.html",
            proposal=proposal, tender=proposal.tender,
            line_items=proposal.boq_line_items, email_items=proposal.email_queue_items,
        )

    @app.route("/proposals/<int:proposal_id>/download")
    def proposal_download(proposal_id):
        db = g.db
        proposal = db.get(Proposal, proposal_id)
        if proposal is None or not proposal.pdf_path or not os.path.isfile(proposal.pdf_path):
            abort(404)
        return send_file(
            proposal.pdf_path, as_attachment=True, download_name=f"skystar_proposal_{proposal.id}.pdf",
        )

    @app.route("/proposals/<int:proposal_id>/queue-email", methods=["POST"])
    def queue_proposal_email(proposal_id):
        db = g.db
        proposal = db.get(Proposal, proposal_id)
        if proposal is None:
            abort(404)
        company = load_profile()
        queue_email(db, proposal, proposal.tender, company, to_address=request.form.get("to_address"))
        return redirect(url_for("proposal_preview", proposal_id=proposal.id))


if __name__ == "__main__":
    create_app().run(debug=True, host="0.0.0.0", port=5060)
