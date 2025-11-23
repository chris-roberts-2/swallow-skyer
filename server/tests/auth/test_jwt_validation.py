def test_protected_route_requires_auth(client):
    response = client.get("/api/v1/photos/")
    assert response.status_code == 401
    assert "Authorization" in response.get_json()["error"]


def test_protected_route_accepts_valid_supabase_token(client, auth_headers):
    response = client.get("/api/v1/photos/", headers=auth_headers)
    assert response.status_code == 200


def test_invalid_supabase_token_is_rejected(client, mock_supabase_verify):
    response = client.get(
        "/api/v1/photos/", headers={"Authorization": "Bearer expired-token"}
    )
    assert response.status_code == 401
    assert "Supabase" in response.get_json()["error"]


def test_me_endpoint_returns_supabase_user(client, auth_headers):
    response = client.get("/api/auth/me", headers=auth_headers)
    assert response.status_code == 200
    payload = response.get_json()["user"]
    assert payload["email"] == "pilot@example.com"
    assert payload["id"] == "user-123"
