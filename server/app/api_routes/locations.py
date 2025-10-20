from flask import Blueprint, request, jsonify
from app import db
from app.models import Location, Photo
from app.services.location_service import LocationService

bp = Blueprint("locations", __name__)
location_service = LocationService()


@bp.route("/", methods=["GET"])
def get_locations():
    """Get all locations with photo counts"""
    try:
        locations = location_service.get_locations_with_photo_counts()
        return jsonify([location for location in locations])
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/nearby", methods=["GET"])
def get_nearby_locations():
    """Get locations near given coordinates"""
    try:
        lat = request.args.get("lat", type=float)
        lng = request.args.get("lng", type=float)
        radius = request.args.get("radius", 0.01, type=float)

        if not lat or not lng:
            return jsonify({"error": "Latitude and longitude are required"}), 400

        locations = location_service.get_nearby_locations(lat, lng, radius)
        return jsonify([location for location in locations])
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/<location_id>/photos", methods=["GET"])
def get_location_photos(location_id):
    """Get all photos for a specific location"""
    try:
        location = Location.query.get_or_404(location_id)
        photos = Photo.query.filter_by(
            latitude=location.latitude, longitude=location.longitude
        ).all()

        return jsonify([photo.to_dict() for photo in photos])
    except Exception as e:
        return jsonify({"error": str(e)}), 500
