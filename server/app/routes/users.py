from flask import Blueprint, request, jsonify
from app import db
from app.models import User

bp = Blueprint('users', __name__)

@bp.route('/', methods=['GET'])
def get_users():
    """Get all users"""
    try:
        users = User.query.all()
        return jsonify([user.to_dict() for user in users])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/<user_id>', methods=['GET'])
def get_user(user_id):
    """Get a specific user by ID"""
    try:
        user = User.query.get_or_404(user_id)
        return jsonify(user.to_dict())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/<user_id>/photos', methods=['GET'])
def get_user_photos(user_id):
    """Get all photos for a specific user"""
    try:
        user = User.query.get_or_404(user_id)
        photos = user.photos
        return jsonify([photo.to_dict() for photo in photos])
    except Exception as e:
        return jsonify({'error': str(e)}), 500
