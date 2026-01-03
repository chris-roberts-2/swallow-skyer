"""
Lightweight reverse geocoding helper.

Defaults to a no-op resolver for offline/local environments. Can be swapped to
use Nominatim or another provider by replacing the implementation of
`reverse_geocode`.
"""

from typing import Optional, Dict

try:
    # Optional dependency; not required for tests/offline
    import requests  # type: ignore
except Exception:  # pragma: no cover
    requests = None


def reverse_geocode(latitude: float, longitude: float) -> Dict[str, Optional[str]]:
    """
    Return best-effort geocoded components for the provided coordinates.

    Falls back to None fields if geocoding is unavailable or fails.
    """
    # Default: no external calls in tests/local
    if not requests:
        return {"city": None, "state": None, "country": None}

    try:
        url = "https://nominatim.openstreetmap.org/reverse"
        params = {
            "format": "json",
            "lat": latitude,
            "lon": longitude,
            "zoom": 10,
            "addressdetails": 1,
        }
        headers = {"User-Agent": "swallow-skyer/1.0"}
        resp = requests.get(url, params=params, headers=headers, timeout=5)
        resp.raise_for_status()
        data = resp.json() or {}
        address = data.get("address") or {}
        return {
            "city": address.get("city") or address.get("town") or address.get("village"),
            "state": address.get("state"),
            "country": address.get("country"),
        }
    except Exception:
        return {"city": None, "state": None, "country": None}

