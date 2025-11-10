from werkzeug.datastructures import FileStorage


def validate_photo_data(file, latitude, longitude):
    """Validate photo upload data"""
    errors = []

    # Validate file
    if not isinstance(file, FileStorage):
        errors.append("Invalid file type")

    if file and not file.filename:
        errors.append("No file selected")

    # Some servers may not populate content_length; treat missing as 0
    if file:
        try:
            size = getattr(file, "content_length", None)
            size = 0 if size is None else int(size)
        except Exception:
            size = 0
        if size > 10 * 1024 * 1024:  # 10MB
            errors.append("File too large (max 10MB)")

    # Validate coordinates
    if not isinstance(latitude, (int, float)) or not -90 <= latitude <= 90:
        errors.append("Invalid latitude")

    if not isinstance(longitude, (int, float)) or not -180 <= longitude <= 180:
        errors.append("Invalid longitude")

    return {"valid": len(errors) == 0, "error": "; ".join(errors) if errors else None}
