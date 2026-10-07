import pytest

from tender_intel import db as db_module
from tender_intel.catalog.loader import load_catalog


@pytest.fixture
def session():
    db_module.init_db("sqlite:///:memory:")
    with db_module.session_scope() as s:
        yield s


@pytest.fixture
def catalog():
    return load_catalog()
