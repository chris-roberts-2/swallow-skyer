import pytest

from app import create_app, db
import app.middleware.auth_middleware as auth_middleware
import app.services.storage.supabase_client as supabase_module

AUTH_HEADER = {"Authorization": "Bearer token"}


@pytest.fixture(autouse=True)
def stub_auth(monkeypatch):
    monkeypatch.setattr(
        auth_middleware, "verify_supabase_jwt", lambda token: {"id": "user-actor"}
    )


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


def test_list_members_success(client, monkeypatch):
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_project_role",
        lambda project_id, user_id: "viewer",
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "list_project_members",
        lambda project_id: [{"user_id": "user-actor", "role": "viewer"}],
    )
    resp = client.get("/api/v1/projects/proj-1/members", headers=AUTH_HEADER)
    assert resp.status_code == 200
    assert resp.get_json()["success"]


def test_list_members_forbidden(client, monkeypatch):
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_project_role",
        lambda project_id, user_id: None,
    )
    resp = client.get("/api/v1/projects/proj-1/members", headers=AUTH_HEADER)
    assert resp.status_code == 403


def test_add_member_success(client, monkeypatch):
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_project_role",
        lambda project_id, user_id: "owner",
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "add_project_member",
        lambda project_id, user_id, role: {"project_id": project_id, "user_id": user_id, "role": role},
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_project_role",
        lambda project_id, user_id: "owner" if user_id == "user-actor" else None,
    )
    resp = client.post(
        "/api/v1/projects/proj-1/members",
        json={"user_id": "user-new", "role": "viewer"},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 201
    assert resp.get_json()["success"]



