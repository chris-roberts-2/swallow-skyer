from app import db
from app.models import Photo
from werkzeug.utils import secure_filename
import os
import uuid
from PIL import Image
import io

class PhotoService:
    def __init__(self):
        self.upload_folder = 'uploads'
        self.allowed_extensions = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
        self.max_file_size = 10 * 1024 * 1024  # 10MB
    
    def allowed_file(self, filename):
        return '.' in filename and \
               filename.rsplit('.', 1)[1].lower() in self.allowed_extensions
    
    def process_upload(self, file, caption, latitude, longitude, user_id=None):
        """Process and save uploaded photo"""
        if not self.allowed_file(file.filename):
            raise ValueError('Invalid file type')
        
        if file.content_length > self.max_file_size:
            raise ValueError('File too large')
        
        # Generate unique filename
        file_extension = file.filename.rsplit('.', 1)[1].lower()
        filename = f"{uuid.uuid4()}.{file_extension}"
        
        # Create upload directory if it doesn't exist
        os.makedirs(self.upload_folder, exist_ok=True)
        
        # Save original file
        file_path = os.path.join(self.upload_folder, filename)
        file.save(file_path)
        
        # Generate thumbnail
        thumbnail_path = self.generate_thumbnail(file_path, filename)
        
        # Create photo record
        photo = Photo(
            filename=filename,
            original_filename=file.filename,
            file_path=file_path,
            thumbnail_path=thumbnail_path,
            caption=caption,
            latitude=latitude,
            longitude=longitude,
            user_id=user_id
        )
        
        db.session.add(photo)
        db.session.commit()
        
        return photo
    
    def generate_thumbnail(self, file_path, filename):
        """Generate thumbnail for photo"""
        try:
            with Image.open(file_path) as img:
                # Resize to thumbnail size
                img.thumbnail((300, 300), Image.Resampling.LANCZOS)
                
                # Save thumbnail
                thumbnail_filename = f"thumb_{filename}"
                thumbnail_path = os.path.join(self.upload_folder, thumbnail_filename)
                img.save(thumbnail_path, optimize=True, quality=85)
                
                return thumbnail_path
        except Exception as e:
            print(f"Error generating thumbnail: {e}")
            return None
    
    def get_photos(self, page=1, per_page=20, latitude=None, longitude=None, radius=0.01):
        """Get photos with pagination and optional location filtering"""
        query = Photo.query
        
        if latitude and longitude:
            query = query.filter(
                Photo.latitude.between(latitude - radius, latitude + radius),
                Photo.longitude.between(longitude - radius, longitude + radius)
            )
        
        total = query.count()
        photos = query.order_by(Photo.created_at.desc()).paginate(
            page=page, per_page=per_page, error_out=False
        )
        
        return {
            'items': photos.items,
            'total': total,
            'pages': photos.pages
        }
    
    def get_photos_by_location(self, latitude, longitude, radius=0.001):
        """Get photos near specific coordinates"""
        return Photo.query.filter(
            Photo.latitude.between(latitude - radius, latitude + radius),
            Photo.longitude.between(longitude - radius, longitude + radius)
        ).all()
    
    def delete_photo_file(self, file_path):
        """Delete photo file from storage"""
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
        except Exception as e:
            print(f"Error deleting file {file_path}: {e}")
    
    def get_photo_stats(self):
        """Get photo statistics"""
        total_photos = Photo.query.count()
        recent_photos = Photo.query.filter(
            Photo.created_at >= db.func.date('now', '-7 days')
        ).count()
        
        return {
            'total_photos': total_photos,
            'recent_photos': recent_photos
        }
