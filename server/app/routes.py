"""
API routes for Swallow Skyer backend.
"""

from flask import Blueprint, jsonify, request, send_from_directory
from sqlalchemy import text
import os
from uuid import uuid4
from werkzeug.utils import secure_filename
from datetime import datetime
from app import db
from app.models import User, Photo, Location
from app.services.storage.supabase_client import supabase_client
from app.services.storage.r2_client import r2_client

# Create blueprint
main_bp = Blueprint("main", __name__)


@main_bp.route("/ping", methods=["GET"])
def ping():
    """
    Health check endpoint.

    Returns:
        dict: Status response
    """
    return jsonify({"status": "ok"})


@main_bp.route("/api/health", methods=["GET"])
def health():
    """
    Detailed health check endpoint.

    Returns:
        dict: Detailed health information
    """
    try:
        # Test database connection (SQLAlchemy 2.x requires text())
        db.session.execute(text("SELECT 1"))
        db_status = "healthy"
    except Exception:
        db_status = "unhealthy"

    return jsonify({"status": "ok", "database": db_status, "version": "1.0.0"})


@main_bp.route("/uploads/<path:filename>", methods=["GET"])
def serve_uploaded_file(filename: str):
    """
    Serve files saved by the local PhotoService in the 'uploads' directory.
    This enables the frontend to load thumbnails/full images via absolute URLs.
    """
    uploads_dir = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "uploads"
    )
    return send_from_directory(os.path.normpath(uploads_dir), filename)


@main_bp.route("/api/uploads/list", methods=["GET"])
def list_uploaded_files():
    """
    List files under the local 'uploads' directory for the frontend to render a tree.
    Returns a flat list of relative paths with size and modified timestamps.
    """
    uploads_dir = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "uploads"
    )
    files = []
    try:
        for root, _, filenames in os.walk(uploads_dir):
            for name in filenames:
                # Exclude README and non-image files from the list
                lower = name.lower()
                if lower.endswith(".md") or lower.endswith(".txt"):
                    continue
                full_path = os.path.join(root, name)
                rel_path = os.path.relpath(full_path, uploads_dir)
                try:
                    stat = os.stat(full_path)
                    files.append(
                        {
                            "path": f"uploads/{rel_path.replace(os.sep, '/')}",
                            "size": stat.st_size,
                            "modified_at": int(stat.st_mtime),
                        }
                    )
                except OSError:
                    continue
        return jsonify({"files": files})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@main_bp.route("/api/users", methods=["GET"])
def get_users():
    """
    Get all users.

    Returns:
        dict: List of users
    """
    users = User.query.all()
    return jsonify([user.to_dict() for user in users])


@main_bp.route("/api/users", methods=["POST"])
def create_user():
    """
    Create a new user.

    Returns:
        dict: Created user data
    """
    data = request.get_json()

    if not data or not data.get("name"):
        return jsonify({"error": "Name is required"}), 400

    if not data.get("email"):
        return jsonify({"error": "Email is required"}), 400

    user = User(
        name=data["name"],
        email=data["email"],
        username=data.get("username"),
        profile_picture_url=data.get("profile_picture_url"),
    )

    db.session.add(user)
    db.session.commit()

    return jsonify(user.to_dict()), 201


@main_bp.route("/api/photos", methods=["GET"])
def get_photos():
    """
    Get photos from Supabase with optional filtering.

    Query params:
      - limit (int, default 50, max 200)
      - offset (int, default 0)
      - since (ISO timestamptz)
      - bbox (lat_min,lng_min,lat_max,lng_max)
      - user_id (uuid)

    Returns:
        dict: photos + pagination metadata
    """
    try:
        # Parse query parameters
        limit = request.args.get("limit", 50, type=int)
        offset = request.args.get("offset", 0, type=int)
        since = request.args.get("since", type=str)
        bbox = request.args.get("bbox", type=str)
        user_id = request.args.get("user_id", type=str)

        # Enforce max limit
        if limit and limit > 200:
            limit = 200

        # Basic bbox validation (optional, tolerant)
        if bbox:
            parts = bbox.split(",")
            if len(parts) != 4:
                return (
                    jsonify(
                        {
                            "error": "Invalid bbox format. Expected lat_min,lng_min,lat_max,lng_max"
                        }
                    ),
                    400,
                )
            try:
                _ = list(map(float, parts))
            except ValueError:
                return jsonify({"error": "Invalid bbox coordinates."}), 400

        # Query Supabase
        result = supabase_client.get_photos(
            limit=limit,
            offset=offset,
            since=since,
            bbox=bbox,
            user_id=user_id,
        )

        photos = result.get("data", [])
        total = result.get("count", 0)

        # Ensure URL present (prefer explicit url; fallback to presigned from r2_key)
        processed = []
        for p in photos:
            url_val = (p.get("url") or "").strip()
            if not url_val:
                r2_key = p.get("r2_key")
                if r2_key:
                    presigned = r2_client.generate_presigned_url(r2_key, expires_in=600)
                    if presigned:
                        p["url"] = presigned
            processed.append(p)

        return jsonify(
            {
                "photos": processed,
                "pagination": {
                    "limit": limit or 50,
                    "offset": offset or 0,
                    "total": total,
                },
            }
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@main_bp.route("/api/photos", methods=["POST"])
def create_photo():
    """
    Create a new photo record.

    Returns:
        dict: Created photo data
    """
    data = request.get_json()

    if not data or not all(k in data for k in ["filename", "latitude", "longitude"]):
        return jsonify({"error": "filename, latitude, and longitude are required"}), 400

    taken_at_value = data.get("taken_at")
    taken_at = None
    if taken_at_value:
        try:
            # Support both ISO strings with Z suffix and without timezone
            cleaned = (
                taken_at_value.replace("Z", "+00:00")
                if taken_at_value.endswith("Z")
                else taken_at_value
            )
            taken_at = datetime.fromisoformat(cleaned)
        except (ValueError, TypeError):
            taken_at = None

    photo = Photo(
        filename=data["filename"],
        caption=data.get("caption"),
        latitude=data["latitude"],
        longitude=data["longitude"],
        altitude=data.get("altitude"),
        user_id=data.get("user_id"),
        url=data.get("url") or data.get("file_url"),
        r2_key=data.get("r2_key"),
        taken_at=taken_at,
    )

    db.session.add(photo)
    db.session.commit()

    return jsonify(photo.to_dict()), 201


@main_bp.route("/api/locations", methods=["GET"])
def get_locations():
    """
    Get all locations.

    Returns:
        dict: List of locations
    """
    locations = Location.query.all()
    return jsonify([location.to_dict() for location in locations])


@main_bp.route("/api/locations", methods=["POST"])
def create_location():
    """
    Create a new location record.

    Returns:
        dict: Created location data
    """
    data = request.get_json()

    if not data or not all(k in data for k in ["name", "latitude", "longitude"]):
        return jsonify({"error": "name, latitude, and longitude are required"}), 400

    location = Location(
        name=data["name"],
        latitude=data["latitude"],
        longitude=data["longitude"],
        description=data.get("description"),
    )

    db.session.add(location)
    db.session.commit()

    return jsonify(location.to_dict()), 201


@main_bp.route("/api/test/supabase-r2", methods=["GET"])
def test_supabase_r2_integration():
    """
    Test endpoint to verify Supabase and R2 integration.

    Returns:
        dict: Integration test results
    """
    results = {
        "supabase": {"status": "unknown", "details": ""},
        "r2": {"status": "unknown", "details": ""},
        "integration": {"status": "unknown", "details": ""},
    }

    # Test Supabase connection
    try:
        if supabase_client.client:
            results["supabase"]["status"] = "connected"
            results["supabase"]["details"] = "Client initialized successfully"
        else:
            results["supabase"]["status"] = "error"
            results["supabase"][
                "details"
            ] = "Client not initialized - check environment variables"
    except Exception as e:
        results["supabase"]["status"] = "error"
        results["supabase"]["details"] = f"Error: {str(e)}"

    # Test R2 connection
    try:
        if r2_client.client:
            results["r2"]["status"] = "connected"
            results["r2"][
                "details"
            ] = f"Client initialized for bucket: {r2_client.bucket_name}"
        else:
            results["r2"]["status"] = "error"
            results["r2"][
                "details"
            ] = "Client not initialized - check environment variables"
    except Exception as e:
        results["r2"]["status"] = "error"
        results["r2"]["details"] = f"Error: {str(e)}"

    # Test integration (store metadata in Supabase with R2 URL)
    try:
        if supabase_client.client and r2_client.client:
            # Create test photo metadata
            test_photo_data = {
                "filename": "test-photo.jpg",
                "caption": "Test photo for integration",
                "latitude": 37.7749,
                "longitude": -122.4194,
                "url": r2_client.get_file_url("test-photos/test-photo.jpg"),
                "timestamp": "2024-01-01T00:00:00Z",
            }

            # Store in Supabase (this would fail with placeholder credentials)
            stored_metadata = supabase_client.store_photo_metadata(test_photo_data)

            if stored_metadata:
                results["integration"]["status"] = "success"
                results["integration"][
                    "details"
                ] = "Successfully stored metadata with R2 URL"
            else:
                results["integration"]["status"] = "partial"
                results["integration"][
                    "details"
                ] = "R2 URL generated but Supabase storage failed (expected with placeholder credentials)"
        else:
            results["integration"]["status"] = "error"
            results["integration"][
                "details"
            ] = "Cannot test integration - clients not initialized"
    except Exception as e:
        results["integration"]["status"] = "error"
        results["integration"]["details"] = f"Integration test error: {str(e)}"

    return jsonify(
        {
            "status": "test_completed",
            "results": results,
            "message": "Integration test completed - check individual service status",
        }
    )


@main_bp.route("/api/photos/upload", methods=["POST"])
def upload_photo():
    """
    Upload a photo to Cloudflare R2 and store metadata in Supabase.

    Expects multipart/form-data with fields:
      - file: Image file
      - user_id: User identifier
      - latitude: Latitude (float)
      - longitude: Longitude (float)
      - timestamp: Optional ISO timestamp

    Returns:
        JSON response with status, photo_id, and public URL.
    """
    # Validate file presence
    file = request.files.get("file")
    if not file or not getattr(file, "filename", None):
        return jsonify({"status": "error", "message": "Image file is required"}), 400

    # Basic content-type validation
    mimetype = getattr(file, "mimetype", "") or ""
    if not mimetype.startswith("image/"):
        return (
            jsonify(
                {"status": "error", "message": "Invalid file type. Image required"}
            ),
            400,
        )

    # Optional size guard using content length (defaults to 20 MB limit)
    content_length = request.content_length or 0
    max_bytes = 20 * 1024 * 1024
    if content_length and content_length > max_bytes:
        return (
            jsonify({"status": "error", "message": "File too large (max 20MB)"}),
            413,
        )

    # Extract and validate metadata
    user_id = request.form.get("user_id")
    caption = request.form.get("caption")  # optional
    latitude = request.form.get("latitude")
    longitude = request.form.get("longitude")
    timestamp = request.form.get("timestamp")

    if latitude is None or longitude is None:
        return (
            jsonify(
                {
                    "status": "error",
                    "message": "latitude and longitude are required",
                }
            ),
            400,
        )

    try:
        lat_val = float(latitude)
        lon_val = float(longitude)
    except (TypeError, ValueError):
        return (
            jsonify({"status": "error", "message": "Invalid latitude/longitude"}),
            400,
        )

    # Ensure storage client is configured
    if not r2_client.client:
        return (
            jsonify(
                {
                    "status": "error",
                    "message": "Storage not configured. Check R2 environment variables.",
                }
            ),
            500,
        )

    # Build storage key and upload to R2
    safe_name = secure_filename(file.filename) or f"upload_{uuid4().hex}.jpg"
    key = f"uploads/{user_id or 'anonymous'}/{uuid4().hex}_{safe_name}"

    try:
        uploaded = r2_client.upload_file(file.stream, key)
    except Exception as e:
        return (
            jsonify({"status": "error", "message": f"Upload failed: {str(e)}"}),
            500,
        )

    if not uploaded:
        return (
            jsonify({"status": "error", "message": "Failed to upload to storage"}),
            502,
        )

    file_url = r2_client.get_file_url(key)
    if not file_url:
        return (
            jsonify({"status": "error", "message": "Failed to generate file URL"}),
            500,
        )

    # Store metadata in Supabase, aligned with current public.photos schema.
    # Do not include 'id' so the default value is used.
    photo_data = {
        # Foreign keys – optional, can be null
        "project_id": None,
        "location_id": None,
        "user_id": user_id,
        # File attributes
        "file_name": safe_name,
        "file_type": mimetype or None,
        "file_size": content_length or None,
        "resolution": None,
        # R2 integration
        "r2_path": key,
        "r2_url": file_url,
        # Geo metadata
        "latitude": lat_val,
        "longitude": lon_val,
        # Optional caption
        "caption": caption or None,
    }
    if timestamp:
        # Save to captured_at column if provided
        photo_data["captured_at"] = timestamp

    if not supabase_client.client:
        return (
            jsonify(
                {
                    "status": "error",
                    "message": "Database not configured. Check Supabase environment variables.",
                }
            ),
            500,
        )

    try:
        stored = supabase_client.store_photo_metadata(photo_data)
    except Exception as e:
        return (
            jsonify(
                {
                    "status": "error",
                    "message": f"Failed to store metadata: {str(e)}",
                }
            ),
            500,
        )

    if not stored:
        return (
            jsonify(
                {
                    "status": "error",
                    "message": "Could not store metadata in Supabase",
                }
            ),
            502,
        )

    photo_id = stored.get("id") if isinstance(stored, dict) else None
    return jsonify({"status": "success", "photo_id": photo_id, "url": file_url}), 201
