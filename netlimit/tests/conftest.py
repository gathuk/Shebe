import datetime

import pytest

from netlimit import db as db_module
from netlimit.categories import seed_categories
from netlimit.models import Department, User


@pytest.fixture
def session():
    db_module.init_db("sqlite:///:memory:")
    with db_module.session_scope() as s:
        yield s


@pytest.fixture
def dept(session):
    d = Department(name="Engineering", daily_time_quota_minutes=60, daily_data_quota_mb=500)
    session.add(d)
    session.flush()
    return d


@pytest.fixture
def categories(session):
    return seed_categories(session)


@pytest.fixture
def user(session, dept):
    u = User(
        username="jdoe", full_name="Jane Doe", email="jdoe@example.com",
        ip_address="10.0.0.5", department_id=dept.id,
    )
    session.add(u)
    session.flush()
    return u
