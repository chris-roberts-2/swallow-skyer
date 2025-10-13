from app import db
from app.models import Location, Photo
from sqlalchemy import func

class LocationService:
    def get_locations_with_photo_counts(self):
        """Get all locations with their photo counts"""
        locations = db.session.query(
            Location.latitude,
            Location.longitude,
            func.count(Photo.id).label('photo_count')
        ).outerjoin(
            Photo, 
            (Photo.latitude == Location.latitude) & 
            (Photo.longitude == Location.longitude)
        ).group_by(
            Location.latitude, 
            Location.longitude
        ).all()
        
        return [
            {
                'latitude': loc.latitude,
                'longitude': loc.longitude,
                'photo_count': loc.photo_count
            }
            for loc in locations
        ]
    
    def get_nearby_locations(self, latitude, longitude, radius=0.01):
        """Get locations near given coordinates"""
        locations = db.session.query(
            Location.latitude,
            Location.longitude,
            func.count(Photo.id).label('photo_count')
        ).outerjoin(
            Photo,
            (Photo.latitude == Location.latitude) & 
            (Photo.longitude == Location.longitude)
        ).filter(
            Location.latitude.between(latitude - radius, latitude + radius),
            Location.longitude.between(longitude - radius, longitude + radius)
        ).group_by(
            Location.latitude,
            Location.longitude
        ).all()
        
        return [
            {
                'latitude': loc.latitude,
                'longitude': loc.longitude,
                'photo_count': loc.photo_count
            }
            for loc in locations
        ]
