import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import UploadForm from './components/UploadForm';
import PhotoStack from './components/map/PhotoStack';

const envApiBase =
  process.env.REACT_APP_API_BASE_URL || process.env.REACT_APP_API_URL || '';
const r2PublicBase = process.env.REACT_APP_R2_PUBLIC_URL || '';
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache window
const EARTH_RADIUS_METERS = 6_371_000;

const toRadians = value => (value * Math.PI) / 180;

const parseCoordinate = value => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeLongitude = value => {
  if (!Number.isFinite(value)) return value;
  return value > 0 ? -value : value;
};

const formatTimestamp = iso => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch (error) {
    return String(iso);
  }
};

const resolvePhotoUrl = photo => {
  const primaryUrl = (photo.url || '').trim();
  const r2Key = photo.r2_key || photo.r2Key;
  const fallbackUrl =
    r2PublicBase && r2Key
      ? `${r2PublicBase.replace(/\/$/, '')}/${r2Key}`
      : '';
  const resolvedUrl = primaryUrl || fallbackUrl;

  return { primaryUrl, fallbackUrl, resolvedUrl };
};

const distanceMeters = (a, b) => {
  if (
    !Number.isFinite(a.mapLatitude) ||
    !Number.isFinite(a.mapLongitude) ||
    !Number.isFinite(b.mapLatitude) ||
    !Number.isFinite(b.mapLongitude)
  ) {
    return Number.POSITIVE_INFINITY;
  }

  const dLat = toRadians(b.mapLatitude - a.mapLatitude);
  const dLon = toRadians(b.mapLongitude - a.mapLongitude);
  const lat1Rad = toRadians(a.mapLatitude);
  const lat2Rad = toRadians(b.mapLatitude);

  const hav =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(hav));
};

const zoomToThresholdMeters = zoom => {
  if (zoom <= 3) return 200_000;
  if (zoom <= 5) return 100_000;
  if (zoom <= 7) return 40_000;
  if (zoom <= 9) return 10_000;
  if (zoom <= 11) return 3_000;
  return 1_000;
};

const buildClusters = (photoList, thresholdMeters) => {
  if (!photoList.length) return [];

  const remaining = new Set(photoList.map((_, index) => index));
  const clusters = [];

  while (remaining.size > 0) {
    const iterator = remaining.values().next().value;
    remaining.delete(iterator);

    const clusterIndices = [iterator];
    let position = 0;

    while (position < clusterIndices.length) {
      const currentIdx = clusterIndices[position];
      position += 1;

      const currentPhoto = photoList[currentIdx];

      for (const idx of Array.from(remaining)) {
        const candidate = photoList[idx];
        if (distanceMeters(currentPhoto, candidate) <= thresholdMeters) {
          clusterIndices.push(idx);
          remaining.delete(idx);
        }
      }
    }

    const clusterPhotos = clusterIndices.map(index => photoList[index]);
    const latitude =
      clusterPhotos.reduce((sum, photo) => sum + photo.mapLatitude, 0) /
      clusterPhotos.length;
    const longitude =
      clusterPhotos.reduce((sum, photo) => sum + photo.mapLongitude, 0) /
      clusterPhotos.length;

    clusters.push({
      latitude,
      longitude,
      photos: clusterPhotos,
    });
  }

  return clusters;
};

const PhotoMapLive = () => {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const [photos, setPhotos] = useState([]);
  const [mapZoom, setMapZoom] = useState(3.5);
  const [activeStack, setActiveStack] = useState(null);
  const cacheRef = useRef({ data: null, fetchedAt: 0 });
  const markersRef = useRef([]);
  const hasAutoFitRef = useRef(false);
  const userInteractedRef = useRef(false);
  const [refreshCounter, setRefreshCounter] = useState(0);

  const clearMarkers = useCallback(() => {
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];
  }, []);

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
    if (typeof mapInstance.current?.addControl === 'function') {
      mapInstance.current.addControl(
        new maplibregl.NavigationControl(),
        'top-right'
      );
    }

    const initialZoom =
      typeof mapInstance.current.getZoom === 'function'
        ? mapInstance.current.getZoom()
        : 3.5;
    setMapZoom(initialZoom);

    const handleZoom = () => {
      setMapZoom(prevZoom => {
        const zoomFn = mapInstance.current?.getZoom;
        if (typeof zoomFn === 'function') {
          const nextZoom = zoomFn.call(mapInstance.current);
          return Number.isFinite(nextZoom) ? nextZoom : prevZoom;
        }
        return prevZoom;
      });
    };

    const supportsEvents = typeof mapInstance.current?.on === 'function';
    if (supportsEvents) {
      mapInstance.current.on('zoomend', handleZoom);
      const setInteracted = () => {
        userInteractedRef.current = true;
      };
      mapInstance.current.on('dragstart', setInteracted);
      mapInstance.current.on('zoomstart', setInteracted);
      mapInstance.current.on('rotatestart', setInteracted);
      mapInstance.current.on('pitchstart', setInteracted);
      mapInstance.current.__setInteracted = setInteracted;
    }

    return () => {
      if (supportsEvents && typeof mapInstance.current?.off === 'function') {
        mapInstance.current.off('zoomend', handleZoom);
        if (mapInstance.current.__setInteracted) {
          mapInstance.current.off('dragstart', mapInstance.current.__setInteracted);
          mapInstance.current.off('zoomstart', mapInstance.current.__setInteracted);
          mapInstance.current.off('rotatestart', mapInstance.current.__setInteracted);
          mapInstance.current.off('pitchstart', mapInstance.current.__setInteracted);
          delete mapInstance.current.__setInteracted;
        }
      }
      clearMarkers();
      if (typeof mapInstance.current?.remove === 'function') {
        mapInstance.current.remove();
      }
      mapInstance.current = null;
    };
  }, [clearMarkers]);

  useEffect(() => {
    let isCancelled = false;

    const fetchPhotos = async () => {
      const cached = cacheRef.current;
      if (
        cached.data &&
        Date.now() - cached.fetchedAt < CACHE_TTL_MS &&
        Array.isArray(cached.data)
      ) {
        setPhotos(cached.data);
        return;
      }

      const candidates = Array.from(
        new Set([
          'http://127.0.0.1:5001',
          envApiBase,
          'http://localhost:5001',
          'http://127.0.0.1:5000',
          'http://localhost:5000',
        ].filter(Boolean))
      );

      for (const base of candidates) {
        try {
          const res = await fetch(`${base}/api/v1/photos/`);
          const data = await res.json();
          if (!res.ok) {
            // try next candidate
            // eslint-disable-next-line no-continue
            continue;
          }
          const list = Array.isArray(data.photos) ? data.photos : [];
          if (!isCancelled) {
            setPhotos(list);
            cacheRef.current = { data: list, fetchedAt: Date.now() };
          }
          return;
        } catch (e) {
          // Try next base
          // eslint-disable-next-line no-continue
          continue;
        }
      }

      // All attempts failed - keep cached if present
      if (!isCancelled && cached.data) {
        setPhotos(cached.data);
      }
    };
    fetchPhotos();
    return () => {
      isCancelled = true;
    };
  }, [refreshCounter]);

  const normalisedPhotos = useMemo(() => {
    return (photos || [])
      .map(photo => {
        const latitude = parseCoordinate(photo.latitude);
        const longitudeRaw = parseCoordinate(photo.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitudeRaw)) {
          return null;
        }

        const mapLongitude = normalizeLongitude(longitudeRaw);
        const { primaryUrl, fallbackUrl, resolvedUrl } = resolvePhotoUrl(photo);

        if (!resolvedUrl) {
          return null;
        }

        const isoTimestamp =
          photo.taken_at ||
          photo.takenAt ||
          photo.created_at ||
          photo.createdAt ||
          null;

        return {
          ...photo,
          url: resolvedUrl,
          primaryUrl,
          fallbackUrl,
          mapLatitude: latitude,
          mapLongitude,
          createdAt: formatTimestamp(isoTimestamp),
          timestampIso: isoTimestamp,
        };
      })
      .filter(Boolean);
  }, [photos]);

  const clusters = useMemo(() => {
    const threshold = zoomToThresholdMeters(mapZoom);
    return buildClusters(normalisedPhotos, threshold);
  }, [normalisedPhotos, mapZoom]);

  useEffect(() => {
    if (!activeStack) return;
    const stackIds = new Set(activeStack.photos.map(photo => photo.id));
    const stillPresent = clusters.some(cluster =>
      cluster.photos.some(photo => stackIds.has(photo.id))
    );
    if (!stillPresent) {
      setActiveStack(null);
    }
  }, [activeStack, clusters]);

  useEffect(() => {
    if (!mapInstance.current) return;

    clearMarkers();

    const bounds = new maplibregl.LngLatBounds();

    const createPhotoMarker = photo => {
      const container = document.createElement('div');
      container.style.width = '16px';
      container.style.height = '16px';
      container.style.borderRadius = '50%';
      container.style.background = '#e53935';
      container.style.border = '2px solid white';
      container.style.boxShadow = '0 0 6px rgba(0,0,0,0.4)';
      container.title = photo.caption || 'View photo';

      const wrapper = document.createElement('div');
      wrapper.style.maxWidth = '260px';

      const img = document.createElement('img');
      img.alt = photo.caption || 'Photo';
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

      const timestamp = document.createElement('div');
      timestamp.style.fontSize = '12px';
      timestamp.style.color = '#666';
      timestamp.textContent = photo.createdAt || '';

      img.onerror = () => {
        if (photo.fallbackUrl && img.src !== photo.fallbackUrl) {
          img.src = photo.fallbackUrl;
        } else {
          img.style.display = 'none';
          fallback.style.display = 'block';
        }
      };

      img.src = photo.primaryUrl || photo.url;

      wrapper.appendChild(img);
      wrapper.appendChild(fallback);
      wrapper.appendChild(timestamp);
      const actions = document.createElement('div');
      actions.style.marginTop = '6px';
      const dl = document.createElement('a');
      dl.textContent = 'Download';
      dl.href = photo.primaryUrl || photo.url;
      dl.target = '_blank';
      dl.rel = 'noopener noreferrer';
      dl.download = '';
      dl.style.fontSize = '12px';
      dl.style.color = '#1e88e5';
      actions.appendChild(dl);
      wrapper.appendChild(actions);

      const popup = new maplibregl.Popup({ offset: 24 }).setDOMContent(wrapper);
      const marker = new maplibregl.Marker({ element: container })
        .setLngLat([photo.mapLongitude, photo.mapLatitude])
        .setPopup(popup)
        .addTo(mapInstance.current);

      return marker;
    };

    const createClusterMarker = cluster => {
      const button = document.createElement('button');
      button.type = 'button';
      button.style.width = '34px';
      button.style.height = '34px';
      button.style.borderRadius = '50%';
      button.style.background = '#1e88e5';
      button.style.color = '#fff';
      button.style.border = '2px solid white';
      button.style.boxShadow = '0 0 8px rgba(0,0,0,0.35)';
      button.style.cursor = 'pointer';
      button.style.fontSize = '14px';
      button.style.fontWeight = '600';
      button.textContent =
        cluster.photos.length > 99 ? '99+' : `${cluster.photos.length}`;

      button.addEventListener('click', evt => {
        evt.stopPropagation();
        setActiveStack({
          latitude: cluster.latitude,
          longitude: cluster.longitude,
          photos: cluster.photos,
        });
        mapInstance.current?.flyTo({
          center: [cluster.longitude, cluster.latitude],
          zoom: Math.max(mapZoom, 9),
          essential: true,
        });
      });

      return new maplibregl.Marker({ element: button }).setLngLat([
        cluster.longitude,
        cluster.latitude,
      ]);
    };

    clusters.forEach(cluster => {
      if (
        !Number.isFinite(cluster.latitude) ||
        !Number.isFinite(cluster.longitude)
      ) {
        return;
      }

      bounds.extend([cluster.longitude, cluster.latitude]);

      if (cluster.photos.length === 1) {
        const marker = createPhotoMarker(cluster.photos[0]);
        markersRef.current.push(marker);
      } else {
        const marker = createClusterMarker(cluster).addTo(mapInstance.current);
        markersRef.current.push(marker);
      }
    });

    if (!bounds.isEmpty() && !hasAutoFitRef.current && !userInteractedRef.current) {
      mapInstance.current.fitBounds(bounds, {
        padding: 40,
        maxZoom: 14,
        duration: 800,
      });
      hasAutoFitRef.current = true;
    }
  }, [clusters, clearMarkers, mapZoom]);

  const closeStack = () => setActiveStack(null);

  const handlePhotoSelect = photo => {
    if (!photo) return;

    if (mapInstance.current) {
      const canFly =
        typeof mapInstance.current.flyTo === 'function' &&
        Number.isFinite(photo.mapLongitude) &&
        Number.isFinite(photo.mapLatitude);
      if (canFly) {
        mapInstance.current.flyTo({
          center: [photo.mapLongitude, photo.mapLatitude],
          zoom: Math.max(mapZoom, 11),
          essential: true,
        });
      }
    }

    if (photo.url && typeof window !== 'undefined') {
      window.open(photo.url, '_blank', 'noopener,noreferrer');
    }
  };

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
        <UploadForm
          onUploaded={() => {
            cacheRef.current = { data: null, fetchedAt: 0 };
            hasAutoFitRef.current = false;
            userInteractedRef.current = false;
            setRefreshCounter(c => c + 1);
          }}
        />
      </div>
      {activeStack ? (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            maxWidth: 340,
            zIndex: 3,
          }}
        >
          <div
            style={{
              background: 'rgba(255,255,255,0.97)',
              padding: 12,
              borderRadius: 8,
              boxShadow: '0 1px 6px rgba(0,0,0,0.2)',
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: '#555',
                marginBottom: 8,
              }}
            >
              Cluster @{' '}
              {`${activeStack.latitude.toFixed(
                4
              )}, ${activeStack.longitude.toFixed(4)}`}
            </div>
            <PhotoStack
              photos={activeStack.photos}
              onPhotoSelect={handlePhotoSelect}
              onToggle={closeStack}
            />
          </div>
        </div>
      ) : null}
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
};

export default PhotoMapLive;
