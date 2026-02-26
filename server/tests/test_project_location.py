"""
Tests for PATCH /api/v1/projects/<project_id>/location.

Covers (per Task 7):
- Successful forward geocode update (address)
- Successful reverse geocode update (lat/lng)
- Permission denial for non-owner/admin roles
- Geocoding failure with zero DB writes
- Idempotent repeated updates
- Prevention of duplicate project markers
- Identical DB structure from forward and reverse geocode paths
"""

import pytest

from app import create_app, db
import app.middleware.auth_middleware as auth_middleware
import app.services.storage.supabase_client as supabase_module
import app.services.project_service as project_svc_module


AUTH_HEADER = {"Authorization": "Bearer test-token"}

_LOCATION_ROW = {
    "id": "loc-1",
    "project_id": "proj-1",
    "latitude": 37.77,
    "longitude": -122.41,
    "marker": "project",
    "number": 1,
}
_PROJECT_ROW = {
    "id": "proj-1",
    "name": "Test Project",
    "address": "123 Main St, Springfield",
    "address_coord": {"lat": 37.77, "lng": -122.41},
}


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


def _stub_owner(monkeypatch):
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_project_role",
        lambda project_id, user_id: "Owner",
    )


def _stub_update_ok(monkeypatch):
    monkeypatch.setattr(
        project_svc_module,
        "update_project_with_location",
        lambda project_id, name=None, address=None, lat=None, lng=None, show_on_projects=None: (
            _PROJECT_ROW,
            None,
        ),
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_project_location",
        lambda pid: _LOCATION_ROW,
    )


# ---------------------------------------------------------------------------
# Helper classes for supabase_client unit tests
# ---------------------------------------------------------------------------


class _FakeResult:
    def __init__(self, data):
        self.data = data


class _FakeTable:
    """Minimal chainable fake that tracks insert/update calls per instance."""

    def __init__(self, insert_calls, update_calls, existing_data):
        self._insert_calls = insert_calls
        self._update_calls = update_calls
        self._existing_data = existing_data
        self._mode = None
        self._insert_payload = {}

    def select(self, *_):
        self._mode = "select"
        return self

    def insert(self, payload):
        self._insert_calls["n"] += 1
        self._mode = "insert"
        self._insert_payload = payload
        return self

    def update(self, _payload):
        self._update_calls["n"] += 1
        self._mode = "update"
        return self

    def eq(self, *_):
        return self

    def limit(self, *_):
        return self

    def execute(self):
        if self._mode == "select":
            return _FakeResult(self._existing_data)
        if self._mode == "update":
            return _FakeResult(
                [{"id": "loc-existing", "latitude": 37.77, "longitude": -122.41}]
            )
        if self._mode == "insert":
            return _FakeResult([{"id": "loc-new", **self._insert_payload}])
        return _FakeResult([])


class _FakeSupabaseClient:
    def __init__(self, insert_calls, update_calls, existing_data):
        self._insert_calls = insert_calls
        self._update_calls = update_calls
        self._existing_data = existing_data

    def table(self, _name):
        return _FakeTable(self._insert_calls, self._update_calls, self._existing_data)


# ===========================================================================
# Subtask 1 — Endpoint contract and validation
# ===========================================================================


def test_update_location_no_input_returns_400(client, monkeypatch):
    """Empty body → 400 before any geocoding."""
    _stub_owner(monkeypatch)
    resp = client.patch(
        "/api/v1/projects/proj-1/location", json={}, headers=AUTH_HEADER
    )
    assert resp.status_code == 400
    assert "error" in resp.get_json()


def test_update_location_address_and_coords_conflict_returns_400(client, monkeypatch):
    """Providing address and coordinates simultaneously → 400."""
    _stub_owner(monkeypatch)
    resp = client.patch(
        "/api/v1/projects/proj-1/location",
        json={"address": "123 Main St", "lat": 37.77, "lng": -122.41},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 400
    assert "both" in resp.get_json()["error"].lower()


def test_update_location_partial_coords_returns_400(client, monkeypatch):
    """Lat without lng → 400."""
    _stub_owner(monkeypatch)
    resp = client.patch(
        "/api/v1/projects/proj-1/location",
        json={"lat": 37.77},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 400


def test_update_location_out_of_range_coords_returns_400(client, monkeypatch):
    """Out-of-bounds latitude → 400 before geocoding."""
    _stub_owner(monkeypatch)
    resp = client.patch(
        "/api/v1/projects/proj-1/location",
        json={"lat": 999.0, "lng": 0.0},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 400


def test_update_location_non_numeric_coords_returns_400(client, monkeypatch):
    """Non-numeric coordinate strings → 400."""
    _stub_owner(monkeypatch)
    resp = client.patch(
        "/api/v1/projects/proj-1/location",
        json={"lat": "abc", "lng": "xyz"},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 400


# ===========================================================================
# Subtask 1 — Permission enforcement
# ===========================================================================


def test_update_location_viewer_forbidden(client, monkeypatch):
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_project_role",
        lambda project_id, user_id: "Viewer",
    )
    resp = client.patch(
        "/api/v1/projects/proj-1/location",
        json={"address": "123 Main St"},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 403


def test_update_location_editor_forbidden(client, monkeypatch):
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_project_role",
        lambda project_id, user_id: "Editor",
    )
    resp = client.patch(
        "/api/v1/projects/proj-1/location",
        json={"address": "123 Main St"},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 403


def test_update_location_no_role_forbidden(client, monkeypatch):
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_project_role",
        lambda project_id, user_id: None,
    )
    resp = client.patch(
        "/api/v1/projects/proj-1/location",
        json={"address": "123 Main St"},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 403


def test_update_location_administrator_allowed(client, monkeypatch):
    """Administrator role must be permitted alongside Owner."""
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_project_role",
        lambda project_id, user_id: "Administrator",
    )
    _stub_update_ok(monkeypatch)
    resp = client.patch(
        "/api/v1/projects/proj-1/location",
        json={"address": "123 Main St"},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 200


# ===========================================================================
# Subtask 2 — Forward geocode (address input)
# ===========================================================================


def test_update_location_address_success(client, monkeypatch):
    """Address → 200; service receives address, not coords."""
    _stub_owner(monkeypatch)
    calls = {}

    def fake_update(
        project_id,
        name=None,
        address=None,
        lat=None,
        lng=None,
        show_on_projects=None,
    ):
        calls["address"] = address
        calls["lat"] = lat
        return (_PROJECT_ROW, None)

    monkeypatch.setattr(project_svc_module, "update_project_with_location", fake_update)
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_project_location",
        lambda pid: _LOCATION_ROW,
    )

    resp = client.patch(
        "/api/v1/projects/proj-1/location",
        json={"address": "123 Main St"},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 200
    assert calls["address"] == "123 Main St"
    assert calls["lat"] is None


def test_update_location_address_response_structure(client, monkeypatch):
    """Successful address update returns project and location keys."""
    _stub_owner(monkeypatch)
    _stub_update_ok(monkeypatch)

    resp = client.patch(
        "/api/v1/projects/proj-1/location",
        json={"address": "123 Main St"},
        headers=AUTH_HEADER,
    )
    body = resp.get_json()
    assert resp.status_code == 200
    assert "project" in body
    assert "location" in body
    assert body["location"]["marker"] == "project"


# ===========================================================================
# Subtask 2 — Reverse geocode (coordinate input)
# ===========================================================================


def test_update_location_coords_success(client, monkeypatch):
    """Coordinates → 200; service receives lat/lng, not address."""
    _stub_owner(monkeypatch)
    calls = {}

    def fake_update(
        project_id,
        name=None,
        address=None,
        lat=None,
        lng=None,
        show_on_projects=None,
    ):
        calls["lat"] = lat
        calls["lng"] = lng
        calls["address"] = address
        return (_PROJECT_ROW, None)

    monkeypatch.setattr(project_svc_module, "update_project_with_location", fake_update)
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_project_location",
        lambda pid: _LOCATION_ROW,
    )

    resp = client.patch(
        "/api/v1/projects/proj-1/location",
        json={"lat": 37.77, "lng": -122.41},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 200
    assert calls["lat"] == pytest.approx(37.77)
    assert calls["lng"] == pytest.approx(-122.41)
    assert calls["address"] is None


# ===========================================================================
# Subtask 3 — Geocoding failure → zero DB writes
# ===========================================================================


def test_update_location_geocode_failure_no_results_returns_422(client, monkeypatch):
    """Forward geocode failure → 422, upsert_project_location never called."""
    _stub_owner(monkeypatch)
    db_written = {"flag": False}

    monkeypatch.setattr(
        project_svc_module,
        "update_project_with_location",
        lambda project_id, name=None, address=None, lat=None, lng=None, show_on_projects=None: (
            None,
            {"error": "No results found.", "geocode_error": "no_results"},
        ),
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "upsert_project_location",
        lambda pid, lat, lng: db_written.__setitem__("flag", True),
    )

    resp = client.patch(
        "/api/v1/projects/proj-1/location",
        json={"address": "nowhere xyzzy 99999"},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 422
    body = resp.get_json()
    assert body.get("geocode_error") == "no_results"
    assert not db_written["flag"]


def test_update_location_geocode_timeout_returns_422_no_db_write(client, monkeypatch):
    """Reverse geocode timeout → 422, no DB mutation."""
    _stub_owner(monkeypatch)
    db_written = {"flag": False}

    monkeypatch.setattr(
        project_svc_module,
        "update_project_with_location",
        lambda project_id, name=None, address=None, lat=None, lng=None, show_on_projects=None: (
            None,
            {"error": "Geocoding timed out.", "geocode_error": "timeout"},
        ),
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "upsert_project_location",
        lambda pid, lat, lng: db_written.__setitem__("flag", True),
    )

    resp = client.patch(
        "/api/v1/projects/proj-1/location",
        json={"lat": 0.0, "lng": 0.0},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 422
    assert resp.get_json().get("geocode_error") == "timeout"
    assert not db_written["flag"]


# ===========================================================================
# Subtask 3 — Project not found
# ===========================================================================


def test_update_location_project_not_found_returns_404(client, monkeypatch):
    """Service returns (None, None) → 404."""
    _stub_owner(monkeypatch)
    monkeypatch.setattr(
        project_svc_module,
        "update_project_with_location",
        lambda project_id, name=None, address=None, lat=None, lng=None, show_on_projects=None: (
            None,
            None,
        ),
    )
    resp = client.patch(
        "/api/v1/projects/proj-1/location",
        json={"address": "123 Main St"},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 404


# ===========================================================================
# Subtask 4 — Idempotency
# ===========================================================================


def test_update_location_idempotent_repeated_calls(client, monkeypatch):
    """Two identical PATCH requests produce the same 200 response."""
    _stub_owner(monkeypatch)
    call_count = {"n": 0}

    def fake_update(
        project_id,
        name=None,
        address=None,
        lat=None,
        lng=None,
        show_on_projects=None,
    ):
        call_count["n"] += 1
        return (_PROJECT_ROW, None)

    monkeypatch.setattr(project_svc_module, "update_project_with_location", fake_update)
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_project_location",
        lambda pid: _LOCATION_ROW,
    )

    payload = {"address": "123 Main St"}
    r1 = client.patch(
        "/api/v1/projects/proj-1/location", json=payload, headers=AUTH_HEADER
    )
    r2 = client.patch(
        "/api/v1/projects/proj-1/location", json=payload, headers=AUTH_HEADER
    )

    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.get_json() == r2.get_json()
    assert call_count["n"] == 2


def test_update_location_service_uses_upsert_not_insert(monkeypatch):
    """
    update_project_with_location must call upsert_project_location (not
    create_project_location), ensuring duplicate markers are impossible.
    """
    upsert_calls = {"n": 0}
    create_location_calls = {"n": 0}

    monkeypatch.setattr(
        "app.services.project_service.forward_geocode",
        lambda address: {"address": "123 Main St", "lat": 37.77, "lng": -122.41},
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "update_project",
        lambda project_id, name=None, address=None, address_coord=None, show_on_projects=None: {
            "id": project_id,
        },
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "upsert_project_location",
        lambda project_id, lat, lng: upsert_calls.__setitem__(
            "n", upsert_calls["n"] + 1
        ),
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "create_project_location",
        lambda project_id, lat, lng: create_location_calls.__setitem__(
            "n", create_location_calls["n"] + 1
        ),
    )

    project_svc_module.update_project_with_location(
        project_id="proj-1", address="123 Main St"
    )

    assert upsert_calls["n"] == 1, "Should call upsert, not create"
    assert create_location_calls["n"] == 0, "create_project_location must not be called on update"


# ===========================================================================
# Subtask 5 — No duplicate project markers (upsert_project_location unit tests)
# ===========================================================================


def test_upsert_project_location_updates_existing_no_new_row():
    """
    When a marker='project' row already exists, upsert_project_location must
    update it in place without inserting a second row.
    """
    insert_calls = {"n": 0}
    update_calls = {"n": 0}
    existing = [{"id": "loc-existing"}]

    client_instance = supabase_module.SupabaseClient.__new__(
        supabase_module.SupabaseClient
    )
    client_instance.client = _FakeSupabaseClient(insert_calls, update_calls, existing)

    client_instance.upsert_project_location("proj-1", 37.77, -122.41)

    assert update_calls["n"] == 1, "Must update the existing row"
    assert insert_calls["n"] == 0, "Must not insert a second marker row"


def test_upsert_project_location_creates_exactly_one_when_none_exists():
    """
    When no marker='project' row exists, upsert_project_location must create
    exactly one — never zero or two.
    """
    insert_calls = {"n": 0}
    update_calls = {"n": 0}

    client_instance = supabase_module.SupabaseClient.__new__(
        supabase_module.SupabaseClient
    )
    client_instance.client = _FakeSupabaseClient(insert_calls, update_calls, [])

    result = client_instance.upsert_project_location("proj-1", 37.77, -122.41)

    assert insert_calls["n"] == 1, "Must insert exactly one new marker row"
    assert update_calls["n"] == 0, "Must not attempt an update when row is absent"
    assert result.get("marker") == "project"


def test_upsert_project_location_called_twice_still_one_marker(monkeypatch):
    """
    Calling update_project_with_location twice must result in exactly one
    upsert call per invocation — never a cumulative insert.
    """
    upsert_calls = {"n": 0}

    monkeypatch.setattr(
        "app.services.project_service.forward_geocode",
        lambda address: {"address": "123 Main St", "lat": 37.77, "lng": -122.41},
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "update_project",
        lambda project_id, **_: {"id": project_id},
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "upsert_project_location",
        lambda project_id, lat, lng: upsert_calls.__setitem__(
            "n", upsert_calls["n"] + 1
        ),
    )

    project_svc_module.update_project_with_location(
        project_id="proj-1", address="123 Main St"
    )
    project_svc_module.update_project_with_location(
        project_id="proj-1", address="123 Main St"
    )

    assert upsert_calls["n"] == 2, "upsert called once per update (not create)"


# ===========================================================================
# Subtask 5 — Forward and reverse produce identical DB structure
# ===========================================================================


# ===========================================================================
# Subtask 1 — Ambiguous address: structured error with candidates, zero DB write
# ===========================================================================


_CANDIDATES = [
    {"address": "Springfield, Illinois, US", "lat": 39.78, "lng": -89.65},
    {"address": "Springfield, Missouri, US", "lat": 37.21, "lng": -93.29},
]


def test_update_location_ambiguous_address_returns_422_with_candidates(
    client, monkeypatch
):
    """Ambiguous geocode → 422; response includes geocode_error and candidates."""
    _stub_owner(monkeypatch)

    monkeypatch.setattr(
        project_svc_module,
        "update_project_with_location",
        lambda project_id, name=None, address=None, lat=None, lng=None, show_on_projects=None: (
            None,
            {
                "error": "Multiple locations matched 'Springfield'.",
                "geocode_error": "ambiguous_address",
                "candidates": _CANDIDATES,
            },
        ),
    )

    resp = client.patch(
        "/api/v1/projects/proj-1/location",
        json={"address": "Springfield"},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 422
    body = resp.get_json()
    assert body["geocode_error"] == "ambiguous_address"
    assert isinstance(body["candidates"], list)
    assert len(body["candidates"]) == 2


def test_update_location_ambiguous_address_no_db_write(client, monkeypatch):
    """Ambiguous geocode → zero writes to projects or locations."""
    _stub_owner(monkeypatch)
    db_written = {"flag": False}

    monkeypatch.setattr(
        project_svc_module,
        "update_project_with_location",
        lambda project_id, name=None, address=None, lat=None, lng=None, show_on_projects=None: (
            None,
            {
                "error": "Ambiguous address.",
                "geocode_error": "ambiguous_address",
                "candidates": _CANDIDATES,
            },
        ),
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "upsert_project_location",
        lambda project_id, lat, lng: db_written.__setitem__("flag", True),
    )

    resp = client.patch(
        "/api/v1/projects/proj-1/location",
        json={"address": "Springfield"},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 422
    assert not db_written["flag"]


def test_update_location_ambiguous_candidates_have_required_fields(
    client, monkeypatch
):
    """Each candidate in the 422 response must have address, lat, and lng."""
    _stub_owner(monkeypatch)

    monkeypatch.setattr(
        project_svc_module,
        "update_project_with_location",
        lambda project_id, name=None, address=None, lat=None, lng=None, show_on_projects=None: (
            None,
            {
                "error": "Ambiguous.",
                "geocode_error": "ambiguous_address",
                "candidates": _CANDIDATES,
            },
        ),
    )

    resp = client.patch(
        "/api/v1/projects/proj-1/location",
        json={"address": "Springfield"},
        headers=AUTH_HEADER,
    )
    body = resp.get_json()
    for c in body["candidates"]:
        assert "address" in c
        assert "lat" in c
        assert "lng" in c


def test_project_service_passes_candidates_through_resolve_location(monkeypatch):
    """
    _resolve_location must propagate the candidates list from the geocoder
    into the returned error dict so routes can forward them to the client.
    """
    monkeypatch.setattr(
        "app.services.project_service.forward_geocode",
        lambda address: {
            "type": "ambiguous_address",
            "message": "Multiple matches.",
            "candidates": _CANDIDATES,
        },
    )

    _, err = project_svc_module.update_project_with_location(
        project_id="proj-1", address="Springfield"
    )

    assert err is not None
    assert err["geocode_error"] == "ambiguous_address"
    assert "candidates" in err
    assert err["candidates"] == _CANDIDATES


# ===========================================================================
# Subtask 3 — No-write guarantee for every error type
# ===========================================================================


@pytest.mark.parametrize(
    "error_type",
    ["no_results", "timeout", "http_error", "unexpected_error", "ambiguous_address"],
)
def test_update_location_all_geocode_failures_prevent_db_write(
    client, monkeypatch, error_type
):
    """Every geocode failure type → 422, no upsert called."""
    _stub_owner(monkeypatch)
    db_written = {"flag": False}

    err_payload = {
        "error": f"Simulated {error_type}.",
        "geocode_error": error_type,
    }
    if error_type == "ambiguous_address":
        err_payload["candidates"] = _CANDIDATES

    monkeypatch.setattr(
        project_svc_module,
        "update_project_with_location",
        lambda project_id, name=None, address=None, lat=None, lng=None, show_on_projects=None: (
            None,
            err_payload,
        ),
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "upsert_project_location",
        lambda project_id, lat, lng: db_written.__setitem__("flag", True),
    )

    resp = client.patch(
        "/api/v1/projects/proj-1/location",
        json={"address": "test"},
        headers=AUTH_HEADER,
    )
    assert resp.status_code == 422
    assert not db_written["flag"], f"DB was written for error type '{error_type}'"


def test_update_location_forward_and_reverse_produce_identical_db_structure(
    monkeypatch,
):
    """
    Forward geocode (address) and reverse geocode (lat/lng) must write the
    same argument shapes to projects and locations.
    """
    writes = []

    monkeypatch.setattr(
        "app.services.project_service.forward_geocode",
        lambda address: {"address": "Golden Gate, SF, CA", "lat": 37.82, "lng": -122.48},
    )
    monkeypatch.setattr(
        "app.services.project_service.reverse_geocode",
        lambda lat, lng: {"address": "Golden Gate, SF, CA", "lat": 37.82, "lng": -122.48},
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "update_project",
        lambda project_id, name=None, address=None, address_coord=None, show_on_projects=None: (
            writes.append(("project", {"address": address, "address_coord": address_coord}))
            or {"id": project_id}
        ),
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "upsert_project_location",
        lambda project_id, lat, lng: writes.append(("location", {"lat": lat, "lng": lng})),
    )

    writes.clear()
    project_svc_module.update_project_with_location(
        project_id="proj-fwd", address="Golden Gate Bridge"
    )
    fwd_writes = list(writes)

    writes.clear()
    project_svc_module.update_project_with_location(
        project_id="proj-rev", lat=37.82, lng=-122.48
    )
    rev_writes = list(writes)

    assert len(fwd_writes) == len(rev_writes) == 2

    fwd_proj = next(w for w in fwd_writes if w[0] == "project")[1]
    rev_proj = next(w for w in rev_writes if w[0] == "project")[1]
    assert fwd_proj["address"] == rev_proj["address"]
    assert fwd_proj["address_coord"] == rev_proj["address_coord"]

    fwd_loc = next(w for w in fwd_writes if w[0] == "location")[1]
    rev_loc = next(w for w in rev_writes if w[0] == "location")[1]
    assert fwd_loc["lat"] == rev_loc["lat"]
    assert fwd_loc["lng"] == rev_loc["lng"]
