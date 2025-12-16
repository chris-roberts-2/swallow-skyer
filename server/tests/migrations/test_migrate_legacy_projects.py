import pytest

from app.services.storage.supabase_client import supabase_client
from scripts.migrate_legacy_projects import run


class FakeResult:
    def __init__(self, data=None):
        self.data = data or []


class FakeTable:
    def __init__(self, name, storage, counters):
        self.name = name
        self.storage = storage
        self.counters = counters
        self.filters = []
        self.operation = "select"
        self.payload = None

    def select(self, *fields, **kwargs):
        self.operation = "select"
        return self

    def eq(self, key, value):
        self.filters.append(("eq", key, value))
        return self

    def in_(self, key, values):
        self.filters.append(("in", key, set(values)))
        return self

    def insert(self, payload):
        self.operation = "insert"
        self.payload = payload
        return self

    def update(self, payload):
        self.operation = "update"
        self.payload = payload
        return self

    def execute(self):
        records = self.storage.setdefault(self.name, [])
        if self.operation == "select":
            data = [record for record in records if self._matches(record)]
            return FakeResult(data)

        if self.operation == "insert":
            record = dict(self.payload)
            next_id = self.counters.get(self.name, 1)
            record_id = record.get("id") or f"{self.name}-{next_id}"
            self.counters[self.name] = next_id + 1
            record["id"] = record_id
            records.append(record)
            return FakeResult([record])

        if self.operation == "update":
            updated = []
            for record in records:
                if self._matches(record):
                    record.update(self.payload or {})
                    updated.append(dict(record))
            return FakeResult(updated)

        return FakeResult([])

    def _matches(self, record):
        for op, key, value in self.filters:
            if op == "eq":
                if record.get(key) != value:
                    return False
            elif op == "in":
                if record.get(key) not in value:
                    return False
        return True


class FakeClient:
    def __init__(self, storage):
        self.storage = storage
        self.counters = {}

    def table(self, name):
        return FakeTable(name, self.storage, self.counters)


def _patch_supabase(monkeypatch, storage):
    client = FakeClient(storage)
    monkeypatch.setattr(supabase_client, "client", client)
    return storage


def test_creates_default_project_per_user_and_fallback(monkeypatch):
    storage = {
        "users": [
            {"id": "user-1", "email": "one@example.com"},
            {"id": "user-2", "email": "two@example.com"},
        ],
        "projects": [],
        "project_members": [],
        "photos": [
            {"id": "photo-1", "user_id": "user-1"},
            {"id": "photo-2", "user_id": "user-1"},
            {"id": "photo-3", "user_id": "user-2"},
            {"id": "photo-4", "user_id": None},
            {"id": "photo-5", "user_id": "missing"},
        ],
    }

    _patch_supabase(monkeypatch, storage)
    run()

    assert len(storage["projects"]) == 3

    for user in storage["users"]:
        expected_name = f"{user['email']} – Default Project"
        matches = [
            project
            for project in storage["projects"]
            if project["owner_id"] == user["id"] and project["name"] == expected_name
        ]
        assert matches, f"Missing project for {user['id']}"

    fallback_projects = [
        project for project in storage["projects"] if project["name"] == "Unassigned – Legacy Import"
    ]
    assert len(fallback_projects) == 1
    fallback_id = fallback_projects[0]["id"]

    orphan_photos = [photo for photo in storage["photos"] if photo["id"] in {"photo-4", "photo-5"}]
    for photo in orphan_photos:
        assert photo["project_id"] == fallback_id

    user_photos = [photo for photo in storage["photos"] if photo["user_id"] in {"user-1", "user-2"}]
    for photo in user_photos:
        assert photo["project_id"] in [project["id"] for project in storage["projects"]]


def test_idempotent_run(monkeypatch):
    storage = {
        "users": [
            {"id": "user-1", "email": "user@example.com"},
        ],
        "projects": [],
        "project_members": [],
        "photos": [
            {"id": "photo-1", "user_id": "user-1"},
            {"id": "photo-2", "user_id": None},
        ],
    }

    _patch_supabase(monkeypatch, storage)
    run()
    initial_projects = [dict(project) for project in storage["projects"]]
    initial_photos = [dict(photo) for photo in storage["photos"]]

    run()

    assert len(storage["projects"]) == len(initial_projects)
    assert len(storage["photos"]) == len(initial_photos)
    for photo, initial in zip(storage["photos"], initial_photos):
        assert photo["project_id"] == initial["project_id"]

