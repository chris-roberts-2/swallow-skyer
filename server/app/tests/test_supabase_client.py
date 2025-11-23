from types import SimpleNamespace

import pytest

from app import supabase_client


@pytest.fixture(autouse=True)
def reset_clients():
    supabase_client.reset_supabase_clients()
    yield
    supabase_client.reset_supabase_clients()


def test_get_service_role_client_initializes(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key")

    created_client = SimpleNamespace(auth=SimpleNamespace(get_user=lambda _: None))
    captured = {}

    def fake_create(url, key):
        captured["url"] = url
        captured["key"] = key
        return created_client

    monkeypatch.setattr(supabase_client, "create_client", fake_create)

    client = supabase_client.get_service_role_client(refresh=True)

    assert client is created_client
    assert captured == {
        "url": "https://example.supabase.co",
        "key": "service-role-key",
    }


def test_get_anon_supabase_client_initializes(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon-key")

    anon_client = SimpleNamespace(auth=SimpleNamespace(get_user=lambda _: None))
    monkeypatch.setattr(supabase_client, "create_client", lambda *_: anon_client)

    client = supabase_client.get_anon_supabase_client(refresh=True)

    assert client is anon_client


def test_verify_supabase_jwt_returns_user(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key")

    user_payload = {"id": "123", "email": "test@example.com"}

    fake_response = SimpleNamespace(user=user_payload)
    fake_client = SimpleNamespace(
        auth=SimpleNamespace(get_user=lambda token: fake_response)
    )
    monkeypatch.setattr(supabase_client, "create_client", lambda *_: fake_client)

    result = supabase_client.verify_supabase_jwt("token-abc")

    assert result == user_payload


def test_verify_supabase_jwt_requires_token():
    with pytest.raises(ValueError):
        supabase_client.verify_supabase_jwt("")
