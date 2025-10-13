"""
API routes for Swallow Skyer backend.
"""

from flask import Blueprint, jsonify, request
from app import db
from app.models import User, Photo, Location

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
        # Test database connection
        db.session.execute("SELECT 1")
        db_status = "healthy"
    except Exception:
        db_status = "unhealthy"

    return jsonify({"status": "ok", "database": db_status, "version": "1.0.0"})


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

    user = User(
        name=data["name"],
        email=data.get("email"),
        profile_picture_url=data.get("profile_picture_url"),
    )

    db.session.add(user)
    db.session.commit()

    return jsonify(user.to_dict()), 201


@main_bp.route("/api/photos", methods=["GET"])
def get_photos():
    """
    Get all photos.

    Returns:
        dict: List of photos
    """
    photos = Photo.query.all()
    return jsonify([photo.to_dict() for photo in photos])


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

    photo = Photo(
        filename=data["filename"],
        caption=data.get("caption"),
        latitude=data["latitude"],
        longitude=data["longitude"],
        altitude=data.get("altitude"),
        user_id=data.get("user_id"),
        file_url=data.get("file_url"),
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
