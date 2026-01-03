import io
from types import SimpleNamespace
import pytest


def test_reverse_geocoder_returns_structured_fields(monkeypatch):
    from app.services.geocoding import reverse_geocoder

    monkeypatch.setattr(
        reverse_geocoder,
        "requests",
        None,
        raising=True,
    )
    result = reverse_geocoder.reverse_geocode(10.0, -20.0)
    assert set(result.keys()) == {"city", "state", "country"}


def test_new_location_row_enriches_geocode(monkeypatch):
    from app.services.storage import supabase_client as supabase_module
    import app.services.storage.supabase_client as supabase_client_module

    calls = {"update": []}
    generated_ids = {"counter": 0}

    class FakeTable:
        def __init__(self, name, existing=False):
            self.name = name
            self._existing = existing
            self._payload = None

        def select(self, *args, **kwargs):
            return self

        def eq(self, *args, **kwargs):
            return self

        def limit(self, *args, **kwargs):
            return self

        def execute(self):
            if self.name == "locations" and self._existing:
                return SimpleNamespace(data=[{"id": "loc-existing"}])
            if self.name == "locations" and self._payload is not None:
                generated_ids["counter"] += 1
                return SimpleNamespace(
                    data=[{"id": f"loc-new-{generated_ids['counter']}"}]
                )
            return SimpleNamespace(data=[])

        def insert(self, payload):
            self._payload = payload
            return self

        def update(self, payload):
            calls["update"].append(payload)
            return self

        def maybe_single(self):
            return self

    class FakeClient:
        def table(self, name):
            return FakeTable(name, existing=False)

    supabase_module.supabase_client.client = FakeClient()
    supabase_module.supabase_client._location_geocode_columns = True
    monkeypatch.setattr(
        supabase_client_module,
        "reverse_geocode",
        lambda lat, lon: {"city": "City", "state": "State", "country": "Country"},
        raising=True,
    )

    loc_id = supabase_module.supabase_client.get_or_create_location(1.0, 2.0)
    assert loc_id is not None
    assert calls["update"]
    assert calls["update"][0]["city"] == "City"


def test_existing_location_not_regeocoded(monkeypatch):
    from app.services.storage import supabase_client as supabase_module
    import app.services.storage.supabase_client as supabase_client_module

    calls = {"reverse": 0}

    class FakeTable:
        def __init__(self, name, existing=True):
            self.name = name
            self._existing = existing
            self._payload = None

        def select(self, *args, **kwargs):
            return self

        def eq(self, *args, **kwargs):
            return self

        def limit(self, *args, **kwargs):
            return self

        def execute(self):
            if self.name == "locations" and self._existing:
                return SimpleNamespace(data=[{"id": "loc-existing"}])
            if self.name == "locations" and self._payload is not None:
                return SimpleNamespace(data=[{"id": "loc-new"}])
            return SimpleNamespace(data=[])

        def maybe_single(self):
            return self

    class FakeClient:
        def table(self, name):
            return FakeTable(name, existing=True)

    supabase_module.supabase_client.client = FakeClient()
    supabase_module.supabase_client._location_geocode_columns = True
    monkeypatch.setattr(
        supabase_client_module,
        "reverse_geocode",
        lambda lat, lon: calls.__setitem__("reverse", calls["reverse"] + 1),
        raising=True,
    )

    loc_id = supabase_module.supabase_client.get_or_create_location(1.0, 2.0)
    assert loc_id == "loc-existing"
    assert calls["reverse"] == 0

