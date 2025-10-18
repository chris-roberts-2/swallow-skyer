import React, { useEffect, useRef, useState } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import PhotoStack from './components/map/PhotoStack';
import './App.css';
import PhotoMapFetchExample from './components/PhotoMapFetchExample.jsx';

// Sample data for testing
const samplePhotos = [
  {
    id: 1,
    caption: 'Sample Photo 1',
    latitude: 37.7749,
    longitude: -122.4194,
    url: 'https://via.placeholder.com/300x200/4CAF50/white?text=Sample+Photo+1',
    createdAt: '2024-01-01',
  },
  {
    id: 2,
    caption: 'Sample Photo 2',
    latitude: 37.7849,
    longitude: -122.4094,
    url: 'https://via.placeholder.com/300x200/2196F3/white?text=Sample+Photo+2',
    createdAt: '2024-01-02',
  },
];

// Sample route component
const MapPage = () => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [selectedMarker, setSelectedMarker] = useState(null);

  useEffect(() => {
    if (map.current) return; // Initialize map only once

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'raster-tiles': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors',
          },
        },
        layers: [
          {
            id: 'simple-tiles',
            type: 'raster',
            source: 'raster-tiles',
            minzoom: 0,
            maxzoom: 22,
          },
        ],
      },
      center: [-122.4194, 37.7749], // San Francisco coordinates
      zoom: 10, // Better zoom level for city view
    });

    // Add navigation controls
    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    // Add rotation control
    map.current.addControl(
      new maplibregl.NavigationControl({
        showCompass: true,
        showZoom: true,
      }),
      'top-left'
    );

    // Add sample markers
    samplePhotos.forEach(photo => {
      const markerElement = document.createElement('div');
      markerElement.className = 'map-marker';
      markerElement.innerHTML = `
        <div class="marker-pin">
          <span class="photo-count">1</span>
        </div>
      `;

      new maplibregl.Marker(markerElement)
        .setLngLat([photo.longitude, photo.latitude])
        .addTo(map.current);

      markerElement.addEventListener('click', () => {
        setSelectedMarker(photo);
      });
    });

    // Cleanup on unmount
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  const handlePhotoSelect = photo => {
    // Photo selection handler - can be extended later
    setSelectedMarker(photo);
  };

  return (
    <div className="map-container">
      <div ref={mapContainer} className="map" />
      {selectedMarker && (
        <div className="selected-marker-info">
          <PhotoStack
            photos={[selectedMarker]}
            onPhotoSelect={handlePhotoSelect}
            onToggle={() => setSelectedMarker(null)}
          />
        </div>
      )}
    </div>
  );
};

// Sample home component
const HomePage = () => {
  return (
    <div className="home-page">
      <h1>Welcome to Swallow Skyer</h1>
      <p>
        A platform for storing and managing photos on a map based on GPS
        coordinates.
      </p>
      <p>Navigate to the map to get started!</p>
    </div>
  );
};

function App() {
  return (
    <Router>
      <div className="App">
        <header className="App-header">
          <h1>Swallow Skyer</h1>
          <nav>
            <a href="/">Home</a> | <a href="/map">Map</a> |{' '}
            <a href="/photos-map">Photos Map</a>
          </nav>
        </header>

        <main className="App-main">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/photos-map" element={<PhotoMapFetchExample />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
