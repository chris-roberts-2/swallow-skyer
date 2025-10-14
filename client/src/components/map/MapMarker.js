import React from 'react';

const MapMarker = ({ location, photoCount, isActive, onClick }) => {
  return (
    <div className={`map-marker ${isActive ? 'active' : ''}`} onClick={onClick}>
      <div className="marker-pin">
        <span className="photo-count">{photoCount}</span>
      </div>
    </div>
  );
};

export default MapMarker;
