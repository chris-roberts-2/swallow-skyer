"""
Lightweight forward geocoder using Nominatim (OpenStreetMap).
"""

import requests


class ForwardGeocoder:
    def __init__(self, user_agent: str = "swallow-forward-geocoder"):
        self.user_agent = user_agent

    def geocode(self, address: str):
        """
        Geocode an address string. Returns dict with lat/lon floats or None.
        """
        if not address or not address.strip():
            return None
        url = "https://nominatim.openstreetmap.org/search"
        params = {"q": address.strip(), "format": "json", "limit": 1}
        headers = {"User-Agent": self.user_agent}
        try:
            resp = requests.get(url, params=params, headers=headers, timeout=6)
            resp.raise_for_status()
            data = resp.json()
            if not data:
                return None
            first = data[0]
            lat = float(first.get("lat"))
            lon = float(first.get("lon"))
            if not (lat and lon):
                return None
            return {"lat": lat, "lon": lon}
        except Exception:
            return None


forward_geocoder = ForwardGeocoder()

