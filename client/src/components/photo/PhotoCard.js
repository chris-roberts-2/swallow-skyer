import React from 'react';
import { formatLocalDateTime } from '../../utils/dateTime';

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
        <span className="photo-date">
          {formatLocalDateTime(
            photo.createdAt ||
              photo.created_at ||
              photo.uploaded_at ||
              photo.captured_at
          )}
        </span>
      </div>
    </div>
  );
};

export default PhotoCard;
