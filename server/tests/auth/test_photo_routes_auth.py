from io import BytesIO

def test_upload_requires_authentication(client):
    response = client.post("/api/photos/upload")
    assert response.status_code == 401


def test_upload_accepts_authenticated_request(client, auth_headers, monkeypatch):
    import app.routes.upload as upload_module

    monkeypatch.setattr(
        upload_module,
        "require_role",
        lambda project_id, roles: {"user_id": "user-1"},
        raising=True,
    )
    data = {
        "file": (BytesIO(b"mock-bytes"), "photo.jpg"),
        "project_id": "11111111-1111-1111-1111-111111111111",
    }
    response = client.post(
        "/api/photos/upload",
        data=data,
        headers=auth_headers,
        content_type="multipart/form-data",
    )
    assert response.status_code in {400, 500}


def test_get_photos_by_location_requires_auth(client):
    response = client.get("/api/v1/photos/location?lat=1&lng=2")
    assert response.status_code == 401


def test_get_photos_by_location_with_token(client, auth_headers):
    response = client.get("/api/v1/photos/location?lat=1&lng=2", headers=auth_headers)
    assert response.status_code == 410


def test_invalid_token_rejected_for_upload(client):
    data = {
        "file": (BytesIO(b"mock-bytes"), "photo.jpg"),
        "project_id": "11111111-1111-1111-1111-111111111111",
    }
    response = client.post(
        "/api/photos/upload",
        data=data,
        headers={"Authorization": "Bearer expired-token"},
        content_type="multipart/form-data",
    )
    assert response.status_code == 401
