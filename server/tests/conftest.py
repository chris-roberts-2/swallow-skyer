import pytest

from app import create_app, db


@pytest.fixture(scope="function")
def app():
    flask_app = create_app()
    flask_app.config["TESTING"] = True
    flask_app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"

    with flask_app.app_context():
        db.create_all()
        yield flask_app
        db.session.remove()
        db.drop_all()


@pytest.fixture(scope="function")
def client(app):
    return app.test_client()


@pytest.fixture
def supabase_user():
    return {"id": "user-123", "email": "pilot@example.com"}


@pytest.fixture
def mock_supabase_verify(monkeypatch, supabase_user):
    def _mock(token: str):
        token = (token or "").strip()
        if token == "valid-supabase-token":
            return supabase_user
        if token == "expired-token":
            raise PermissionError("Supabase JWT validation failed")
        raise PermissionError("Supabase JWT validation failed")

    monkeypatch.setattr("app.middleware.auth_middleware.verify_supabase_jwt", _mock)
    return _mock


@pytest.fixture
def auth_headers(mock_supabase_verify):
    return {"Authorization": "Bearer valid-supabase-token"}


@pytest.fixture
def unauthenticated_headers():
    return {}
