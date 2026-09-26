# Vendor datasheets (local, gitignored)

This folder holds vendor product datasheets (Fortinet, Hikvision, Victron,
Blackmagic, Zebra, etc.) referenced by `tender_intel/catalog/catalog.yaml`,
used by `tender_intel/proposal/builder.py` to attach supporting technical
documentation to a generated proposal.

**Do NOT commit vendor datasheets to this repository.** They are
copyrighted material belonging to their respective manufacturers, not
Skystar. Everything in this folder except `.gitkeep` is gitignored (see
`.gitignore` at the repo root).

## Naming convention

Files are looked up by the catalog item's `key` (see catalog.yaml), as
`<key>.pdf`, e.g.:

```
catalog/datasheets/fortinet_fortigate_1800f.pdf
catalog/datasheets/hikvision_ds_k1t804amf.pdf
catalog/datasheets/victron_multiplus_ii.pdf
```

Download the current datasheet PDF from each vendor's own site and place it
here under the matching filename. `catalog/loader.py::datasheet_status_for_items()`
checks for these files by convention; `proposal/builder.py` inserts a "Not
yet supplied" appendix line for any catalog item whose datasheet isn't
present, rather than failing.
