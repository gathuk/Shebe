# Skystar Tender Intelligence -- Tender Discovery &amp; Proposal-Response Prototype

A prototype tool for Skystar Holdings Limited (Kenya) that automates:

1. **Discovering** publicly-advertised ICT/security/AV/solar tenders across
   Kenya and East Africa (government portals, AGPO, mygov, third-party
   aggregators, named companies' own procurement pages).
2. **Extracting** requirements from tender documents (title, procuring
   entity, tender number, closing date, tender fee, bid bond, mandatory
   eligibility documents, technical requirement lines).
3. **Matching** those requirements against Skystar's product/service
   catalog to build a priced Bill of Quantities (BOQ).
4. **Assembling** a response-ready PDF proposal (cover letter, company
   profile, technical response, priced BOQ, appendix of
   datasheets/statutory documents), ready to be queued as an email draft or
   printed.

This is a standalone project inside the repo (`tender_intel/`) -- it does
not depend on or modify `netlimit/`, `modules/`, or the top-level OSINT app.

## This is a prototype/scaffold, not a finished production system

Please read this section before relying on anything here.

- **Live scraping has not been (and could not be) verified against the real
  sites from this build environment.** This sandbox's outbound network
  access is blocked to the real tender portals (tenders.go.ke, mygov.go.ke,
  ppra.go.ke, third-party aggregators, named company sites). Every
  connector in `sources/` is real, working code -- it's just been tested
  against local HTML fixtures (`tests/fixtures/`) that approximate each
  site's likely structure, not the live DOM. **Before relying on any
  connector in production: open the real site, view source, and confirm
  the CSS selectors in that connector's `SELECTORS` dict (or
  `config/company_sources.yaml` entry) still match** -- then run the
  ingest job from an environment that actually has outbound internet
  access (the user's own server, or a scheduled job elsewhere). This
  sandbox cannot do that verification step; someone with real network
  access has to.
- **No real pricing.** `catalog/catalog.yaml`'s `unit_price` field is `null`
  (TODO) on every single entry -- this build has no access to Skystar's
  actual costed price list. `boq/engine.py` is designed to make this
  impossible to miss: any BOQ line that can't be priced is explicitly
  flagged (`price_available: False`, counted in `unpriced_line_count`),
  never silently treated as free. A generated proposal with unpriced lines
  is a usable *draft*, not something to submit.
- **No real statutory documents or registration numbers.** Skystar's KRA
  PIN, CR12 number, certificate of incorporation number, bank details, etc.
  are all `TODO-...` placeholders in `company/profile.yaml`. This is
  deliberate -- see "Critical constraints" in the build task and
  `documents/statutory/README.md`. Nothing here invents plausible-looking
  fake values.
- **Gmail sending is not wired up.** `email/queue.py::send_via_gmail_api()`
  is a documented stub that raises `NotImplementedError`. Sending (or
  drafting) real email requires Gmail API OAuth credentials configured in a
  deployed environment, which this prototype build doesn't have. This
  module only gets as far as rendering a subject/body and persisting an
  `EmailQueueItem` in `queued` status.

## How this relates to Skystar's other sales-proposal automation

Skystar already has (or is building) two separate, complementary pieces of
automation, described in Skystar's own internal planning documents:

- **"Agent 2: Sales &amp; Proposal Generation"** -- an existing
  Airtable/Make.com/Claude-API pipeline for *general* sales proposals (not
  government-tender-specific). This module reuses Agent 2's BOQ
  conventions on purpose, so the two systems produce consistent numbers:
  line items summed, then **+10% contingency**, then Kenya's standard
  **16% VAT** (see `config.py`: `CONTINGENCY_RATE`, `VAT_RATE`).
- **"Agent 7: Government Services"** -- a named future roadmap slot for
  government RFP bidding. `tender_intel/` is effectively **an early build
  toward Agent 7**: government/public-tender discovery, requirement
  extraction, and proposal assembly specifically. It is complementary to,
  not a replacement for, the separate Agent 2 Airtable pipeline -- Agent 2
  presumably continues to handle general (non-tender) sales proposals.

## Architecture

```
tender_intel/
  app.py              Flask app factory + dashboard/detail/proposal routes
  db.py, models.py     SQLAlchemy setup + Tender/TenderDocument/
                        RequirementItem/BOQLineItem/Proposal/EmailQueueItem
  config.py             VAT/contingency/import-duty rates, category taxonomy
  sources/               One connector module per site/portal (see below)
  analysis/
    classify.py          Keyword-based ICT/licensing relevance scorer
    extract.py            pdfplumber-based tender PDF/text parser
  catalog/
    catalog.yaml          Skystar product/service catalog (unit_price: TODO)
    matcher.py             difflib-based fuzzy requirement -> catalog matching
  boq/engine.py           Priced BOQ construction (contingency, VAT, import
                           landed-cost helper)
  company/
    profile.yaml           Skystar's public info; statutory fields are TODO
    documents.py            Loads local statutory PDFs by naming convention
  proposal/builder.py       Assembles the final PDF (reportlab + pypdf)
  email/queue.py             Renders proposal emails; send is a stub
  templates/, static/         Jinja2 + CSS (adapted from netlimit/'s look)
  documents/statutory/         LOCAL, GITIGNORED real statutory PDFs go here
  catalog/datasheets/            LOCAL, GITIGNORED vendor datasheet PDFs go here
  tests/                          pytest suite, fixture-driven, no network calls
  scripts/demo_run.py              End-to-end scripted demo (see below)
```

### Sources (`sources/`)

| Module | Covers |
|---|---|
| `kenya_ppip.py` | tenders.go.ke -- Kenya's Public Procurement Information Portal |
| `kenya_agpo.py` | ppra.go.ke AGPO listings (youth/women/PWD-reserved tenders) |
| `mygov.py` | mygov.go.ke tender listings |
| `aggregators.py` | Config-driven generic scraper for 3rd-party aggregator sites (tenderskenya.co.ke, tendersunlimited.com, kenyatenders.com) -- all ship `enabled: false` |
| `east_africa.py` | Uganda PPDA, Tanzania PPRA/TANeGP, Rwanda RPPA/Umucyo |
| `company_sites.py` | Config-driven watcher for named companies' own tender pages, configured in `config/company_sources.yaml` (ships with illustrative Safaricom/Kenya Power/KRA entries, `enabled: false`) |
| `ingest.py` | Orchestrator: runs every enabled source, dedupes by `(source, external_id or url)`, filters by relevance, persists |

Every connector follows the same shape: a pure `parse_listing_page(html, ...)`
function (unit-tested against `tests/fixtures/*.html`) and a `fetch(...)`
function that does the real HTTP GET through `sources/base.py`'s
`polite_fetch()` (descriptive User-Agent, timeout, robots.txt check) and
then calls the parse function. `ingest.run_ingest()` wraps each source's
`fetch()` in a try/except, so one broken/blocked connector doesn't stop the
whole run.

## Setup

```bash
cd tender_intel   # or run from the repo root, paths below assume repo root
pip install -r tender_intel/requirements.txt
```

## Running the tests

```bash
python -m pytest tender_intel/tests/ -v
```

All tests run offline against local fixtures (`tests/fixtures/`) -- no
network calls are made anywhere in the test suite.

## Running the dashboard

```bash
python -m tender_intel.app        # dashboard on http://localhost:5060
```

Uses a local SQLite file (`tender_intel.db`) by default; set
`TENDER_INTEL_DB_URL` to point at Postgres for a persistent deployment (see
`netlimit/README.md` for the equivalent Render/Railway pattern -- the same
approach applies here, this module just doesn't ship its own `render.yaml`
entry yet).

The dashboard starts empty -- there's no auto-seed step, since tender data
here is meant to reflect real advertised tenders, not synthetic demo data.
Populate it by running `tender_intel.sources.ingest.run_ingest()` from an
environment with real network access (see "Live scraping" above), or use
`scripts/demo_run.py` (below) to see the extraction -> BOQ -> proposal PDF
pipeline work end-to-end on a synthetic fixture tender.

## End-to-end demo (schema/plumbing, not real pricing)

```bash
python tender_intel/scripts/demo_run.py
```

Loads the synthetic fixture tender document
(`tests/fixtures/sample_tender_document.txt` -- not a real client
document), runs relevance classification and requirement extraction,
builds a BOQ against the catalog, and writes an actual PDF to
`tender_intel/demo_output/skystar_demo_proposal.pdf`. Most/all BOQ lines
will come out flagged as unpriced -- that's expected, since
`catalog/catalog.yaml`'s pricing is all TODO in this build. The point of
this script is to prove the pipeline's plumbing works end-to-end, not to
produce a real quote.

## Populating real data before this is submission-ready

1. **Pricing:** edit `tender_intel/catalog/catalog.yaml`, filling in
   `unit_price` (KES, ex-VAT) for each line from Skystar's actual cost
   sheet. Leave `import_landed_cost.enabled: false` unless you've confirmed
   the duty/IDF/RDL rates for that specific item/shipment.
2. **Statutory documents:** copy real PDFs into
   `tender_intel/documents/statutory/` following the naming convention in
   that folder's `README.md`. **Never commit them** -- the folder is
   gitignored except for `.gitkeep`/`README.md`.
3. **Registration numbers:** edit `tender_intel/company/profile.yaml`,
   replacing the `TODO-...` placeholders under `registration:` with
   Skystar's real KRA PIN, CR12 number, certificate of incorporation
   number, bank details, etc. Source these from Skystar's own records, not
   from anywhere else.
4. **Vendor datasheets:** copy real datasheet PDFs into
   `tender_intel/catalog/datasheets/`, named `<catalog-item-key>.pdf` (see
   that folder's `README.md`). Also gitignored -- they're copyrighted
   vendor material.
5. **Live scraping:** re-verify every connector's selectors against the
   real live site (see "Live scraping" above), then run the ingest job from
   a host with real outbound network access.
6. **Gmail sending:** implement `email/queue.py::send_via_gmail_api()` with
   real Gmail API OAuth credentials in the deployed environment, or wire
   `EmailQueueItem` rows into whatever email tooling the team already uses.

## What is explicitly NOT done yet

- Live scraping is unverified against the real portals (blocked network
  access in this build environment -- see above).
- No real Skystar pricing anywhere in `catalog.yaml`.
- No real statutory documents or registration numbers -- all `TODO`
  placeholders.
- No vendor datasheets -- copyrighted, not included.
- Gmail API sending is a stub, not implemented.
- No OCR: `analysis/extract.py` only reads text-layer PDFs; a scanned
  tender notice (image-only PDF) will extract nothing.
- Requirement extraction (`analysis/extract.py`) is heuristic
  regex/keyword matching, not a robust parser -- every field it returns
  should be treated as a human-reviewed draft, not ground truth.
- Fuzzy catalog matching (`catalog/matcher.py`) uses stdlib `difflib` by
  default (falls back automatically to `rapidfuzz` if that happens to be
  installed, but it's not a required dependency) -- good enough for a
  prototype, not a tuned production matcher.
- No deployment config (`render.yaml`/`Procfile` entry) for this module
  yet -- `netlimit/`'s pattern is directly reusable if/when this needs a
  hosted demo.
