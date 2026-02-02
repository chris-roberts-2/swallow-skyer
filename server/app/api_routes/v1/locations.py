from flask import Blueprint, request, jsonify, g
from app.services.storage.supabase_client import SupabaseClient
from app.middleware.auth_middleware import jwt_required

bp = Blueprint("v1_locations", __name__)
supabase_client = SupabaseClient()


@bp.route("/", methods=["GET"])
@jwt_required
def get_locations():
    """
    Get locations for a project - API v1
    Query params:
      - project_id: required
      - show_on_photos: optional (default: true)
    """
    try:
        current_user = getattr(g, "current_user", None) or {}
        current_user_id = current_user.get("id")
        if not current_user_id:
            return (
                jsonify({"error": "forbidden", "message": "Authentication required"}),
                401,
            )

        project_id = request.args.get("project_id")
        if not project_id:
            return jsonify({"error": "project_id is required", "version": "v1"}), 400

        # Check if user has access to this project
        if not supabase_client.client:
            return jsonify({"error": "Database unavailable", "version": "v1"}), 503

        # Verify user is a member of the project
        membership = (
            supabase_client.client.table("project_members")
            .select("role")
            .eq("project_id", project_id)
            .eq("user_id", current_user_id)
            .execute()
        )

        if not membership.data:
            return jsonify({"error": "Access denied", "version": "v1"}), 403

        # Get show_on_photos filter (default to true)
        show_on_photos = request.args.get("show_on_photos", "true").lower() == "true"

        # Fetch locations that have photos in this project
        # We need to join with photos to filter by project_id
        query = (
            supabase_client.client.table("locations")
            .select("id,latitude,longitude,elevation,created_at,number")
        )

        # Get all photos for this project to find relevant location_ids
        photos_query = (
            supabase_client.client.table("photos")
            .select("location_id")
            .eq("project_id", project_id)
        )
        
        if show_on_photos:
            photos_query = photos_query.eq("show_on_photos", True)
        
        photos_result = photos_query.execute()
        
        if not photos_result.data:
            return jsonify({"locations": [], "version": "v1"})

        # Get unique location_ids
        location_ids = list(set(
            photo.get("location_id") 
            for photo in photos_result.data 
            if photo.get("location_id")
        ))

        if not location_ids:
            return jsonify({"locations": [], "version": "v1"})

        # Fetch locations for these IDs
        locations_result = (
            supabase_client.client.table("locations")
            .select("id,latitude,longitude,elevation,created_at,number")
            .in_("id", location_ids)
            .execute()
        )

        locations = locations_result.data or []
        
        # Filter out locations with number = 0 (no visible photos)
        if show_on_photos:
            locations = [loc for loc in locations if (loc.get("number") or 0) > 0]

        return jsonify({"locations": locations, "version": "v1"})

    except Exception as e:
        print(f"Error fetching locations: {e}")
        return jsonify({"error": str(e), "version": "v1"}), 500
