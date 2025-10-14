from flask import Blueprint, request, jsonify, current_app
from app import db
from app.models import Photo
from app.services.photo_service import PhotoService
from app.utils.validators import validate_photo_data
import os

bp = Blueprint('photos', __name__)
photo_service = PhotoService()

@bp.route('/', methods=['GET'])
def get_photos():
    """Get all photos with optional filtering"""
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
            'photos': [photo.to_dict() for photo in photos['items']],
            'total': photos['total'],
            'page': page,
            'per_page': per_page,
            'pages': photos['pages']
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/<photo_id>', methods=['GET'])
def get_photo(photo_id):
    """Get a specific photo by ID"""
    try:
        photo = Photo.query.get_or_404(photo_id)
        return jsonify(photo.to_dict())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/location', methods=['GET'])
def get_photos_by_location():
    """Get photos by location coordinates"""
    try:
        lat = request.args.get('lat', type=float)
        lng = request.args.get('lng', type=float)
        radius = request.args.get('radius', 0.001, type=float)
        
        if not lat or not lng:
            return jsonify({'error': 'Latitude and longitude are required'}), 400
        
        photos = photo_service.get_photos_by_location(lat, lng, radius)
        return jsonify([photo.to_dict() for photo in photos])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/upload', methods=['POST'])
def upload_photo():
    """Upload a new photo"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        caption = request.form.get('caption', '')
        latitude = request.form.get('latitude', type=float)
        longitude = request.form.get('longitude', type=float)
        
        if not latitude or not longitude:
            return jsonify({'error': 'Latitude and longitude are required'}), 400
        
        # Validate photo data
        validation_result = validate_photo_data(file, latitude, longitude)
        if not validation_result['valid']:
            return jsonify({'error': validation_result['error']}), 400
        
        # Process and save photo
        photo_data = photo_service.process_upload(
            file=file,
            caption=caption,
            latitude=latitude,
            longitude=longitude
        )
        
        return jsonify(photo_data.to_dict()), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/<photo_id>', methods=['PUT'])
def update_photo(photo_id):
    """Update a photo"""
    try:
        photo = Photo.query.get_or_404(photo_id)
        data = request.get_json()
        
        if 'caption' in data:
            photo.caption = data['caption']
        
        db.session.commit()
        return jsonify(photo.to_dict())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/<photo_id>', methods=['DELETE'])
def delete_photo(photo_id):
    """Delete a photo"""
    try:
        photo = Photo.query.get_or_404(photo_id)
        
        # Delete file from storage
        photo_service.delete_photo_file(photo.file_path)
        if photo.thumbnail_path:
            photo_service.delete_photo_file(photo.thumbnail_path)
        
        # Delete from database
        db.session.delete(photo)
        db.session.commit()
        
        return jsonify({'message': 'Photo deleted successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/stats', methods=['GET'])
def get_photo_stats():
    """Get photo statistics"""
    try:
        stats = photo_service.get_photo_stats()
        return jsonify(stats)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
