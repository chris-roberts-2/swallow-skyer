"""
API routes for Swallow Skyer backend.
"""

from flask import Blueprint, jsonify, request, send_from_directory
from sqlalchemy import text
import os
from datetime import datetime
from app import db
from app.models import User, Photo, Location
from app.services.storage.supabase_client import supabase_client
from app.services.storage.r2_client import r2_client
from .upload import registerUploadRoutes
from app.middleware.auth_middleware import jwt_required
from app.api_routes.v1.photos import handle_photo_listing_request

# Create blueprint
main_bp = Blueprint("main", __name__)
registerUploadRoutes(main_bp)


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
@jwt_required
def get_photos():
    """Delegate to the shared photo listing handler with auth enforced."""
    return handle_photo_listing_request()


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

