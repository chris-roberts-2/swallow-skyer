"""
API tests for Swallow Skyer backend.
"""

import pytest
from app import create_app, db
from app.models import User, Photo, Location


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


def test_get_users_empty(client):
    """Test getting users when none exist."""
    response = client.get("/api/users")
    assert response.status_code == 200
    data = response.get_json()
    assert data == []


def test_create_user(client):
    """Test creating a new user."""
    user_data = {"name": "Test User", "email": "test@example.com"}

    response = client.post("/api/users", json=user_data)
    assert response.status_code == 201

    data = response.get_json()
    assert data["name"] == "Test User"
    assert data["email"] == "test@example.com"
    assert "id" in data
    assert "created_at" in data


def test_create_user_missing_name(client):
    """Test creating user without required name field."""
    user_data = {"email": "test@example.com"}

    response = client.post("/api/users", json=user_data)
    assert response.status_code == 400

    data = response.get_json()
    assert "error" in data


def test_get_photos_empty(client):
    """Test getting photos when none exist."""
    response = client.get("/api/photos")
    assert response.status_code == 200
    data = response.get_json()
    assert isinstance(data, dict)
    assert data.get("photos") == []
    pagination = data.get("pagination", {})
    assert pagination.get("total") == 0


def test_create_photo(client):
    """Test creating a new photo record."""
    photo_data = {
        "filename": "test_photo.jpg",
        "caption": "Test photo",
        "latitude": 40.7128,
        "longitude": -74.0060,
    }

    response = client.post("/api/photos", json=photo_data)
    assert response.status_code == 201

    data = response.get_json()
    assert isinstance(data, dict)
    assert data["filename"] == "test_photo.jpg"
    assert data["caption"] == "Test photo"
    assert data["latitude"] == 40.7128
    assert data["longitude"] == -74.0060
    assert "id" in data
    assert "created_at" in data
    assert "url" in data


def test_create_photo_missing_required_fields(client):
    """Test creating photo without required fields."""
    photo_data = {
        "filename": "test_photo.jpg"
        # Missing latitude and longitude
    }

    response = client.post("/api/photos", json=photo_data)
    assert response.status_code == 400

    data = response.get_json()
    assert "error" in data


def test_get_locations_empty(client):
    """Test getting locations when none exist."""
    response = client.get("/api/locations")
    assert response.status_code == 200
    data = response.get_json()
    assert data == []


def test_create_location(client):
    """Test creating a new location record."""
    location_data = {
        "name": "Test Location",
        "latitude": 40.7128,
        "longitude": -74.0060,
        "description": "A test location",
    }

    response = client.post("/api/locations", json=location_data)
    assert response.status_code == 201

    data = response.get_json()
    assert data["name"] == "Test Location"
    assert data["latitude"] == 40.7128
    assert data["longitude"] == -74.0060
    assert data["description"] == "A test location"
    assert "id" in data


def test_create_location_missing_required_fields(client):
    """Test creating location without required fields."""
    location_data = {
        "name": "Test Location"
        # Missing latitude and longitude
    }

    response = client.post("/api/locations", json=location_data)
    assert response.status_code == 400

    data = response.get_json()
    assert "error" in data
