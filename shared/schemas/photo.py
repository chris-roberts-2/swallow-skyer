"""
Photo schema definitions for validation and serialization.
"""

from typing import Optional, List
from dataclasses import dataclass
from datetime import datetime


@dataclass
class PhotoUploadSchema:
    """Schema for photo upload requests."""
    file: bytes
    latitude: float
    longitude: float
    title: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None


@dataclass
class PhotoResponseSchema:
    """Schema for photo response data."""
    id: str
    filename: str
    latitude: float
    longitude: float
    title: Optional[str]
    description: Optional[str]
    tags: List[str]
    uploaded_at: datetime
    file_url: str
    thumbnail_url: Optional[str] = None


@dataclass
class PhotoUpdateSchema:
    """Schema for photo update requests."""
    title: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
