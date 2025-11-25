import pytest

from app import create_app, db
import app.middleware.auth_middleware as auth_middleware
import app.services.storage.supabase_client as supabase_module


AUTH_HEADER = {"Authorization": "Bearer test-token"}


@pytest.fixture(autouse=True)
def stub_auth(monkeypatch):
    monkeypatch.setattr(
        auth_middleware, "verify_supabase_jwt", lambda token: {"id": "user-1"}
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


def test_create_project_success(client, monkeypatch):
    created = {"id": "proj-1", "name": "Demo", "description": "test"}
    calls = {}

    def fake_create_project(name, owner_id, description=None):
        calls["create"] = {
            "name": name,
            "owner_id": owner_id,
            "description": description,
        }
        return created

    def fake_add_member(project_id, user_id, role):
        calls["member"] = {"project_id": project_id, "user_id": user_id, "role": role}
        return {"project_id": project_id, "user_id": user_id, "role": role}

    monkeypatch.setattr(
        supabase_module.supabase_client, "create_project", fake_create_project
    )
    monkeypatch.setattr(
        supabase_module.supabase_client, "add_project_member", fake_add_member
    )

    resp = client.post(
        "/api/v1/projects",
        json={"name": "Demo", "description": "test"},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 201
    assert resp.get_json()["id"] == "proj-1"
    assert calls["member"]["role"] == "owner"


def test_create_project_requires_name(client):
    resp = client.post("/api/v1/projects", json={}, headers=AUTH_HEADER)
    assert resp.status_code == 400


def test_list_projects(client, monkeypatch):
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "list_projects_for_user",
        lambda user_id: [{"id": "proj-1", "name": "Demo"}],
    )
    resp = client.get("/api/v1/projects", headers=AUTH_HEADER)
    data = resp.get_json()
    assert resp.status_code == 200
    assert len(data["projects"]) == 1


def test_get_project_success(client, monkeypatch):
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_project_role",
        lambda project_id, user_id: "viewer",
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_project",
        lambda project_id: {"id": project_id, "name": "Demo"},
    )
    resp = client.get("/api/v1/projects/proj-1", headers=AUTH_HEADER)
    assert resp.status_code == 200
    assert resp.get_json()["id"] == "proj-1"


def test_get_project_forbidden(client, monkeypatch):
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_project_role",
        lambda project_id, user_id: None,
    )
    resp = client.get("/api/v1/projects/proj-1", headers=AUTH_HEADER)
    assert resp.status_code == 403


def test_update_project_success(client, monkeypatch):
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_project_role",
        lambda project_id, user_id: "owner",
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "update_project",
        lambda project_id, name=None, description=None: {
            "id": project_id,
            "name": name or "Demo",
            "description": description,
        },
    )
    resp = client.patch(
        "/api/v1/projects/proj-1",
        json={"name": "Updated"},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 200
    assert resp.get_json()["name"] == "Updated"


def test_update_project_forbidden(client, monkeypatch):
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_project_role",
        lambda project_id, user_id: "collaborator",
    )
    resp = client.patch(
        "/api/v1/projects/proj-1",
        json={"name": "Updated"},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 403


def test_delete_project_success(client, monkeypatch):
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_project_role",
        lambda project_id, user_id: "co-owner",
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "delete_project",
        lambda project_id: True,
    )
    resp = client.delete("/api/v1/projects/proj-1", headers=AUTH_HEADER)
    assert resp.status_code == 200
    assert resp.get_json()["status"] == "deleted"


def test_delete_project_not_found(client, monkeypatch):
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_project_role",
        lambda project_id, user_id: "owner",
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "delete_project",
        lambda project_id: False,
    )
    resp = client.delete("/api/v1/projects/proj-1", headers=AUTH_HEADER)
    assert resp.status_code == 404


def test_delete_project_forbidden(client, monkeypatch):
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_project_role",
        lambda project_id, user_id: "viewer",
    )
    resp = client.delete("/api/v1/projects/proj-1", headers=AUTH_HEADER)
    assert resp.status_code == 403
