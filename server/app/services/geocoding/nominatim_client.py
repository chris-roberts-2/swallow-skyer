"""
Nominatim geocoding client.

Provides forward geocoding (address → coordinates) and reverse geocoding
(coordinates → address) via the OpenStreetMap Nominatim API.

All responses are normalized to { address, lat, lng } on success or
{ type, message } on failure. Raw Nominatim payloads never propagate
beyond this module.

Configuration (environment variables):
    NOMINATIM_BASE_URL   — API base URL (default: https://nominatim.openstreetmap.org)
    NOMINATIM_TIMEOUT    — Request timeout in seconds (default: 10)
    NOMINATIM_USER_AGENT — User-Agent header value (default: swallow-skyer/1.0)
"""

import logging
import os
import threading
import time
from typing import Union

import requests

logger = logging.getLogger(__name__)

_BASE_URL: str = os.environ.get(
    "NOMINATIM_BASE_URL", "https://nominatim.openstreetmap.org"
).rstrip("/")
_TIMEOUT: int = int(os.environ.get("NOMINATIM_TIMEOUT", "10"))
_USER_AGENT: str = os.environ.get("NOMINATIM_USER_AGENT", "swallow-skyer/1.0")

# Nominatim fair-use policy: at most one request per second.
_MIN_INTERVAL: float = 1.0
_rate_lock = threading.Lock()
_last_request_time: float = 0.0

GeoSuccess = dict  # { address: str, lat: float, lng: float }
GeoError = dict  # { type: str, message: str }


def _throttle() -> None:
    """Block until the minimum inter-request interval has elapsed."""
    global _last_request_time
    with _rate_lock:
        elapsed = time.monotonic() - _last_request_time
        if elapsed < _MIN_INTERVAL:
            time.sleep(_MIN_INTERVAL - elapsed)
        _last_request_time = time.monotonic()


def _error(error_type: str, message: str) -> GeoError:
    return {"type": error_type, "message": message}


def _build_address(addr: dict) -> str:
    """Assemble a human-readable address string from a Nominatim address object."""
    parts = [
        addr.get("house_number"),
        addr.get("road"),
        addr.get("city") or addr.get("town") or addr.get("village"),
        addr.get("state"),
        addr.get("country"),
    ]
    return ", ".join(p for p in parts if p)


def forward_geocode(address: str) -> Union[GeoSuccess, GeoError]:
    """
    Convert an address string to coordinates.

    Returns { address: str, lat: float, lng: float } on success.
    Returns { type: str, message: str } on failure.
    """
    if not address or not address.strip():
        return _error("invalid_input", "Address must be a non-empty string.")

    _throttle()

    try:
        resp = requests.get(
            f"{_BASE_URL}/search",
            params={
                "q": address.strip(),
                "format": "json",
                "limit": 1,
                "addressdetails": 1,
            },
            headers={"User-Agent": _USER_AGENT},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.exceptions.Timeout:
        logger.warning(
            "Nominatim forward geocode timeout for address: %.80s", address
        )
        return _error("timeout", "Geocoding request timed out.")
    except requests.exceptions.HTTPError as exc:
        status = exc.response.status_code if exc.response is not None else "unknown"
        logger.warning("Nominatim HTTP error during forward geocode: %s", status)
        return _error(
            "http_error",
            f"Geocoding service returned an error: {status}",
        )
    except Exception as exc:
        logger.error("Unexpected error during forward geocode: %s", exc)
        return _error("unexpected_error", "An unexpected error occurred during geocoding.")

    if not data:
        return _error("no_results", f"No results found for address: {address!r}")

    try:
        first = data[0]
        lat = float(first["lat"])
        lng = float(first["lon"])
        addr_parts = first.get("address") or {}
        normalized = _build_address(addr_parts) or first.get(
            "display_name", address.strip()
        )
    except (KeyError, ValueError, TypeError) as exc:
        logger.warning("Malformed Nominatim forward geocode response: %s", exc)
        return _error(
            "malformed_response",
            "Geocoding service returned an unexpected response format.",
        )

    return {"address": normalized, "lat": lat, "lng": lng}


def reverse_geocode(lat: float, lng: float) -> Union[GeoSuccess, GeoError]:
    """
    Convert coordinates to a human-readable address.

    Returns { address: str, lat: float, lng: float } on success.
    Returns { type: str, message: str } on failure.
    """
    try:
        lat = float(lat)
        lng = float(lng)
    except (TypeError, ValueError):
        return _error("invalid_input", "lat and lng must be numeric values.")

    if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        return _error("invalid_input", "Coordinates are out of valid range.")

    _throttle()

    try:
        resp = requests.get(
            f"{_BASE_URL}/reverse",
            params={
                "lat": lat,
                "lon": lng,
                "format": "json",
                "zoom": 16,
                "addressdetails": 1,
            },
            headers={"User-Agent": _USER_AGENT},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.exceptions.Timeout:
        logger.warning(
            "Nominatim reverse geocode timeout for coords: (%s, %s)", lat, lng
        )
        return _error("timeout", "Geocoding request timed out.")
    except requests.exceptions.HTTPError as exc:
        status = exc.response.status_code if exc.response is not None else "unknown"
        logger.warning("Nominatim HTTP error during reverse geocode: %s", status)
        return _error(
            "http_error",
            f"Geocoding service returned an error: {status}",
        )
    except Exception as exc:
        logger.error("Unexpected error during reverse geocode: %s", exc)
        return _error(
            "unexpected_error", "An unexpected error occurred during reverse geocoding."
        )

    if not data or "error" in data:
        return _error("no_results", f"No address found for coordinates ({lat}, {lng}).")

    try:
        addr_parts = data.get("address") or {}
        normalized = _build_address(addr_parts) or data.get("display_name", "")
        if not normalized:
            return _error(
                "no_results", f"No address found for coordinates ({lat}, {lng})."
            )
    except (KeyError, TypeError) as exc:
        logger.warning("Malformed Nominatim reverse geocode response: %s", exc)
        return _error(
            "malformed_response",
            "Geocoding service returned an unexpected response format.",
        )

    return {"address": normalized, "lat": lat, "lng": lng}
