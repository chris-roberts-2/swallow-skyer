import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useAuth } from './context';
import PhotoStack from './components/map/PhotoStack';

const envApiBase =
  process.env.REACT_APP_API_BASE_URL || process.env.REACT_APP_API_URL || '';
const r2PublicBase =
  process.env.REACT_APP_R2_PUBLIC_BASE_URL ||
  process.env.REACT_APP_R2_PUBLIC_URL ||
  process.env.R2_PUBLIC_BASE_URL ||
  '';
const CACHE_TTL_MS = 0; // disable caching to ensure fresh fetches
const EARTH_RADIUS_METERS = 6_371_000;

const STANDARD_STYLE_URL =
  'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

const SATELLITE_RASTER_SOURCE = {
  type: 'raster',
  tiles: [
    'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  ],
  tileSize: 256,
  attribution:
    'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
};

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
  const r2Path = photo.r2_path || photo.r2Path || photo.r2_key || photo.r2Key;
  const r2Url = (photo.r2_url || '').trim();
  const primaryUrl = (photo.url || r2Url || '').trim();
  const fallbackUrl =
    r2PublicBase && r2Path ? `${r2PublicBase.replace(/\/$/, '')}/${r2Path}` : '';
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

// Cluster photos within ~15 feet
const FIFTEEN_FEET_METERS = 4.572;
const zoomToThresholdMeters = () => FIFTEEN_FEET_METERS;

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

class BasemapToggleControl {
  constructor({ onSelect, getActive }) {
    this._onSelect = onSelect;
    this._getActive = getActive;
    this._container = null;
  }

  onAdd(map) {
    this._map = map;
    const container = document.createElement('div');
    container.className = 'maplibregl-ctrl maplibregl-ctrl-group';

    const addButton = (label, value) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.style.padding = '0 8px';
      btn.style.fontSize = '12px';
      btn.style.minWidth = '64px';
      btn.onclick = () => this._onSelect(value);
      container.appendChild(btn);
      return btn;
    };

    this._standardBtn = addButton('Standard', 'standard');
    this._satelliteBtn = addButton('Satellite', 'satellite');
    this._container = container;
    this._updateActive();
    return container;
  }

  onRemove() {
    if (this._container && this._container.parentNode) {
      this._container.parentNode.removeChild(this._container);
    }
    this._map = undefined;
  }

  _updateActive() {
    const active = this._getActive();
    const activeClass = 'maplibregl-ctrl-active';
    if (this._standardBtn) {
      this._standardBtn.classList.toggle(activeClass, active === 'standard');
    }
    if (this._satelliteBtn) {
      this._satelliteBtn.classList.toggle(activeClass, active === 'satellite');
    }
  }

  setActive() {
    this._updateActive();
  }
}

const PhotoMapLive = () => {
  const { activeProject, projects, setActiveProject } = useAuth();
  const activeProjectId = activeProject?.id || activeProject || null;
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
  const activeStyleRef = useRef('standard');
  const satelliteHiddenLayersRef = useRef({});
  const satelliteStyledSymbolsRef = useRef({});
  const [projectToggleWidth, setProjectToggleWidth] = useState(180);
  const projectSelectRef = useRef(null);

  const selectedProjectName = useMemo(() => {
    const current =
      projects.find(p => p.id === activeProjectId)?.name || projects[0]?.name || '';
    return current || '';
  }, [projects, activeProjectId]);

  const selectedProjectCoord = useMemo(() => {
    const current = projects.find(p => p.id === activeProjectId);
    const coord =
      current?.address_coord ||
      current?.addressCoord ||
      current?.address_coordinates ||
      current?.addressCoordinates ||
      null;
    if (!coord) return null;
    const lat = Number(coord.lat ?? coord.latitude);
    const lon = Number(coord.lon ?? coord.lng ?? coord.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      return { lat, lon };
    }
    return null;
  }, [projects, activeProjectId]);

  useEffect(() => {
    // Dynamically size the project toggle to fit the selected text.
    const selectEl = projectSelectRef.current;
    if (!selectEl) return;
    // Reset to auto to measure intrinsic width.
    selectEl.style.width = 'auto';
    const scrollWidth = selectEl.scrollWidth;
    const buffer = 18; // for arrow and breathing room
    const computed = scrollWidth + buffer;
    const clamped = Math.min(Math.max(computed, 140), window.innerWidth * 0.9);
    setProjectToggleWidth(clamped);
  }, [selectedProjectName, projects.length]);

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
      style: STANDARD_STYLE_URL,
      center: [-98.5, 39.8], // USA center
      zoom: 3.5,
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

    const applyStyle = styleKey => {
      const map = mapInstance.current;
      if (!map) return;
      const center = map.getCenter();
      const zoom = map.getZoom();
      const bearing = map.getBearing();
      const pitch = map.getPitch();
      activeStyleRef.current = styleKey;
      const targetStyle = STANDARD_STYLE_URL;

      const ensureSatelliteHybrid = () => {
        try {
          const style = map.getStyle();
          if (style && Array.isArray(style.layers)) {
            const backgroundLayer = style.layers.find(l => l.type === 'background');
            if (backgroundLayer) {
              map.setPaintProperty(backgroundLayer.id, 'background-color', 'rgba(0,0,0,0)');
            }
          }
          if (!map.getSource('satellite-raster')) {
            map.addSource('satellite-raster', SATELLITE_RASTER_SOURCE);
          }
          const firstLayerId = map.getStyle()?.layers?.[0]?.id;
          if (!map.getLayer('satellite-raster')) {
            if (firstLayerId) {
              map.addLayer(
                {
                  id: 'satellite-raster',
                  type: 'raster',
                  source: 'satellite-raster',
                  minzoom: 0,
                  maxzoom: 22,
                },
                firstLayerId
              );
            } else {
              map.addLayer({
                id: 'satellite-raster',
                type: 'raster',
                source: 'satellite-raster',
                minzoom: 0,
                maxzoom: 22,
              });
            }
          }

          // Hide landuse/building fills and keep roads/labels/boundaries
          const layers = map.getStyle()?.layers || [];
          const hidden = {};
          const styledSymbols = {};
          layers.forEach(layer => {
            const { id, type } = layer;
            if (!id || !type) return;

            if (type === 'fill' || type === 'fill-extrusion' || type === 'background') {
              try {
                const prevVisibility = map.getLayoutProperty(id, 'visibility') || 'visible';
                map.setLayoutProperty(id, 'visibility', 'none');
                hidden[id] = prevVisibility;
              } catch {
                // ignore
              }
              return;
            }

            if (type === 'line') {
              const isRoad =
                id.includes('road') || id.includes('street') || id.includes('highway');
              const isBoundary = id.includes('boundary') || id.includes('admin');

              if (isBoundary) {
                return;
              }

              if (isRoad) {
                try {
                  const prevPaintColor = map.getPaintProperty(id, 'line-color');
                  const prevPaintOpacity = map.getPaintProperty(id, 'line-opacity');
                  const prevVisibility = map.getLayoutProperty(id, 'visibility') || 'visible';
                  styledSymbols[id] = {
                    lineColor: prevPaintColor,
                    lineOpacity: prevPaintOpacity,
                    visibility: prevVisibility,
                  };
                  map.setPaintProperty(id, 'line-color', '#000000');
                  map.setPaintProperty(id, 'line-opacity', 0.0);
                  map.setLayoutProperty(id, 'visibility', 'visible');
                } catch {
                  // ignore
                }
                return;
              }

              try {
                const prevVisibility = map.getLayoutProperty(id, 'visibility') || 'visible';
                map.setLayoutProperty(id, 'visibility', 'none');
                hidden[id] = prevVisibility;
              } catch {
                // ignore
              }
              return;
            }

            if (type === 'symbol') {
              try {
                const prevVisibility = map.getLayoutProperty(id, 'visibility') || 'visible';
                if (prevVisibility !== 'visible') {
                  hidden[id] = prevVisibility;
                  map.setLayoutProperty(id, 'visibility', 'visible');
                }
                const prevTextColor = map.getPaintProperty(id, 'text-color');
                const prevTextHaloColor = map.getPaintProperty(id, 'text-halo-color');
                const prevTextHaloWidth = map.getPaintProperty(id, 'text-halo-width');
                styledSymbols[id] = {
                  textColor: prevTextColor,
                  textHaloColor: prevTextHaloColor,
                  textHaloWidth: prevTextHaloWidth,
                };
                map.setPaintProperty(id, 'text-color', '#ffffff');
                map.setPaintProperty(id, 'text-halo-color', '#000000');
                map.setPaintProperty(id, 'text-halo-width', 1.5);
              } catch {
                // ignore
              }
            }
          });
          satelliteHiddenLayersRef.current = hidden;
          satelliteStyledSymbolsRef.current = styledSymbols;
        } catch (err) {
          // Non-fatal: skip hybrid overlay if anything fails
        }
      };

      const removeSatelliteHybrid = () => {
        try {
          if (map.getLayer('satellite-raster')) {
            map.removeLayer('satellite-raster');
          }
          if (map.getSource('satellite-raster')) {
            map.removeSource('satellite-raster');
          }
        } catch (err) {
          // ignore
        }

        // Restore visibilities
        const hidden = satelliteHiddenLayersRef.current || {};
        Object.entries(hidden).forEach(([layerId, prevVisibility]) => {
          try {
            const current = map.getLayoutProperty(layerId, 'visibility');
            if (current !== prevVisibility) {
              map.setLayoutProperty(layerId, 'visibility', prevVisibility);
            }
          } catch {
            // ignore
          }
        });
        satelliteHiddenLayersRef.current = {};

        // Restore symbol paint
        const styled = satelliteStyledSymbolsRef.current || {};
        Object.entries(styled).forEach(([layerId, prevPaint]) => {
          try {
            if (prevPaint.textColor !== undefined) {
              map.setPaintProperty(layerId, 'text-color', prevPaint.textColor);
            }
            if (prevPaint.textHaloColor !== undefined) {
              map.setPaintProperty(layerId, 'text-halo-color', prevPaint.textHaloColor);
            }
            if (prevPaint.textHaloWidth !== undefined) {
              map.setPaintProperty(layerId, 'text-halo-width', prevPaint.textHaloWidth);
            }
            if (prevPaint.lineColor !== undefined) {
              map.setPaintProperty(layerId, 'line-color', prevPaint.lineColor);
            }
            if (prevPaint.lineOpacity !== undefined) {
              map.setPaintProperty(layerId, 'line-opacity', prevPaint.lineOpacity);
            }
            if (prevPaint.visibility !== undefined) {
              map.setLayoutProperty(layerId, 'visibility', prevPaint.visibility);
            }
          } catch {
            // ignore
          }
        });
        satelliteStyledSymbolsRef.current = {};
      };

      const applyStandard = () => {
        removeSatelliteHybrid();
        try {
          const style = map.getStyle();
          if (style && Array.isArray(style.layers)) {
            const backgroundLayer = style.layers.find(l => l.type === 'background');
            if (backgroundLayer) {
              map.setPaintProperty(backgroundLayer.id, 'background-color', '#f8f9fa');
            }
          }
        } catch (err) {
          // ignore background restore failures
        }
      };

      if (styleKey === 'satellite') {
        ensureSatelliteHybrid();
      } else {
        applyStandard();
      }

      map.jumpTo({ center, zoom, bearing, pitch });
      toggleControl?.setActive();
    };

    const toggleControl = new BasemapToggleControl({
      onSelect: applyStyle,
      getActive: () => activeStyleRef.current,
    });

    mapInstance.current.addControl(toggleControl, 'top-right');

    return () => {
      if (supportsEvents && typeof mapInstance.current?.off === 'function') {
        mapInstance.current.off('zoomend', handleZoom);
        if (mapInstance.current.__setInteracted) {
          mapInstance.current.off(
            'dragstart',
            mapInstance.current.__setInteracted
          );
          mapInstance.current.off(
            'zoomstart',
            mapInstance.current.__setInteracted
          );
          mapInstance.current.off(
            'rotatestart',
            mapInstance.current.__setInteracted
          );
          mapInstance.current.off(
            'pitchstart',
            mapInstance.current.__setInteracted
          );
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
      if (!activeProjectId) {
        setPhotos([]);
        return;
      }
      const cached = cacheRef.current || {};
      const candidates = Array.from(
        new Set(
          [
            envApiBase,
            'http://127.0.0.1:5001',
            'http://localhost:5001',
          ].filter(Boolean)
        )
      );

      const accessToken = localStorage.getItem('access_token') || '';

      for (const base of candidates) {
        try {
          const url = new URL(`${base}/api/v1/photos/`);
          url.searchParams.set('project_id', activeProjectId);
          const res = await fetch(url.toString(), {
            headers: {
              ...(accessToken
                ? {
                    Authorization: `Bearer ${accessToken}`,
                  }
                : {}),
            },
          });
          const data = await res.json();
          if (!res.ok) {
            // try next candidate
            // eslint-disable-next-line no-continue
            continue;
          }
          const list = Array.isArray(data.photos) ? data.photos : [];
          console.debug('Fetched photos', list.length);
          if (!isCancelled) {
            setPhotos(list);
            cacheRef.current = {
              data: list,
              fetchedAt: Date.now(),
              projectId: activeProjectId,
            };
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
  }, [refreshCounter, activeProjectId]);

  const normalisedPhotos = useMemo(() => {
    return (photos || [])
      .map(photo => {
        if (photo.show_on_photos === false) {
          return null;
        }
        const latitude = parseCoordinate(photo.latitude);
        const longitudeRaw = parseCoordinate(photo.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitudeRaw)) {
          return null;
        }

        const hasGpsExif =
          photo?.exif_data &&
          photo.exif_data.gps &&
          photo.exif_data.gps.GPSLatitude &&
          photo.exif_data.gps.GPSLatitudeRef &&
          photo.exif_data.gps.GPSLongitude &&
          photo.exif_data.gps.GPSLongitudeRef;
        if (!hasGpsExif) {
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

    // Include project address coordinate if present
    if (selectedProjectCoord) {
      bounds.extend([selectedProjectCoord.lon, selectedProjectCoord.lat]);
    }

    if (!bounds.isEmpty() && !hasAutoFitRef.current) {
      if (clusters.length === 0 && selectedProjectCoord) {
        mapInstance.current.flyTo({
          center: [selectedProjectCoord.lon, selectedProjectCoord.lat],
          zoom: 13,
          essential: true,
        });
      } else {
        mapInstance.current.fitBounds(bounds, {
          padding: 60,
          maxZoom: 14,
          duration: 800,
        });
      }
      hasAutoFitRef.current = true;
    }
  }, [clusters, clearMarkers, mapZoom, selectedProjectCoord]);

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
          zIndex: 3,
          top: 8,
          left: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <select
          className="btn-format-1"
          ref={projectSelectRef}
          value={activeProjectId || (projects[0]?.id || '')}
          onChange={e => {
            const nextId = e.target.value;
            setActiveProject(nextId || null);
            cacheRef.current = { data: null, fetchedAt: 0 };
            hasAutoFitRef.current = false;
            userInteractedRef.current = false;
            setRefreshCounter(c => c + 1);
          }}
          style={{
            paddingRight: 28,
            width: `${projectToggleWidth}px`,
            whiteSpace: 'nowrap',
          }}
        >
          {projects.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
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
