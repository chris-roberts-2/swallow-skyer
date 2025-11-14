import pytest

from app import create_app, db


@pytest.fixture
def app():
    flask_app = create_app()
    flask_app.config["TESTING"] = True
    flask_app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"

    with flask_app.app_context():
        db.create_all()
        yield flask_app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()


def signup_user(client, email="test@example.com", password="Secret123!", name="Test"):
    return client.post(
        "/api/auth/signup",
        json={"email": email, "password": password, "name": name},
    )


def login_user(client, email="test@example.com", password="Secret123!"):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def test_signup_and_duplicate_email(client):
    first = signup_user(client)
    assert first.status_code == 201
    body = first.get_json()
    assert "access_token" in body and "refresh_token" in body

    duplicate = signup_user(client)
    assert duplicate.status_code == 400
    assert duplicate.get_json()["error"] == "Email already exists"


def test_login_and_invalid_credentials(client):
    signup_user(client)

    success = login_user(client)
    assert success.status_code == 200
    data = success.get_json()
    assert "access_token" in data

    invalid = login_user(client, password="wrong")
    assert invalid.status_code == 401
    assert "Invalid credentials" in invalid.get_json()["error"]


def test_protected_route_requires_token(client):
    signup = signup_user(client)
    access_token = signup.get_json()["access_token"]

    unauthorized = client.get("/api/auth/me")
    assert unauthorized.status_code == 401

    authorized = client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {access_token}"}
    )
    assert authorized.status_code == 200
    assert authorized.get_json()["user"]["email"] == "test@example.com"


def test_refresh_token_rotation(client):
    signup = signup_user(client)
    tokens = signup.get_json()
    refresh_token = tokens["refresh_token"]

    refresh_response = client.post(
        "/api/auth/refresh", json={"refresh_token": refresh_token}
    )
    assert refresh_response.status_code == 200
    new_tokens = refresh_response.get_json()
    assert new_tokens["refresh_token"] != refresh_token

    reused = client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
    assert reused.status_code == 401
    assert "rotated" in reused.get_json()["error"]

