"""Tunables and taxonomy shared across tender_intel.

Kept in one place because two of these numbers are deliberately borrowed
from Skystar's existing "Agent 2" sales proposal pipeline (a separate
Airtable/Make.com/Claude-API system for general sales proposals) so the two
systems stay consistent: BOQ totals there are computed as line items summed,
then +10% contingency, then Kenya's standard 16% VAT. This module is the
early build toward the roadmap's "Agent 7: Government Services" slot -- see
the top-level tender_intel/README.md.
"""

# Matches Skystar's Agent 2 convention exactly.
CONTINGENCY_RATE = 0.10
VAT_RATE = 0.16

# Kenya import "landed cost" helper defaults (see boq/engine.py:landed_cost()
# and the import_landed_cost block on each tender_intel/catalog/catalog.yaml
# entry). These are generic EAC Common External Tariff ballpark figures,
# disabled by default on every catalog item -- actual duty depends on HS
# code, country of origin, and the current KRA gazette notice, and must be
# confirmed per shipment before being relied on.
IMPORT_DUTY_RATE_DEFAULT = 0.25  # typical EAC CET "finished goods" band
IDF_RATE_DEFAULT = 0.02          # Import Declaration Fee
RDL_RATE_DEFAULT = 0.02          # Railway Development Levy
IMPORT_VAT_RATE_DEFAULT = VAT_RATE

# Product/service category taxonomy -- mirrors Skystar's real product lines
# (see README and catalog/catalog.yaml) plus a generic ICT bucket for
# anything that doesn't fit a named product line.
CATEGORY_TAXONOMY = [
    "networking_cybersecurity",
    "servers_computing",
    "power_solar",
    "security_systems",
    "audiovisual_broadcast",
    "data_capture",
    "general_ict",
    "other",
]

# Keyword lists used by analysis/classify.py. Deliberately simple substring
# matching, not ML -- transparent and easy to tune by hand.
CATEGORY_KEYWORDS = {
    "networking_cybersecurity": [
        "firewall", "fortinet", "fortigate", "next-gen firewall", "ngfw",
        "network security", "cybersecurity", "intrusion prevention", "vpn",
        "structured cabling", "local area network", "wide area network",
        "network switch", "network router",
    ],
    "servers_computing": [
        "server", "windows server", "workstation", "mac studio", "data center",
        "data centre", "enterprise computing", "storage area network",
        "virtualization", "virtualisation", "rack server",
    ],
    "power_solar": [
        "solar", "inverter", "ups system", "uninterruptible power supply",
        "victron", "multiplus", "power backup", "battery bank",
        "solar water pump", "renewable energy", "photovoltaic",
        "backup power",
    ],
    "security_systems": [
        "cctv", "access control", "biometric", "fingerprint reader",
        "hikvision", "genetec", "video management system", "surveillance",
        "rfid card", "ic card", "perimeter security", "video surveillance",
        "security system installation",
    ],
    "audiovisual_broadcast": [
        "audio visual", "audio-visual", "av system", "broadcast equipment",
        "blackmagic", "atem", "camcorder", "microphone", "lighting console",
        "led video wall", "video wall", "vizrt", "public address system",
        "video conferencing", "conference system",
    ],
    "data_capture": [
        "barcode scanner", "rugged mobile computer", "zebra printer",
        "label printer", "mobile data capture", "handheld scanner",
    ],
}

# Generic ICT/licensing terms that boost relevance regardless of category.
GENERIC_ICT_TERMS = [
    "ict", "information communication technology",
    "information and communication technology", "software", "cloud",
    "network", "systems integration", "licensing", "software license",
    "software licence", "it equipment", "computer supply", "laptop",
    "printer supply", "cyber security", "database", "erp system",
    "helpdesk", "managed services", "data center", "structured cabling",
]

# ingest.py's default minimum classify_relevance() score for a listing to be
# persisted -- deliberately low (1 keyword hit) since triage is meant to be
# reviewed by a human on the dashboard, not fully automated.
RELEVANCE_MIN_SCORE = 1
