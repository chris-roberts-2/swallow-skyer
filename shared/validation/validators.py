"""
Shared validation functions for common data types.
"""

import re
from typing import Any, Dict, List, Optional


def validate_coordinates(latitude: float, longitude: float) -> bool:
    """Validate GPS coordinates."""
    return (
        -90 <= latitude <= 90 and
        -180 <= longitude <= 180
    )


def validate_file_type(filename: str, allowed_extensions: List[str]) -> bool:
    """Validate file extension."""
    if not filename:
        return False
    
    extension = filename.lower().split('.')[-1]
    return extension in [ext.lower() for ext in allowed_extensions]


def validate_image_file(filename: str) -> bool:
    """Validate image file extension."""
    allowed_extensions = ['jpg', 'jpeg', 'png', 'gif', 'webp']
    return validate_file_type(filename, allowed_extensions)


def validate_string_length(text: str, min_length: int = 0, max_length: int = 1000) -> bool:
    """Validate string length."""
    if text is None:
        return min_length == 0
    
    return min_length <= len(text) <= max_length


def sanitize_filename(filename: str) -> str:
    """Sanitize filename for safe storage."""
    # Remove or replace unsafe characters
    filename = re.sub(r'[^\w\-_\.]', '_', filename)
    # Remove multiple consecutive underscores
    filename = re.sub(r'_+', '_', filename)
    # Remove leading/trailing underscores
    filename = filename.strip('_')
    
    return filename
