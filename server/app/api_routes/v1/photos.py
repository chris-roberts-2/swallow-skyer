from flask import Blueprint, request, jsonify
from app.services.storage.supabase_client import supabase_client
from app.services.storage.r2_client import r2_client
from typing import Dict, Any

bp = Blueprint('photos_v1', __name__)

@bp.route('/', methods=['GET'])
def get_photos():
    """Get all photos with optional filtering - API v1 (Supabase)"""
    try:
        # Parse query parameters
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)
        since = request.args.get('since', type=str)
        bbox = request.args.get('bbox', type=str)
        user_id = request.args.get('user_id', type=str)
        
        # Enforce max limit
        if limit > 200:
            limit = 200
        
        # Query Supabase
        result = supabase_client.get_photos(
            limit=limit,
            offset=offset,
            since=since,
            bbox=bbox,
            user_id=user_id
        )
        
        photos = result.get('data', [])
        total = result.get('count', 0)
        
        # Process each photo to ensure URL is set
        processed_photos = []
        for photo in photos:
            processed_photo = _process_photo_urls(photo)
            processed_photos.append(processed_photo)
        
        return jsonify({
            'photos': processed_photos,
            'pagination': {
                'limit': limit,
                'offset': offset,
                'total': total
            }
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def _process_photo_urls(photo: Dict[str, Any]) -> Dict[str, Any]:
    """
    Process photo to ensure it has a valid URL.
    Prefer explicit 'url' field; fallback to generating presigned URL from 'r2_key'.
    
    Args:
        photo (Dict[str, Any]): Photo data from Supabase
        
    Returns:
        Dict[str, Any]: Photo with valid URL
    """
    # If photo already has a URL and it's not empty, use it
    if photo.get('url') and photo['url'].strip():
        return photo
    
    # Otherwise, generate presigned URL from r2_key
    r2_key = photo.get('r2_key')
    if r2_key:
        presigned_url = r2_client.generate_presigned_url(r2_key, expires_in=600)
        if presigned_url:
            photo['url'] = presigned_url
    
    return photo

@bp.route('/<photo_id>', methods=['GET'])
def get_photo(photo_id):
    """Get a specific photo by ID - API v1"""
    try:
        photo = Photo.query.get_or_404(photo_id)
        return jsonify({
            'version': 'v1',
            'photo': photo.to_dict()
        })
    except Exception as e:
        return jsonify({'error': str(e), 'version': 'v1'}), 500

@bp.route('/location', methods=['GET'])
def get_photos_by_location():
    """Get photos by location coordinates - API v1"""
    try:
        lat = request.args.get('lat', type=float)
        lng = request.args.get('lng', type=float)
        radius = request.args.get('radius', 0.001, type=float)
        
        if not lat or not lng:
            return jsonify({'error': 'Latitude and longitude are required', 'version': 'v1'}), 400
        
        photos = photo_service.get_photos_by_location(lat, lng, radius)
        return jsonify({
            'version': 'v1',
            'photos': [photo.to_dict() for photo in photos]
        })
    except Exception as e:
        return jsonify({'error': str(e), 'version': 'v1'}), 500

@bp.route('/upload', methods=['POST'])
def upload_photo():
    """Upload a new photo - API v1"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided', 'version': 'v1'}), 400
        
        file = request.files['file']
        caption = request.form.get('caption', '')
        latitude = request.form.get('latitude', type=float)
        longitude = request.form.get('longitude', type=float)
        
        if not latitude or not longitude:
            return jsonify({'error': 'Latitude and longitude are required', 'version': 'v1'}), 400
        
        # Validate photo data
        validation_result = validate_photo_data(file, latitude, longitude)
        if not validation_result['valid']:
            return jsonify({'error': validation_result['error'], 'version': 'v1'}), 400
        
        # Process and save photo
        photo_data = photo_service.process_upload(
            file=file,
            caption=caption,
            latitude=latitude,
            longitude=longitude
        )
        
        return jsonify({
            'version': 'v1',
            'photo': photo_data.to_dict()
        }), 201
    except Exception as e:
        return jsonify({'error': str(e), 'version': 'v1'}), 500

@bp.route('/<photo_id>', methods=['PUT'])
def update_photo(photo_id):
    """Update a photo - API v1"""
    try:
        photo = Photo.query.get_or_404(photo_id)
        data = request.get_json()
        
        if 'caption' in data:
            photo.caption = data['caption']
        
        db.session.commit()
        return jsonify({
            'version': 'v1',
            'photo': photo.to_dict()
        })
    except Exception as e:
        return jsonify({'error': str(e), 'version': 'v1'}), 500

@bp.route('/<photo_id>', methods=['DELETE'])
def delete_photo(photo_id):
    """Delete a photo - API v1"""
    try:
        photo = Photo.query.get_or_404(photo_id)
        
        # Delete file from storage
        photo_service.delete_photo_file(photo.file_path)
        if photo.thumbnail_path:
            photo_service.delete_photo_file(photo.thumbnail_path)
        
        # Delete from database
        db.session.delete(photo)
        db.session.commit()
        
        return jsonify({
            'message': 'Photo deleted successfully',
            'version': 'v1'
        })
    except Exception as e:
        return jsonify({'error': str(e), 'version': 'v1'}), 500

@bp.route('/stats', methods=['GET'])
def get_photo_stats():
    """Get photo statistics - API v1"""
    try:
        stats = photo_service.get_photo_stats()
        return jsonify({
            'version': 'v1',
            'stats': stats
        })
    except Exception as e:
        return jsonify({'error': str(e), 'version': 'v1'}), 500
