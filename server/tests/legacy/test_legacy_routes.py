def test_legacy_photos_disabled(client):
    resp = client.get("/api/photos")
    assert resp.status_code == 410
    assert resp.get_json().get("error") == "gone"


def test_legacy_locations_disabled(client):
    resp = client.get("/api/locations")
    assert resp.status_code == 410
    assert resp.get_json().get("error") == "gone"


def test_legacy_users_disabled(client):
    resp = client.get("/api/users")
    assert resp.status_code == 410
    assert resp.get_json().get("error") == "gone"

