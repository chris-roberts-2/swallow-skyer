import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const apiBase = process.env.REACT_APP_API_URL || 'http://127.0.0.1:5000';
const r2PublicBase = process.env.REACT_APP_R2_PUBLIC_URL || '';

const PhotoMapLive = () => {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const [photos, setPhotos] = useState([]);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    mapInstance.current = new maplibregl.Map({
      container: mapRef.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [-79.9959, 40.4406],
      zoom: 11,
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
        if (p.taken_at) {
          takenText = new Date(p.taken_at).toLocaleString();
        }
        ts.textContent = takenText;

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
          .setLngLat([lng, lat])
          .setPopup(popup)
          .addTo(mapInstance.current)
          .togglePopup();

        bounds.extend([lng, lat]);
      });

    if (!bounds.isEmpty()) {
      mapInstance.current.fitBounds(bounds, { padding: 40, maxZoom: 15 });
    }
  }, [photos]);

  return <div ref={mapRef} style={{ width: '100%', height: '90vh' }} />;
};

export default PhotoMapLive;
