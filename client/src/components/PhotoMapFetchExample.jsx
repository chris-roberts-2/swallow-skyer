/**
 * Example component demonstrating how to fetch photos from backend
 * and display them as markers on a MapLibre map.
 */

import React, { useEffect, useState, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { fetchPhotos, fetchPhotosInBounds } from '../api/photos';

const PhotoMapFetchExample = () => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://demotiles.maplibre.org/style.json', // Free demo tiles
      center: [-122.4194, 37.7749], // San Francisco
      zoom: 12,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    mapRef.current = map;

    return () => {
      map.remove();
    };
  }, []);

  // Fetch photos on mount
  useEffect(() => {
    const loadPhotos = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch photos with default params (50 most recent)
        const response = await fetchPhotos({ limit: 50 });
        
        console.log('Fetched photos:', response);
        setPhotos(response.photos || []);
      } catch (err) {
        console.error('Failed to fetch photos:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadPhotos();
  }, []);

  // Add markers to map when photos change
  useEffect(() => {
    if (!mapRef.current || !photos.length) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Add new markers
    photos.forEach(photo => {
      if (!photo.latitude || !photo.longitude) return;

      // Create marker element
      const el = document.createElement('div');
      el.className = 'photo-marker';
      el.style.width = '30px';
      el.style.height = '30px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = '#007cbf';
      el.style.border = '2px solid white';
      el.style.cursor = 'pointer';
      el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';

      // Create popup with photo preview
      const popup = new maplibregl.Popup({ offset: 25 }).setHTML(`
        <div style="max-width: 200px;">
          <img 
            src="${photo.url}" 
            alt="Photo ${photo.id}" 
            style="width: 100%; height: auto; border-radius: 4px; margin-bottom: 8px;"
            onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"
          />
          <p style="display: none; color: #666;">Image unavailable</p>
          <p style="margin: 0; font-size: 12px; color: #666;">
            <strong>Taken:</strong> ${new Date(photo.taken_at).toLocaleDateString()}
          </p>
          <p style="margin: 4px 0 0 0; font-size: 11px; color: #999;">
            ${photo.latitude.toFixed(5)}, ${photo.longitude.toFixed(5)}
          </p>
        </div>
      `);

      // Create and add marker
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([photo.longitude, photo.latitude])
        .setPopup(popup)
        .addTo(mapRef.current);

      markersRef.current.push(marker);
    });

    // Fit map to markers if we have photos
    if (photos.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      photos.forEach(photo => {
        if (photo.latitude && photo.longitude) {
          bounds.extend([photo.longitude, photo.latitude]);
        }
      });
      mapRef.current.fitBounds(bounds, { padding: 50, maxZoom: 15 });
    }
  }, [photos]);

  // Optional: Fetch photos within current map bounds when map moves
  const handleFetchInBounds = async () => {
    if (!mapRef.current) return;

    const bounds = mapRef.current.getBounds();
    const latMin = bounds.getSouth();
    const lngMin = bounds.getWest();
    const latMax = bounds.getNorth();
    const lngMax = bounds.getEast();

    try {
      setLoading(true);
      const response = await fetchPhotosInBounds(latMin, lngMin, latMax, lngMax, 100);
      setPhotos(response.photos || []);
    } catch (err) {
      console.error('Failed to fetch photos in bounds:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      {/* Map container */}
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* Loading indicator */}
      {loading && (
        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            padding: '10px 20px',
            borderRadius: '4px',
            zIndex: 1000,
          }}
        >
          Loading photos...
        </div>
      )}

      {/* Error message */}
      {error && (
        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(255, 0, 0, 0.8)',
            color: 'white',
            padding: '10px 20px',
            borderRadius: '4px',
            zIndex: 1000,
          }}
        >
          Error: {error}
        </div>
      )}

      {/* Info panel */}
      <div
        style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
          backgroundColor: 'white',
          padding: '15px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          zIndex: 1000,
          minWidth: '200px',
        }}
      >
        <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>Photo Markers</h3>
        <p style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#666' }}>
          Showing {photos.length} photo{photos.length !== 1 ? 's' : ''}
        </p>
        <button
          onClick={handleFetchInBounds}
          disabled={loading}
          style={{
            padding: '8px 16px',
            backgroundColor: '#007cbf',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            width: '100%',
          }}
        >
          Fetch Photos in View
        </button>
      </div>
    </div>
  );
};

export default PhotoMapFetchExample;

