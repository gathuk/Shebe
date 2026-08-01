import pytest

from netlimit.app import create_app
from netlimit.categories import seed_categories
from netlimit.db import SessionLocal
from netlimit.models import Department, User


@pytest.fixture
def client():
    app = create_app("sqlite:///:memory:")
    with SessionLocal() as session:
        seed_categories(session)
        dept = Department(name="Engineering", daily_time_quota_minutes=60, daily_data_quota_mb=500)
        session.add(dept)
        session.flush()
        session.add(User(
            username="jdoe", full_name="Jane Doe", email="jdoe@example.com",
            ip_address="10.0.0.5", department_id=dept.id,
        ))
        session.commit()

    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


def test_dashboard_loads(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert b"Dashboard" in resp.data


def test_users_list_loads(client):
    resp = client.get("/users")
    assert resp.status_code == 200
    assert b"Jane Doe" in resp.data


def test_squid_config_download(client):
    resp = client.get("/squid-config?download=1")
    assert resp.status_code == 200
    assert b"external_acl_type netlimit_quota" in resp.data


def test_api_check_access_allows_uncategorized_domain(client):
    resp = client.post("/api/check-access", json={"ip": "10.0.0.5", "hostname": "example.com"})
    assert resp.status_code == 200
    assert resp.get_json()["allowed"] is True


def test_api_check_access_unknown_ip(client):
    resp = client.post("/api/check-access", json={"ip": "1.2.3.4", "hostname": "example.com"})
    assert resp.status_code == 404
