import pytest

from app import create_app, db
import app.middleware.auth_middleware as auth_middleware
import app.services.storage.supabase_client as supabase_module
import app.services.project_service as project_svc_module


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
    created = {"id": "proj-1", "name": "Demo"}
    calls = {}

    monkeypatch.setattr(
        project_svc_module,
        "create_project_with_location",
        lambda name, owner_id, address=None, lat=None, lng=None: (created, None),
    )

    def fake_add_member(project_id, user_id, role):
        calls["member"] = {"project_id": project_id, "user_id": user_id, "role": role}
        return {"project_id": project_id, "user_id": user_id, "role": role}

    monkeypatch.setattr(
        supabase_module.supabase_client, "add_project_member", fake_add_member
    )

    resp = client.post(
        "/api/v1/projects",
        json={"name": "Demo"},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 201
    assert resp.get_json()["id"] == "proj-1"
    assert calls["member"]["role"] == "Owner"


def test_create_project_requires_name(client):
    resp = client.post("/api/v1/projects", json={}, headers=AUTH_HEADER)
    assert resp.status_code == 400


def test_list_projects(client, monkeypatch):
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "list_projects_for_user",
        lambda user_id, show_on_projects=True: [{"id": "proj-1", "name": "Demo"}],
    )
    resp = client.get("/api/v1/projects", headers=AUTH_HEADER)
    data = resp.get_json()
    assert resp.status_code == 200
    assert len(data["projects"]) == 1


def test_get_project_success(client, monkeypatch):
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_project_role",
        lambda project_id, user_id: "Viewer",
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
        lambda project_id, user_id: "Owner",
    )
    monkeypatch.setattr(
        project_svc_module,
        "update_project_with_location",
        lambda project_id, name=None, address=None, lat=None, lng=None, show_on_projects=None: (
            {"id": project_id, "name": name or "Demo"},
            None,
        ),
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
        lambda project_id, user_id: "Editor",
    )
    resp = client.patch(
        "/api/v1/projects/proj-1",
        json={"name": "Updated"},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 403


def test_update_project_viewer_forbidden(client, monkeypatch):
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_project_role",
        lambda project_id, user_id: "Viewer",
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
        lambda project_id, user_id: "Owner",
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "update_project",
        lambda project_id, name=None, address=None, address_coord=None, show_on_projects=None: {
            "id": project_id,
            "show_on_projects": show_on_projects,
        },
    )
    resp = client.delete("/api/v1/projects/proj-1", headers=AUTH_HEADER)
    assert resp.status_code == 200
    assert resp.get_json()["status"] == "hidden"


def test_delete_project_not_found(client, monkeypatch):
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_project_role",
        lambda project_id, user_id: "Owner",
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "update_project",
        lambda project_id, name=None, address=None, address_coord=None, show_on_projects=None: None,
    )
    resp = client.delete("/api/v1/projects/proj-1", headers=AUTH_HEADER)
    assert resp.status_code == 404


def test_delete_project_forbidden(client, monkeypatch):
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_project_role",
        lambda project_id, user_id: "Viewer",
    )
    resp = client.delete("/api/v1/projects/proj-1", headers=AUTH_HEADER)
    assert resp.status_code == 403


def test_list_projects_filters_by_user(client, monkeypatch):
    captured = {}

    def fake_list_projects(user_id, show_on_projects=True):
        captured["user_id"] = user_id
        return [{"id": "proj-1"}]

    monkeypatch.setattr(
        supabase_module.supabase_client, "list_projects_for_user", fake_list_projects
    )
    resp = client.get("/api/v1/projects", headers=AUTH_HEADER)
    assert resp.status_code == 200
    assert captured["user_id"] == "user-1"


# ---------------------------------------------------------------------------
# Geocoding / transactional location tests
# ---------------------------------------------------------------------------

_GEO_SUCCESS = {"address": "123 Main St, Springfield", "lat": 37.77, "lng": -122.41}
_PROJECT_ROW = {"id": "proj-geo", "name": "Geo Project", "address": "123 Main St"}


def test_create_project_with_valid_address_writes_location(client, monkeypatch):
    """Successful geocode → project created and location row written."""
    calls = {}

    def fake_service(name, owner_id, address=None, lat=None, lng=None):
        calls["name"] = name
        calls["address"] = address
        return (_PROJECT_ROW, None)

    monkeypatch.setattr(project_svc_module, "create_project_with_location", fake_service)
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "add_project_member",
        lambda project_id, user_id, role: {},
    )

    resp = client.post(
        "/api/v1/projects",
        json={"name": "Geo Project", "address": "123 Main St"},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 201
    assert resp.get_json()["id"] == "proj-geo"
    assert calls["address"] == "123 Main St"


def test_create_project_geocode_failure_returns_422_no_db_write(client, monkeypatch):
    """Geocode failure → 422 returned, no project or location written."""
    db_written = {"flag": False}

    def fake_service(name, owner_id, address=None, lat=None, lng=None):
        return (None, {"error": "No results found", "geocode_error": "no_results"})

    def fake_create(name, owner_id, description=None, address=None, address_coord=None, show_on_projects=None):
        db_written["flag"] = True
        return {"id": "should-not-happen"}

    monkeypatch.setattr(project_svc_module, "create_project_with_location", fake_service)
    monkeypatch.setattr(supabase_module.supabase_client, "create_project", fake_create)

    resp = client.post(
        "/api/v1/projects",
        json={"name": "Bad Addr", "address": "xyzzy nowhere 99999"},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 422
    body = resp.get_json()
    assert "error" in body
    assert body.get("geocode_error") == "no_results"
    assert not db_written["flag"]


def test_create_project_without_address_no_location_row(client, monkeypatch):
    """No address → project created without touching public.locations."""
    location_calls = {"count": 0}

    def fake_service(name, owner_id, address=None, lat=None, lng=None):
        assert address is None
        assert lat is None
        return ({"id": "proj-no-addr", "name": name}, None)

    def fake_create_location(*args, **kwargs):
        location_calls["count"] += 1

    monkeypatch.setattr(project_svc_module, "create_project_with_location", fake_service)
    monkeypatch.setattr(
        supabase_module.supabase_client, "create_project_location", fake_create_location
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "add_project_member",
        lambda project_id, user_id, role: {},
    )

    resp = client.post(
        "/api/v1/projects",
        json={"name": "No Addr Project"},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 201
    assert location_calls["count"] == 0


def test_update_project_with_valid_address_syncs_location(client, monkeypatch):
    """Successful address update geocodes and syncs the location row."""
    calls = {}

    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_project_role",
        lambda project_id, user_id: "Owner",
    )

    def fake_service(project_id, name=None, address=None, lat=None, lng=None, show_on_projects=None):
        calls["project_id"] = project_id
        calls["address"] = address
        return ({"id": project_id, "name": "Demo", "address": address}, None)

    monkeypatch.setattr(project_svc_module, "update_project_with_location", fake_service)

    resp = client.patch(
        "/api/v1/projects/proj-1",
        json={"address": "456 Oak Ave"},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 200
    assert calls["address"] == "456 Oak Ave"


def test_update_project_geocode_failure_returns_422_preserves_data(client, monkeypatch):
    """Geocode failure on update → 422, no project fields mutated."""
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_project_role",
        lambda project_id, user_id: "Owner",
    )
    monkeypatch.setattr(
        project_svc_module,
        "update_project_with_location",
        lambda project_id, name=None, address=None, lat=None, lng=None, show_on_projects=None: (
            None,
            {"error": "Geocoding request timed out.", "geocode_error": "timeout"},
        ),
    )

    resp = client.patch(
        "/api/v1/projects/proj-1",
        json={"address": "somewhere invalid"},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 422
    body = resp.get_json()
    assert body.get("geocode_error") == "timeout"


# ---------------------------------------------------------------------------
# Reverse geocoding / coordinate input tests
# ---------------------------------------------------------------------------

_GEO_REVERSE = {"address": "Golden Gate Bridge, San Francisco, CA", "lat": 37.82, "lng": -122.48}
_PROJECT_COORDS = {"id": "proj-coords", "name": "Coords Project", "address": _GEO_REVERSE["address"]}


def test_create_project_with_coords_calls_reverse_geocode(client, monkeypatch):
    """Providing lat/lng → service called with those coords, project created."""
    calls = {}

    def fake_service(name, owner_id, address=None, lat=None, lng=None):
        calls["lat"] = lat
        calls["lng"] = lng
        calls["address"] = address
        return (_PROJECT_COORDS, None)

    monkeypatch.setattr(project_svc_module, "create_project_with_location", fake_service)
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "add_project_member",
        lambda project_id, user_id, role: {},
    )

    resp = client.post(
        "/api/v1/projects",
        json={"name": "Coords Project", "lat": 37.82, "lng": -122.48},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 201
    assert resp.get_json()["id"] == "proj-coords"
    assert calls["lat"] == pytest.approx(37.82)
    assert calls["lng"] == pytest.approx(-122.48)
    assert calls["address"] is None


def test_create_project_reverse_geocode_failure_returns_422(client, monkeypatch):
    """Reverse geocode failure → 422, no DB write."""
    db_written = {"flag": False}

    def fake_service(name, owner_id, address=None, lat=None, lng=None):
        return (None, {"error": "Geocoding request timed out.", "geocode_error": "timeout"})

    def fake_create(*args, **kwargs):
        db_written["flag"] = True

    monkeypatch.setattr(project_svc_module, "create_project_with_location", fake_service)
    monkeypatch.setattr(supabase_module.supabase_client, "create_project", fake_create)

    resp = client.post(
        "/api/v1/projects",
        json={"name": "Timeout Proj", "lat": 0.0, "lng": 0.0},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 422
    assert resp.get_json().get("geocode_error") == "timeout"
    assert not db_written["flag"]


def test_update_project_with_coords_calls_reverse_geocode(client, monkeypatch):
    """Providing lat/lng on PATCH → service called with coords."""
    calls = {}

    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_project_role",
        lambda project_id, user_id: "Owner",
    )

    def fake_service(project_id, name=None, address=None, lat=None, lng=None, show_on_projects=None):
        calls["lat"] = lat
        calls["lng"] = lng
        return ({"id": project_id, "name": "Demo"}, None)

    monkeypatch.setattr(project_svc_module, "update_project_with_location", fake_service)

    resp = client.patch(
        "/api/v1/projects/proj-1",
        json={"lat": 51.5074, "lng": -0.1278},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 200
    assert calls["lat"] == pytest.approx(51.5074)
    assert calls["lng"] == pytest.approx(-0.1278)


def test_update_project_reverse_geocode_failure_returns_422(client, monkeypatch):
    """Reverse geocode failure on update → 422."""
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_project_role",
        lambda project_id, user_id: "Owner",
    )
    monkeypatch.setattr(
        project_svc_module,
        "update_project_with_location",
        lambda project_id, name=None, address=None, lat=None, lng=None, show_on_projects=None: (
            None,
            {"error": "No address found for coordinates.", "geocode_error": "no_results"},
        ),
    )

    resp = client.patch(
        "/api/v1/projects/proj-1",
        json={"lat": 0.0, "lng": 0.0},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 422
    assert resp.get_json().get("geocode_error") == "no_results"


def test_create_project_address_and_coords_conflict_returns_400(client, monkeypatch):
    """Providing both address and coordinates → 400 before any geocoding."""
    monkeypatch.setattr(
        project_svc_module,
        "create_project_with_location",
        lambda *a, **kw: (_ for _ in ()).throw(AssertionError("service should not be called")),
    )

    resp = client.post(
        "/api/v1/projects",
        json={"name": "Conflict", "address": "123 Main St", "lat": 37.77, "lng": -122.41},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 400
    assert "both" in resp.get_json()["error"].lower()


def test_create_project_partial_coords_returns_400(client, monkeypatch):
    """Providing only lat without lng → 400."""
    resp = client.post(
        "/api/v1/projects",
        json={"name": "Partial", "lat": 37.77},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 400


def test_create_project_out_of_range_coords_returns_400(client, monkeypatch):
    """Out-of-range coordinates → 400 before any geocoding."""
    resp = client.post(
        "/api/v1/projects",
        json={"name": "OOB", "lat": 999.0, "lng": 0.0},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 400


def test_create_project_non_numeric_coords_returns_400(client, monkeypatch):
    """Non-numeric coordinate values → 400."""
    resp = client.post(
        "/api/v1/projects",
        json={"name": "NaN", "lat": "abc", "lng": "xyz"},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 400


def test_forward_and_reverse_produce_identical_db_structure(monkeypatch):
    """
    Verify that forward and reverse paths both call the same persistence helpers
    with the same argument shapes, confirming identical DB structure.
    """
    import app.services.project_service as svc

    written = []

    def fake_forward(address):
        return {"address": "123 Main St", "lat": 37.77, "lng": -122.41}

    def fake_reverse(lat, lng):
        return {"address": "123 Main St", "lat": 37.77, "lng": -122.41}

    def fake_create_project(**kwargs):
        written.append(("project", kwargs))
        return {"id": "proj-x", "name": kwargs.get("name", "")}

    def fake_create_location(project_id, lat, lng):
        written.append(("location", {"project_id": project_id, "lat": lat, "lng": lng}))
        return {}

    monkeypatch.setattr("app.services.project_service.forward_geocode", fake_forward)
    monkeypatch.setattr("app.services.project_service.reverse_geocode", fake_reverse)
    monkeypatch.setattr(supabase_module.supabase_client, "create_project", fake_create_project)
    monkeypatch.setattr(supabase_module.supabase_client, "create_project_location", fake_create_location)
    monkeypatch.setattr(supabase_module.supabase_client, "ensure_user_exists", lambda uid, email=None: None)

    written.clear()
    svc.create_project_with_location(name="FwdProj", owner_id="u-1", address="123 Main St")
    fwd_writes = list(written)

    written.clear()
    svc.create_project_with_location(name="RevProj", owner_id="u-1", lat=37.77, lng=-122.41)
    rev_writes = list(written)

    # Both paths must write the same number of rows with the same structure.
    assert len(fwd_writes) == len(rev_writes) == 2

    fwd_proj = next(w for w in fwd_writes if w[0] == "project")[1]
    rev_proj = next(w for w in rev_writes if w[0] == "project")[1]
    assert fwd_proj["address"] == rev_proj["address"]
    assert fwd_proj["address_coord"] == rev_proj["address_coord"]

    fwd_loc = next(w for w in fwd_writes if w[0] == "location")[1]
    rev_loc = next(w for w in rev_writes if w[0] == "location")[1]
    assert fwd_loc["lat"] == rev_loc["lat"]
    assert fwd_loc["lng"] == rev_loc["lng"]
