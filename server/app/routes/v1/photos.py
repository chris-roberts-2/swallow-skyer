from flask import Blueprint, request, jsonify
from app import db
from app.models import Photo
from app.services.photo_service import PhotoService
from app.utils.validators import validate_photo_data
import os

bp = Blueprint('photos_v1', __name__)
photo_service = PhotoService()

@bp.route('/', methods=['GET'])
def get_photos():
    """Get all photos with optional filtering - API v1"""
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        lat = request.args.get('lat', type=float)
        lng = request.args.get('lng', type=float)
        radius = request.args.get('radius', 0.01, type=float)
        
        photos = photo_service.get_photos(
            page=page,
            per_page=per_page,
            latitude=lat,
            longitude=lng,
            radius=radius
        )
        
        return jsonify({
            'version': 'v1',
            'photos': [photo.to_dict() for photo in photos['items']],
            'total': photos['total'],
            'page': page,
            'per_page': per_page,
            'pages': photos['pages']
        })
    except Exception as e:
        return jsonify({'error': str(e), 'version': 'v1'}), 500

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
