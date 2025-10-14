import React from 'react';
import { Map } from 'maplibre-gl';

const MapContainer = ({ photos, onPhotoSelect, onLocationClick }) => {
  const mapRef = React.useRef(null);
  const mapInstance = React.useRef(null);

  React.useEffect(() => {
    if (mapRef.current && !mapInstance.current) {
      mapInstance.current = new Map({
        container: mapRef.current,
        style: 'https://demotiles.maplibre.org/style.json',
        center: [0, 0],
        zoom: 2,
      });
    }
  }, []);

  return (
    <div className="map-container">
      <div ref={mapRef} className="map" />
    </div>
  );
};

export default MapContainer;
