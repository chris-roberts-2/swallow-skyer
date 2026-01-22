"""
API tests for Swallow Skyer backend.
"""

import pytest
from app import create_app, db


@pytest.fixture
def app():
    """Create test Flask app."""
    app = create_app()
    app.config["TESTING"] = True
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"

    with app.app_context():
        db.create_all()
        yield app
        db.drop_all()


@pytest.fixture
def client(app):
    """Create test client."""
    return app.test_client()


def test_ping_endpoint(client):
    """Test ping endpoint returns correct response."""
    response = client.get("/ping")
    assert response.status_code == 200
    data = response.get_json()
    assert data["status"] == "ok"


def test_health_endpoint(client):
    """Test health endpoint returns detailed information."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.get_json()
    assert data["status"] == "ok"
    assert "database" in data
    assert "version" in data


