"""
Location schema definitions for validation and serialization.
"""

from typing import List, Optional
from dataclasses import dataclass


@dataclass
class LocationSchema:
    """Schema for location data."""
    latitude: float
    longitude: float
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None


@dataclass
class LocationSearchSchema:
    """Schema for location search requests."""
    latitude: float
    longitude: float
    radius: float = 1000.0  # meters
    limit: int = 50


@dataclass
class LocationResponseSchema:
    """Schema for location response data."""
    latitude: float
    longitude: float
    photo_count: int
    photos: List[str]  # photo IDs
    address: Optional[str] = None
