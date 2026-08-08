"""Loads the product/service catalog from catalog.yaml, and resolves
locally-placed vendor datasheet files by naming convention."""
import os

import yaml

CATALOG_PATH = os.path.join(os.path.dirname(__file__), "catalog.yaml")
DATASHEETS_DIR = os.path.join(os.path.dirname(__file__), "datasheets")


def load_catalog(path=CATALOG_PATH):
    """Return the catalog as a list of dicts (see catalog.yaml for shape)."""
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or []


def catalog_by_key(path=CATALOG_PATH):
    return {item["key"]: item for item in load_catalog(path)}


def datasheet_path(item, datasheets_dir=None):
    """Expected local datasheet filename for a catalog item, by naming
    convention: catalog/datasheets/<key>.pdf. Doesn't check existence --
    see datasheet_status_for_items() and catalog/datasheets/README.md."""
    datasheets_dir = datasheets_dir or DATASHEETS_DIR
    return os.path.join(datasheets_dir, f"{item['key']}.pdf")


def datasheet_status_for_items(catalog_items, datasheets_dir=None):
    """For each catalog item, report whether its datasheet file is present
    locally. Vendor datasheets are copyrighted and are never committed to
    this repo (see catalog/datasheets/README.md) -- this always gracefully
    reports `present: False` rather than erroring when a file is missing."""
    status = {}
    for item in catalog_items:
        path = datasheet_path(item, datasheets_dir)
        status[item["key"]] = {
            "label": item.get("name", item["key"]),
            "path": path,
            "present": os.path.isfile(path),
        }
    return status
