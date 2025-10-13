import React from 'react';
import PhotoCard from '../photo/PhotoCard';

const PhotoStack = ({ photos, onPhotoSelect, onToggle }) => {
  return (
    <div className="photo-stack">
      <div className="stack-header">
        <h3>Photos at this location</h3>
        <button onClick={onToggle} className="toggle-btn">
          {photos.length} photos
        </button>
      </div>
      <div className="stack-content">
        {photos.map((photo, index) => (
          <PhotoCard
            key={photo.id}
            photo={photo}
            onClick={() => onPhotoSelect(photo)}
            stackIndex={index}
          />
        ))}
      </div>
    </div>
  );
};

export default PhotoStack;
