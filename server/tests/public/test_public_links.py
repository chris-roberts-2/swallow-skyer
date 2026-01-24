import secrets
from datetime import datetime, timedelta, timezone

import pytest

from app.services.storage.supabase_client import supabase_client
from app.services.storage.r2_client import r2_client


class FakeResult:
    def __init__(self, data=None):
        self.data = data or []


class FakeTable:
    def __init__(self, name, storage):
        self.name = name
        self.storage = storage
        self._filters = []
        self._payload = None
        self._op = "select"

    def select(self, *_args, **_kwargs):
        if self._op != "insert":
            self._op = "select"
        return self

    def eq(self, key, value):
        self._filters.append((key, value))
        return self

    def maybe_single(self):
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = payload
        return self

    def delete(self):
        self._op = "delete"
        return self

    def execute(self):
        records = self.storage.setdefault(self.name, [])
        if self._op == "insert":
            record = dict(self._payload)
            record["id"] = record.get("id") or f"{self.name}-{len(records)+1}"
            records.append(record)
            return FakeResult([record])

        filtered = [
            row
            for row in records
            if all(row.get(k) == v for k, v in self._filters)
        ]

        if self._op == "delete":
            remaining = [
                row
                for row in records
                if not all(row.get(k) == v for k, v in self._filters)
            ]
            self.storage[self.name] = remaining
            return FakeResult([])

        return FakeResult(filtered)


class FakeClient:
    def __init__(self, storage):
        self.storage = storage

    def table(self, name):
        return FakeTable(name, self.storage)


@pytest.fixture(autouse=True)
def patch_supabase(monkeypatch):
    storage = {"project_public_links": [], "projects": [], "photos": []}
    supabase_client.client = FakeClient(storage)
    return storage


@pytest.fixture(autouse=True)
def patch_presign(monkeypatch):
    monkeypatch.setattr(
        r2_client, "generate_presigned_url", lambda key, expires_in=900: f"https://signed/{key}"
    )


def test_create_link_owner_only(client, auth_headers, monkeypatch):
    monkeypatch.setattr(
        "app.services.auth.permissions.supabase_client.get_project_role",
        lambda project_id, user_id: "Owner",
    )
    resp = client.post(
        "/api/v1/projects/proj-1/public-links",
        json={"expires_at": None},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.get_json()
    assert data["token"]
    assert len(data["token"]) >= 32
    assert data["url"].endswith(data["token"])


def test_create_link_forbidden_for_editor(client, auth_headers, monkeypatch):
    monkeypatch.setattr(
        "app.services.auth.permissions.supabase_client.get_project_role",
        lambda project_id, user_id: "Editor",
    )
    resp = client.post(
        "/api/v1/projects/proj-1/public-links",
        json={},
        headers=auth_headers,
    )
    assert resp.status_code == 403


def test_public_photos_respects_expiration(client, monkeypatch, patch_supabase):
    expires_at = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    token = "expired-token"
    patch_supabase["project_public_links"].append(
        {"id": "link-1", "project_id": "proj-1", "token": token, "expires_at": expires_at}
    )
    resp = client.get(f"/api/v1/public/{token}/photos")
    assert resp.status_code == 410


def test_public_photos_returns_sanitized(client, monkeypatch, patch_supabase):
    token = "good-token"
    patch_supabase["project_public_links"].append(
        {"id": "link-1", "project_id": "proj-1", "token": token, "expires_at": None}
    )
    monkeypatch.setattr(
        "app.api_routes.public_links.supabase_client.fetch_project_photos",
        lambda **kwargs: {
            "data": [
                {"id": "p1", "project_id": "proj-1", "user_id": "u1", "r2_url": "u", "thumbnail_r2_url": "t"}
            ]
        },
    )

    resp = client.get(f"/api/v1/public/{token}/photos")
    assert resp.status_code == 200
    photos = resp.get_json()["photos"]
    assert photos[0]["id"] == "p1"
    assert "user_id" not in photos[0]


def test_public_download_matches_project(client, monkeypatch, patch_supabase):
    token = "good-token"
    patch_supabase["project_public_links"].append(
        {"id": "link-1", "project_id": "proj-1", "token": token, "expires_at": None}
    )
    monkeypatch.setattr(
        "app.api_routes.public_links.supabase_client.get_photo_metadata",
        lambda photo_id: {"id": photo_id, "project_id": "proj-1", "r2_path": "projects/proj-1/photos/a.jpg"},
    )

    resp = client.get(f"/api/v1/public/{token}/photos/a/download")
    assert resp.status_code == 200
    assert resp.get_json()["url"].startswith("https://signed/")


def test_public_download_rejects_cross_project(client, monkeypatch, patch_supabase):
    token = "good-token"
    patch_supabase["project_public_links"].append(
        {"id": "link-1", "project_id": "proj-1", "token": token, "expires_at": None}
    )
    monkeypatch.setattr(
        "app.api_routes.public_links.supabase_client.get_photo_metadata",
        lambda photo_id: {"id": photo_id, "project_id": "other", "r2_path": "projects/other/photos/a.jpg"},
    )

    resp = client.get(f"/api/v1/public/{token}/photos/a/download")
    assert resp.status_code == 403


def test_public_download_expired(client, patch_supabase):
    expires_at = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    token = "expired-download"
    patch_supabase["project_public_links"].append(
        {"id": "link-2", "project_id": "proj-1", "token": token, "expires_at": expires_at}
    )
    resp = client.get(f"/api/v1/public/{token}/photos/a/download")
    assert resp.status_code == 410

