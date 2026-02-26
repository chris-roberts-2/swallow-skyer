"""
Unit tests for the Nominatim geocoding service.

All HTTP calls are mocked — tests are deterministic and offline.
"""

from unittest.mock import MagicMock

import pytest
import requests as requests_lib

from app.services.geocoding.nominatim_client import (
    forward_geocode,
    reverse_geocode,
    _is_ambiguous,
    _extract_candidates,
    _haversine_km,
)


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

_FORWARD_SUCCESS_PAYLOAD = [
    {
        "lat": "37.7749",
        "lon": "-122.4194",
        "display_name": "San Francisco, California, United States",
        "address": {
            "city": "San Francisco",
            "state": "California",
            "country": "United States",
        },
    }
]

_REVERSE_SUCCESS_PAYLOAD = {
    "display_name": "Golden Gate Bridge, San Francisco, California, United States",
    "address": {
        "road": "Golden Gate Bridge",
        "city": "San Francisco",
        "state": "California",
        "country": "United States",
    },
}


def _mock_ok(json_data):
    """Return a mock requests.Response with a 200 status."""
    mock = MagicMock()
    mock.status_code = 200
    mock.json.return_value = json_data
    mock.raise_for_status = MagicMock()
    return mock


def _mock_http_error(status_code):
    """Return a mock requests.Response that raises HTTPError on raise_for_status."""
    mock = MagicMock()
    mock.status_code = status_code
    mock.json.return_value = {}
    error = requests_lib.exceptions.HTTPError(response=mock)
    mock.raise_for_status.side_effect = error
    return mock


@pytest.fixture(autouse=True)
def no_throttle(monkeypatch):
    """Disable rate-limiting sleep so tests run at full speed."""
    monkeypatch.setattr(
        "app.services.geocoding.nominatim_client._throttle", lambda: None
    )


# ---------------------------------------------------------------------------
# Forward geocoding
# ---------------------------------------------------------------------------


class TestForwardGeocode:
    def test_success_returns_normalized_structure(self, monkeypatch):
        monkeypatch.setattr(
            "app.services.geocoding.nominatim_client.requests.get",
            lambda *a, **kw: _mock_ok(_FORWARD_SUCCESS_PAYLOAD),
        )
        result = forward_geocode("San Francisco, CA")

        assert set(result.keys()) == {"address", "lat", "lng"}
        assert isinstance(result["address"], str)
        assert isinstance(result["lat"], float)
        assert isinstance(result["lng"], float)
        assert result["lat"] == pytest.approx(37.7749)
        assert result["lng"] == pytest.approx(-122.4194)

    def test_success_address_is_non_empty(self, monkeypatch):
        monkeypatch.setattr(
            "app.services.geocoding.nominatim_client.requests.get",
            lambda *a, **kw: _mock_ok(_FORWARD_SUCCESS_PAYLOAD),
        )
        result = forward_geocode("San Francisco, CA")
        assert result["address"].strip() != ""

    def test_empty_address_returns_invalid_input(self):
        result = forward_geocode("")
        assert result == {"type": "invalid_input", "message": result["message"]}
        assert "type" in result and result["type"] == "invalid_input"

    def test_whitespace_only_address_returns_invalid_input(self):
        result = forward_geocode("   ")
        assert result["type"] == "invalid_input"

    def test_none_address_returns_invalid_input(self):
        result = forward_geocode(None)
        assert result["type"] == "invalid_input"

    def test_no_results_returns_no_results_error(self, monkeypatch):
        monkeypatch.setattr(
            "app.services.geocoding.nominatim_client.requests.get",
            lambda *a, **kw: _mock_ok([]),
        )
        result = forward_geocode("xyzzy-nowhere-land-99999")
        assert result["type"] == "no_results"
        assert "message" in result

    def test_timeout_returns_timeout_error(self, monkeypatch):
        def raise_timeout(*a, **kw):
            raise requests_lib.exceptions.Timeout()

        monkeypatch.setattr(
            "app.services.geocoding.nominatim_client.requests.get", raise_timeout
        )
        result = forward_geocode("123 Main St")
        assert result["type"] == "timeout"

    def test_http_error_returns_http_error_type(self, monkeypatch):
        monkeypatch.setattr(
            "app.services.geocoding.nominatim_client.requests.get",
            lambda *a, **kw: _mock_http_error(429),
        )
        result = forward_geocode("123 Main St")
        assert result["type"] == "http_error"
        assert "429" in result["message"]

    def test_malformed_response_returns_malformed_error(self, monkeypatch):
        monkeypatch.setattr(
            "app.services.geocoding.nominatim_client.requests.get",
            lambda *a, **kw: _mock_ok([{"unexpected_key": "unexpected_value"}]),
        )
        result = forward_geocode("123 Main St")
        assert result["type"] == "malformed_response"

    def test_error_response_has_type_and_message(self, monkeypatch):
        monkeypatch.setattr(
            "app.services.geocoding.nominatim_client.requests.get",
            lambda *a, **kw: _mock_ok([]),
        )
        result = forward_geocode("nowhere")
        assert "type" in result
        assert "message" in result
        assert isinstance(result["type"], str)
        assert isinstance(result["message"], str)

    def test_ambiguous_address_returns_ambiguous_type(self, monkeypatch):
        """Two results >50 km apart → ambiguous_address error."""
        ambiguous_payload = [
            {
                "lat": "39.7817",
                "lon": "-89.6501",
                "display_name": "Springfield, Illinois, United States",
                "address": {"city": "Springfield", "state": "Illinois", "country": "United States"},
            },
            {
                "lat": "37.2090",
                "lon": "-93.2923",
                "display_name": "Springfield, Missouri, United States",
                "address": {"city": "Springfield", "state": "Missouri", "country": "United States"},
            },
        ]
        monkeypatch.setattr(
            "app.services.geocoding.nominatim_client.requests.get",
            lambda *a, **kw: _mock_ok(ambiguous_payload),
        )
        result = forward_geocode("Springfield")
        assert result["type"] == "ambiguous_address"
        assert "candidates" in result
        assert isinstance(result["candidates"], list)
        assert len(result["candidates"]) >= 2

    def test_ambiguous_address_candidates_have_required_fields(self, monkeypatch):
        """Each candidate must include address, lat, and lng."""
        ambiguous_payload = [
            {
                "lat": "39.7817",
                "lon": "-89.6501",
                "display_name": "Springfield, IL",
                "address": {"city": "Springfield", "state": "Illinois", "country": "US"},
            },
            {
                "lat": "37.2090",
                "lon": "-93.2923",
                "display_name": "Springfield, MO",
                "address": {"city": "Springfield", "state": "Missouri", "country": "US"},
            },
        ]
        monkeypatch.setattr(
            "app.services.geocoding.nominatim_client.requests.get",
            lambda *a, **kw: _mock_ok(ambiguous_payload),
        )
        result = forward_geocode("Springfield")
        assert result["type"] == "ambiguous_address"
        for c in result["candidates"]:
            assert "address" in c
            assert "lat" in c
            assert "lng" in c
            assert isinstance(c["lat"], float)
            assert isinstance(c["lng"], float)

    def test_nearby_results_not_flagged_ambiguous(self, monkeypatch):
        """Two results <50 km apart → not ambiguous, returns first result."""
        nearby_payload = [
            {
                "lat": "37.7749",
                "lon": "-122.4194",
                "display_name": "San Francisco, CA",
                "address": {"city": "San Francisco", "state": "California", "country": "US"},
            },
            {
                "lat": "37.8044",
                "lon": "-122.2712",
                "display_name": "Oakland, CA",
                "address": {"city": "Oakland", "state": "California", "country": "US"},
            },
        ]
        monkeypatch.setattr(
            "app.services.geocoding.nominatim_client.requests.get",
            lambda *a, **kw: _mock_ok(nearby_payload),
        )
        result = forward_geocode("Bay Area, CA")
        assert "type" not in result
        assert result["lat"] == pytest.approx(37.7749)


# ---------------------------------------------------------------------------
# Ambiguity detection helpers
# ---------------------------------------------------------------------------


class TestAmbiguityHelpers:
    def test_haversine_distance_same_point(self):
        assert _haversine_km(37.77, -122.42, 37.77, -122.42) == pytest.approx(0.0)

    def test_haversine_distance_known_pair(self):
        # SF to Oakland ≈ 14 km
        dist = _haversine_km(37.7749, -122.4194, 37.8044, -122.2712)
        assert 10 < dist < 20

    def test_is_ambiguous_far_apart_returns_true(self):
        far = [
            {"lat": "39.78", "lon": "-89.65"},
            {"lat": "37.21", "lon": "-93.29"},
        ]
        assert _is_ambiguous(far) is True

    def test_is_ambiguous_close_together_returns_false(self):
        close = [
            {"lat": "37.7749", "lon": "-122.4194"},
            {"lat": "37.8044", "lon": "-122.2712"},
        ]
        assert _is_ambiguous(close) is False

    def test_is_ambiguous_single_result_returns_false(self):
        assert _is_ambiguous([{"lat": "37.77", "lon": "-122.41"}]) is False

    def test_is_ambiguous_empty_returns_false(self):
        assert _is_ambiguous([]) is False

    def test_is_ambiguous_malformed_returns_false(self):
        assert _is_ambiguous([{"bad": "data"}, {"also": "bad"}]) is False

    def test_extract_candidates_returns_deduplicated_list(self):
        data = [
            {
                "lat": "37.77",
                "lon": "-122.41",
                "display_name": "SF",
                "address": {"city": "San Francisco", "state": "CA", "country": "US"},
            },
            {
                "lat": "37.77",
                "lon": "-122.41",
                "display_name": "SF duplicate",
                "address": {"city": "San Francisco", "state": "CA", "country": "US"},
            },
            {
                "lat": "37.21",
                "lon": "-93.29",
                "display_name": "Springfield MO",
                "address": {"city": "Springfield", "state": "MO", "country": "US"},
            },
        ]
        candidates = _extract_candidates(data)
        assert len(candidates) == 2  # deduplicated by rounded lat/lng

    def test_extract_candidates_skips_malformed_items(self):
        data = [
            {"bad_key": "value"},
            {
                "lat": "37.77",
                "lon": "-122.41",
                "display_name": "SF",
                "address": {"city": "SF", "state": "CA", "country": "US"},
            },
        ]
        candidates = _extract_candidates(data)
        assert len(candidates) == 1


# ---------------------------------------------------------------------------
# Reverse geocoding
# ---------------------------------------------------------------------------


class TestReverseGeocode:
    def test_success_returns_normalized_structure(self, monkeypatch):
        monkeypatch.setattr(
            "app.services.geocoding.nominatim_client.requests.get",
            lambda *a, **kw: _mock_ok(_REVERSE_SUCCESS_PAYLOAD),
        )
        result = reverse_geocode(37.7749, -122.4194)

        assert set(result.keys()) == {"address", "lat", "lng"}
        assert isinstance(result["address"], str)
        assert isinstance(result["lat"], float)
        assert isinstance(result["lng"], float)

    def test_coordinates_are_preserved_in_response(self, monkeypatch):
        monkeypatch.setattr(
            "app.services.geocoding.nominatim_client.requests.get",
            lambda *a, **kw: _mock_ok(_REVERSE_SUCCESS_PAYLOAD),
        )
        result = reverse_geocode(51.5074, -0.1278)
        assert result["lat"] == pytest.approx(51.5074)
        assert result["lng"] == pytest.approx(-0.1278)

    def test_non_numeric_lat_returns_invalid_input(self):
        result = reverse_geocode("abc", -122.0)
        assert result["type"] == "invalid_input"

    def test_non_numeric_lng_returns_invalid_input(self):
        result = reverse_geocode(37.7, "xyz")
        assert result["type"] == "invalid_input"

    def test_none_coords_return_invalid_input(self):
        result = reverse_geocode(None, None)
        assert result["type"] == "invalid_input"

    def test_out_of_range_lat_returns_invalid_input(self):
        result = reverse_geocode(999.0, 0.0)
        assert result["type"] == "invalid_input"

    def test_out_of_range_lng_returns_invalid_input(self):
        result = reverse_geocode(0.0, 999.0)
        assert result["type"] == "invalid_input"

    def test_nominatim_error_body_returns_no_results(self, monkeypatch):
        monkeypatch.setattr(
            "app.services.geocoding.nominatim_client.requests.get",
            lambda *a, **kw: _mock_ok({"error": "Unable to geocode"}),
        )
        result = reverse_geocode(0.0, 0.0)
        assert result["type"] == "no_results"

    def test_empty_response_returns_no_results(self, monkeypatch):
        monkeypatch.setattr(
            "app.services.geocoding.nominatim_client.requests.get",
            lambda *a, **kw: _mock_ok({}),
        )
        result = reverse_geocode(37.7749, -122.4194)
        assert result["type"] == "no_results"

    def test_timeout_returns_timeout_error(self, monkeypatch):
        def raise_timeout(*a, **kw):
            raise requests_lib.exceptions.Timeout()

        monkeypatch.setattr(
            "app.services.geocoding.nominatim_client.requests.get", raise_timeout
        )
        result = reverse_geocode(37.7749, -122.4194)
        assert result["type"] == "timeout"

    def test_http_error_returns_http_error_type(self, monkeypatch):
        monkeypatch.setattr(
            "app.services.geocoding.nominatim_client.requests.get",
            lambda *a, **kw: _mock_http_error(503),
        )
        result = reverse_geocode(37.7749, -122.4194)
        assert result["type"] == "http_error"
        assert "503" in result["message"]

    def test_error_response_has_type_and_message(self, monkeypatch):
        monkeypatch.setattr(
            "app.services.geocoding.nominatim_client.requests.get",
            lambda *a, **kw: _mock_ok({"error": "Unable to geocode"}),
        )
        result = reverse_geocode(0.0, 0.0)
        assert "type" in result
        assert "message" in result
        assert isinstance(result["type"], str)
        assert isinstance(result["message"], str)
