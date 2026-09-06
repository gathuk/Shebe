# Statutory documents (local, gitignored)

This folder holds Skystar Holdings Limited's real statutory/registration
documents, used by `tender_intel/proposal/builder.py` to assemble the
appendix of a generated proposal.

**Do NOT commit real statutory documents to this repository.** Everything
in this folder except `.gitkeep` is gitignored (see `.gitignore` at the
repo root) precisely so this doesn't happen by accident.

## Populating this folder

Copy the relevant PDFs from Skystar's own Google Drive (or wherever the
company's registration paperwork is currently kept) into this folder, named
exactly as follows:

| Filename                              | Document                                    |
|----------------------------------------|----------------------------------------------|
| `certificate_of_incorporation.pdf`      | Certificate of Incorporation                  |
| `cr12.pdf`                              | CR12 (Register of Directors/Shareholders)     |
| `kra_pin_certificate.pdf`               | KRA PIN Certificate                           |
| `tax_compliance_certificate.pdf`        | Tax Compliance Certificate                    |
| `vat_certificate.pdf`                   | VAT Registration Certificate                  |
| `agpo_certificate.pdf`                  | AGPO Certificate (if applicable)              |
| `business_permit.pdf`                   | Business Permit                               |
| `audited_accounts.pdf`                  | Audited Accounts (latest)                     |

The exact set of expected filenames lives in
`tender_intel/company/documents.py::STATUTORY_DOCUMENTS` -- update both
together if the list changes.

## What happens if a document is missing

Nothing breaks. `company/documents.py:find_statutory_documents()` reports
`present: False` for any file that isn't here, and
`proposal/builder.py` inserts a "Not yet supplied" line in the proposal's
appendix instead of crashing or silently omitting the document. A proposal
built with missing statutory documents is still a usable *draft* -- it is
just not yet submission-ready.
