"""Tender source connectors.

Each connector module exposes a pure `parse_listing_page(html, ...)`
function (unit-testable against local HTML fixtures, no network I/O) and a
`fetch(...)` function that does the real HTTP GET via `base.polite_fetch`
and then calls the parse function. See sources/base.py and each module's
docstring. None of these have been exercised against the real live sites
from this build environment -- see tender_intel/README.md.
"""
