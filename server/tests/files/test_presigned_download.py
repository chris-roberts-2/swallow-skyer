import pytest


@pytest.fixture
def mock_permission(monkeypatch):
    def _set(role_return):
        monkeypatch.setattr(
            "app.services.auth.permissions.supabase_client.get_project_role",
            lambda project_id, user_id: role_return,
        )

    return _set


@pytest.fixture
def mock_photo(monkeypatch):
    def _set(record):
        monkeypatch.setattr(
            "app.api_routes.files.supabase_client.get_photo_metadata",
            lambda photo_id: record,
        )

    return _set


@pytest.fixture
def mock_presign(monkeypatch):
    monkeypatch.setattr(
        "app.api_routes.files.r2_client.generate_presigned_url",
        lambda key, expires_in=1200: f"https://signed.example/{key}",
    )


def _auth_headers(token="valid-supabase-token"):
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.parametrize(
    "role",
    ["owner", "co-owner", "collaborator", "viewer"],
)
def test_presign_allows_roles(
    app,
    client,
    mock_permission,
    mock_photo,
    mock_presign,
    mock_supabase_verify,
    role,
):
    mock_permission(role)
    mock_photo({"id": "photo-1", "project_id": "project-1", "r2_path": "projects/project-1/photos/photo-1.jpg"})

    response = client.get(
        "/api/v1/projects/project-1/photos/photo-1/download",
        headers=_auth_headers(),
    )

    assert response.status_code == 200
    assert response.get_json().get("url")


def test_presign_forbidden_role(
    app, client, mock_permission, mock_photo, mock_presign, mock_supabase_verify
):
    mock_permission(None)
    mock_photo({"id": "photo-1", "project_id": "project-1", "r2_path": "projects/project-1/photos/photo-1.jpg"})

    response = client.get(
        "/api/v1/projects/project-1/photos/photo-1/download",
        headers=_auth_headers(),
    )

    assert response.status_code == 403
    assert response.get_json().get("error") == "forbidden"


def test_presign_mismatched_project(
    app, client, mock_permission, mock_photo, mock_presign, mock_supabase_verify
):
    mock_permission("viewer")
    mock_photo({"id": "photo-1", "project_id": "project-2", "r2_path": "projects/project-2/photos/photo-1.jpg"})

    response = client.get(
        "/api/v1/projects/project-1/photos/photo-1/download",
        headers=_auth_headers(),
    )

    assert response.status_code == 403
    assert response.get_json().get("error") == "forbidden"


def test_presign_missing_photo(
    app, client, mock_permission, mock_photo, mock_presign, mock_supabase_verify
):
    mock_permission("viewer")
    mock_photo(None)

    response = client.get(
        "/api/v1/projects/project-1/photos/photo-1/download",
        headers=_auth_headers(),
    )

    assert response.status_code == 404
    assert response.get_json().get("error") == "not_found"

