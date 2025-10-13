import React from 'react';

const PhotoCard = ({ photo, onClick, stackIndex = 0 }) => {
  return (
    <div 
      className="photo-card"
      onClick={onClick}
      style={{ zIndex: 1000 - stackIndex }}
    >
      <img 
        src={photo.thumbnailUrl || photo.url} 
        alt={photo.caption || 'Photo'}
        className="photo-thumbnail"
      />
      <div className="photo-info">
        <p className="photo-caption">{photo.caption}</p>
        <span className="photo-date">{photo.createdAt}</span>
      </div>
    </div>
  );
};

export default PhotoCard;
