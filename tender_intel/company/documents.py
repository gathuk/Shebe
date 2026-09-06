"""Loads statutory document file paths from the local, gitignored
documents/statutory/ folder, by naming convention. Never assume a file
exists -- these are populated manually per-deployment from Skystar's own
Google Drive (see tender_intel/documents/statutory/README.md), and are
never committed to this repo."""
import os

STATUTORY_DIR = os.path.join(os.path.dirname(__file__), "..", "documents", "statutory")

# Naming convention -> human label expected for files in documents/statutory/.
# e.g. "certificate_of_incorporation" -> documents/statutory/certificate_of_incorporation.pdf
STATUTORY_DOCUMENTS = {
    "certificate_of_incorporation": "Certificate of Incorporation",
    "cr12": "CR12 (Register of Directors/Shareholders)",
    "kra_pin_certificate": "KRA PIN Certificate",
    "tax_compliance_certificate": "Tax Compliance Certificate",
    "vat_certificate": "VAT Registration Certificate",
    "agpo_certificate": "AGPO Certificate",
    "business_permit": "Business Permit",
    "audited_accounts": "Audited Accounts (latest)",
}


def statutory_dir(base_dir=None):
    return os.path.normpath(base_dir or STATUTORY_DIR)


def find_statutory_documents(base_dir=None):
    """Return {doc_key: {"label", "path", "present"}} for every document in
    STATUTORY_DOCUMENTS. `present=False` entries are expected and handled
    gracefully -- proposal/builder.py inserts a "document not yet supplied"
    note for those instead of crashing."""
    directory = statutory_dir(base_dir)
    result = {}
    for key, label in STATUTORY_DOCUMENTS.items():
        found_path = None
        if os.path.isdir(directory):
            for ext in (".pdf", ".PDF"):
                candidate = os.path.join(directory, f"{key}{ext}")
                if os.path.isfile(candidate):
                    found_path = candidate
                    break
        result[key] = {"label": label, "path": found_path, "present": found_path is not None}
    return result
