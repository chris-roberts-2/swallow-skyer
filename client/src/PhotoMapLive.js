import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import UploadForm from './components/UploadForm';

const apiBase =
  process.env.REACT_APP_API_BASE_URL ||
  process.env.REACT_APP_API_URL ||
  'http://127.0.0.1:5000';
const r2PublicBase = process.env.REACT_APP_R2_PUBLIC_URL || '';

const PhotoMapLive = () => {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const [photos, setPhotos] = useState([]);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    // Continental USA bounds
    const usaBounds = [
      [-125.0, 24.0], // SW
      [-66.5, 49.5], // NE
    ];
    mapInstance.current = new maplibregl.Map({
      container: mapRef.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [-98.5, 39.8], // USA center
      zoom: 3.5,
      maxBounds: usaBounds,
    });
    mapInstance.current.addControl(
      new maplibregl.NavigationControl(),
      'top-right'
    );
  }, []);

  useEffect(() => {
    const fetchPhotos = async () => {
      try {
        const res = await fetch(`${apiBase}/api/v1/photos/`);
        const data = await res.json();
        setPhotos(data.photos || []);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Failed to fetch photos', e);
      }
    };
    fetchPhotos();
  }, []);

  useEffect(() => {
    if (!mapInstance.current) return;

    // Fit bounds and add visible markers
    const bounds = new maplibregl.LngLatBounds();

    // Only render photos with absolute URL to avoid ORB blocking
    (photos || [])
      .filter(p => p && typeof p.url === 'string' && /^https?:\/\//.test(p.url))
      .forEach(p => {
        const lng =
          typeof p.longitude === 'number' ? p.longitude : Number(p.longitude);
        const lat =
          typeof p.latitude === 'number' ? p.latitude : Number(p.latitude);
        if (Number.isNaN(lng) || Number.isNaN(lat)) return;
        // Heuristic for USA-only deployments: if longitude is positive, assume West hemisphere
        const adjLng = lng > 0 ? -lng : lng;

        // Build popup content via DOM for robust CORS/onerror fallback handling
        const container = document.createElement('div');
        container.style.maxWidth = '260px';

        const img = document.createElement('img');
        img.alt = 'photo';
        img.crossOrigin = 'anonymous';
        img.style.width = '100%';
        img.style.height = 'auto';
        img.style.borderRadius = '4px';
        img.style.marginBottom = '6px';

        const fallback = document.createElement('div');
        fallback.textContent = 'Image unavailable';
        fallback.style.display = 'none';
        fallback.style.fontSize = '12px';
        fallback.style.color = '#666';

        const ts = document.createElement('div');
        ts.style.fontSize = '12px';
        ts.style.color = '#666';
        let takenText = '';
        const iso = p.taken_at || p.created_at;
        if (iso) {
          takenText = new Date(iso).toLocaleString();
        }
        ts.textContent = takenText || '';

        const coords = document.createElement('div');
        coords.style.fontSize = '12px';
        coords.style.color = '#666';
        coords.textContent = `Lat: ${lat.toFixed(5)}  Lng: ${adjLng.toFixed(5)}`;

        const primarySrc = String(p.url || '');
        const publicFallback =
          r2PublicBase && p.r2_key
            ? `${r2PublicBase.replace(/\/$/, '')}/${p.r2_key}`
            : '';

        img.onerror = () => {
          if (publicFallback && img.src !== publicFallback) {
            img.src = publicFallback; // try public domain if presigned was blocked by CORS
          } else {
            img.style.display = 'none';
            fallback.style.display = 'block';
          }
        };

        img.src = primarySrc || publicFallback;

        container.appendChild(img);
        container.appendChild(fallback);
        container.appendChild(ts);
        container.appendChild(coords);

        const popup = new maplibregl.Popup({ offset: 25 }).setDOMContent(
          container
        );

        const el = document.createElement('div');
        el.style.width = '14px';
        el.style.height = '14px';
        el.style.borderRadius = '50%';
        el.style.background = '#e53935';
        el.style.border = '2px solid white';
        el.style.boxShadow = '0 0 6px rgba(0,0,0,0.4)';

        new maplibregl.Marker({ element: el })
          .setLngLat([adjLng, lat])
          .setPopup(popup)
          .addTo(mapInstance.current)
          .togglePopup();

        bounds.extend([adjLng, lat]);
      });

    if (!bounds.isEmpty()) {
      mapInstance.current.fitBounds(bounds, { padding: 40, maxZoom: 15 });
    }
  }, [photos]);

  return (
    <div style={{ width: '100%', height: '90vh', position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          zIndex: 2,
          top: 8,
          left: 8,
          background: 'rgba(255,255,255,0.95)',
          padding: 8,
          borderRadius: 6,
          boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
        }}
      >
        <UploadForm />
      </div>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
};

export default PhotoMapLive;
