from io import BytesIO

from app.api_routes.v1 import photos as photos_module


def test_upload_requires_authentication(client):
    response = client.post("/api/v1/photos/upload")
    assert response.status_code == 401


def test_upload_accepts_authenticated_request(client, auth_headers, monkeypatch):
    class DummyPhoto:
        def to_dict(self):
            return {"id": 1, "url": "https://example.com/photo.jpg"}

    monkeypatch.setattr(
        photos_module, "validate_photo_data", lambda *args, **kwargs: {"valid": True}
    )
    monkeypatch.setattr(
        photos_module.photo_service, "process_upload", lambda **kwargs: DummyPhoto()
    )

    data = {
        "file": (BytesIO(b"mock-bytes"), "photo.jpg"),
        "latitude": "1.0",
        "longitude": "-1.0",
    }

    response = client.post(
        "/api/v1/photos/upload",
        data=data,
        headers=auth_headers,
        content_type="multipart/form-data",
    )
    assert response.status_code == 201
    assert response.get_json()["photo"]["id"] == 1


def test_get_photos_by_location_requires_auth(client):
    response = client.get("/api/v1/photos/location?lat=1&lng=2")
    assert response.status_code == 401


def test_get_photos_by_location_with_token(client, auth_headers):
    response = client.get("/api/v1/photos/location?lat=1&lng=2", headers=auth_headers)
    # Missing latitude/longitude will be handled by endpoint, but auth should pass
    assert response.status_code in {200, 400}


def test_invalid_token_rejected_for_upload(client, monkeypatch):
    monkeypatch.setattr(
        photos_module, "validate_photo_data", lambda *args, **kwargs: {"valid": True}
    )
    data = {
        "file": (BytesIO(b"mock-bytes"), "photo.jpg"),
        "latitude": "1.0",
        "longitude": "-1.0",
    }
    response = client.post(
        "/api/v1/photos/upload",
        data=data,
        headers={"Authorization": "Bearer expired-token"},
        content_type="multipart/form-data",
    )
    assert response.status_code == 401
