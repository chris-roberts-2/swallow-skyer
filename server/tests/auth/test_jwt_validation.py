def test_protected_route_requires_auth(client):
    response = client.get("/api/v1/photos/")
    assert response.status_code == 401
    assert "Authorization" in response.get_json()["error"]


def test_protected_route_accepts_valid_supabase_token(client, auth_headers, monkeypatch):
    from app.services.storage import supabase_client as supabase_module

    monkeypatch.setattr(
        supabase_module.supabase_client,
        "get_project_role",
        lambda project_id, user_id: "Viewer",
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "fetch_project_photos",
        lambda **kwargs: {"data": [], "count": 0},
    )
    monkeypatch.setattr(
        supabase_module.supabase_client,
        "extract_thumbnail_fields",
        lambda record: (None, None),
    )

    response = client.get(
        "/api/v1/photos/?project_id=11111111-1111-1111-1111-111111111111",
        headers=auth_headers,
    )
    assert response.status_code == 200


def test_invalid_supabase_token_is_rejected(client, mock_supabase_verify):
    response = client.get(
        "/api/v1/photos/", headers={"Authorization": "Bearer expired-token"}
    )
    assert response.status_code == 401
    assert "Supabase" in response.get_json()["error"]


