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
  const stackPopupRef = useRef(null);
  const hasAutoFitRef = useRef(false);
  const userInteractedRef = useRef(false);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const activeStyleRef = useRef('standard');
  const satelliteHiddenLayersRef = useRef({});
  const satelliteStyledSymbolsRef = useRef({});
  const [projectToggleWidth, setProjectToggleWidth] = useState(180);
  const projectSelectRef = useRef(null);
  const closeStack = useCallback(() => setActiveStack(null), []);

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

  const downloadPhotos = useCallback(async items => {
    if (!items?.length) return;

    const fetchBlob = async url => {
      const res = await fetch(url, { mode: 'cors' }).catch(() => null);
      if (!res || !res.ok) {
        throw new Error('Download failed');
      }
      return res.blob();
    };

    const downloadFile = (blob, filename) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    };

    const downloadDirect = (url, filename) => {
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    const resolveName = item =>
      item.file_name || item.caption || `photo-${item.id || Date.now()}`;

    const resolveUrl = item =>
      item.primaryUrl || item.url || item.fallbackUrl || item.thumbnailUrl;

    const nameCount = new Map();
    const dedupeName = base => {
      const count = nameCount.get(base) || 0;
      nameCount.set(base, count + 1);
      if (count === 0) return base;
      const parts = base.split('.');
      if (parts.length > 1) {
        const ext = parts.pop();
        const stem = parts.join('.');
        return `${stem}(${count}).${ext}`;
      }
      return `${base}(${count})`;
    };

    const accessToken = localStorage.getItem('access_token') || '';
    const tryServerZip = async () => {
      const apiUrl = envApiBase?.replace(/\/$/, '');
      if (!apiUrl) return false;
      try {
        const payload = {
          items: items
            .map(item => {
              const url = resolveUrl(item);
              if (!url) return null;
              return { url, name: dedupeName(resolveName(item)) };
            })
            .filter(Boolean),
        };
        if (!payload.items.length) return false;

        const res = await fetch(`${apiUrl}/api/v1/photos/download-zip`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) return false;
        const zipBlob = await res.blob();
        downloadFile(zipBlob, `photos-${Date.now()}.zip`);
        return true;
      } catch {
        return false;
      }
    };

    try {
      if (items.length > 1) {
        const zipped = await tryServerZip();
        if (zipped) return;
      }

      if (items.length === 1) {
        const item = items[0];
        const url = resolveUrl(item);
        if (!url) throw new Error('No URL to download');
        downloadDirect(url, resolveName(item));
        return;
      }

      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      let added = 0;
      const failed = [];

      for (const item of items) {
        const url = resolveUrl(item);
        if (!url) continue;
        try {
          // eslint-disable-next-line no-await-in-loop
          const blob = await fetchBlob(url);
          const name = dedupeName(resolveName(item));
          zip.file(name, blob);
          added += 1;
        } catch (error) {
          failed.push(item);
        }
      }

      if (added > 0) {
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        downloadFile(zipBlob, `photos-${Date.now()}.zip`);
      } else if (failed.length) {
        failed.forEach(item => {
          const url = resolveUrl(item);
          if (url) downloadDirect(url, resolveName(item));
        });
      }
    } catch {
      // Soft-fail; in future surface toast.
    }
  }, []);

  useEffect(() => {
    if (!mapInstance.current) return;

    clearMarkers();

    const bounds = new maplibregl.LngLatBounds();

    const createPhotoMarker = photo => {
      const container = document.createElement('div');
      container.style.width = '18px';
      container.style.height = '18px';
      container.style.borderRadius = '50%';
      container.style.background = '#61dafb';
      container.style.border = '1px solid #61dafb';
      container.style.boxShadow = '0 2px 6px rgba(0,0,0,0.12)';
      container.style.display = 'grid';
      container.style.placeItems = 'center';
      container.title = photo.caption || 'View photo';

      const innerDot = document.createElement('div');
      innerDot.style.width = '6px';
      innerDot.style.height = '6px';
      innerDot.style.borderRadius = '50%';
      innerDot.style.background = '#2ca7e5';
      innerDot.style.boxShadow = '0 0 0 2px rgba(44,167,229,0.18)';
      container.appendChild(innerDot);

      const wrapper = document.createElement('div');
      wrapper.style.maxWidth = '260px';
      wrapper.style.padding = '10px 10px 12px 10px';
      wrapper.style.background = '#ffffff';
      wrapper.style.borderRadius = '12px';
      wrapper.style.boxShadow = '0 8px 18px rgba(0,0,0,0.12)';
      wrapper.style.overflow = 'hidden';

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

      const footer = document.createElement('div');
      footer.style.marginTop = '8px';
      footer.style.display = 'flex';
      footer.style.alignItems = 'center';
      footer.style.justifyContent = 'space-between';

      const timestamp = document.createElement('div');
      timestamp.style.fontSize = '12px';
      timestamp.style.color = '#555';
      timestamp.textContent = formatTimestamp(photo.createdAt || photo.created_at || '');

      const dl = document.createElement('a');
      dl.textContent = '⤓';
      dl.setAttribute('aria-label', 'Download photo');
      dl.href = photo.primaryUrl || photo.url;
      dl.target = '_blank';
      dl.rel = 'noopener noreferrer';
      dl.download = '';
      dl.style.fontSize = '18px';
      dl.style.color = '#1e88e5';
      dl.style.textDecoration = 'none';
      dl.style.fontWeight = '700';
      dl.style.display = 'inline-flex';
      dl.style.alignItems = 'center';
      dl.style.justifyContent = 'center';
      dl.style.padding = '2px 6px';
      dl.style.borderRadius = '6px';
      dl.style.transition = 'color 0.15s ease, background 0.15s ease';
      dl.onmouseover = () => {
        dl.style.color = '#1565c0';
        dl.style.background = 'rgba(21,101,192,0.08)';
      };
      dl.onmouseout = () => {
        dl.style.color = '#1e88e5';
        dl.style.background = 'transparent';
      };

      footer.appendChild(timestamp);
      footer.appendChild(dl);
      wrapper.appendChild(footer);

      const popup = new maplibregl.Popup({ offset: 24, closeButton: true }).setDOMContent(wrapper);
      popup.on('open', () => {
        const el = popup.getElement();
        const closeBtn = el?.querySelector('.maplibregl-popup-close-button');
        if (closeBtn) {
          closeBtn.style.width = '22px';
          closeBtn.style.height = '22px';
          closeBtn.style.fontSize = '18px';
          closeBtn.style.lineHeight = '18px';
          closeBtn.style.top = '6px';
          closeBtn.style.right = '6px';
          closeBtn.style.background = '#fff';
          closeBtn.style.borderRadius = '50%';
          closeBtn.style.boxShadow = '0 1px 4px rgba(0,0,0,0.15)';
        }
        const content = el?.querySelector('.maplibregl-popup-content');
        if (content) {
          content.style.borderRadius = '12px';
          content.style.padding = '0';
        }
      });
      const marker = new maplibregl.Marker({ element: container })
        .setLngLat([photo.mapLongitude, photo.mapLatitude])
        .setPopup(popup)
        .addTo(mapInstance.current);

      return marker;
    };

    const createClusterMarker = cluster => {
      const button = document.createElement('button');
      button.type = 'button';
      button.style.width = '20px';
      button.style.height = '20px';
      button.style.borderRadius = '50%';
      button.style.background = '#282c34';
      button.style.border = '1px solid #282c34';
      button.style.boxShadow = '0 2px 6px rgba(0,0,0,0.16)';
      button.style.cursor = 'pointer';
      button.style.display = 'grid';
      button.style.placeItems = 'center';
      button.style.padding = '0';
      button.style.position = 'relative';
      button.setAttribute(
        'aria-label',
        `${cluster.photos.length} photos at this location`
      );

      const core = document.createElement('div');
      core.style.width = '6px';
      core.style.height = '6px';
      core.style.borderRadius = '50%';
      core.style.background = '#61dafb';
      core.style.boxShadow = '0 0 0 3px rgba(97,218,251,0.16)';
      button.appendChild(core);

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

  useEffect(() => {
    if (stackPopupRef.current) {
      stackPopupRef.current.remove();
      stackPopupRef.current = null;
    }
    if (!activeStack || !mapInstance.current) return undefined;

    const root = document.createElement('div');
    root.style.maxWidth = '320px';
    root.style.padding = '10px 10px 12px';
    root.style.background = '#ffffff';
    root.style.borderRadius = '12px';
    root.style.boxShadow = 'none';
    root.style.display = 'flex';
    root.style.flexDirection = 'column';
    root.style.gap = '8px';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';

    const titleRow = document.createElement('div');
    titleRow.style.display = 'flex';
    titleRow.style.alignItems = 'center';
    titleRow.style.gap = '6px';

    const title = document.createElement('div');
    title.textContent = 'Grouped Photos';
    title.style.fontWeight = '700';
    title.style.fontSize = '14px';
    title.style.color = '#1f2937';

    const count = document.createElement('div');
    count.textContent = `${activeStack.photos.length} items`;
    count.style.fontSize = '13px';
    count.style.color = '#4b5563';

    titleRow.appendChild(title);
    titleRow.appendChild(count);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '×';
    closeBtn.style.width = '22px';
    closeBtn.style.height = '22px';
    closeBtn.style.fontSize = '18px';
    closeBtn.style.lineHeight = '18px';
    closeBtn.style.background = '#fff';
    closeBtn.style.borderRadius = '50%';
    closeBtn.style.border = '1px solid rgba(0,0,0,0.08)';
    closeBtn.style.boxShadow = '0 1px 4px rgba(0,0,0,0.15)';
    closeBtn.style.cursor = 'pointer';
    closeBtn.onclick = evt => {
      evt.stopPropagation();
      closeStack();
    };

    header.appendChild(titleRow);
    header.appendChild(closeBtn);
    root.appendChild(header);

    const list = document.createElement('div');
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '8px';

    activeStack.photos.forEach((photo, index) => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '12px';
      row.style.padding = '10px';
      row.style.background = '#f8fafc';
      row.style.borderRadius = '10px';

      const thumb = document.createElement('img');
      thumb.alt = photo.caption || `Photo ${index + 1}`;
      thumb.src =
        photo.thumbnailUrl ||
        photo.primaryUrl ||
        photo.url ||
        photo.fallbackUrl ||
        '';
      thumb.style.width = '96px';
      thumb.style.height = '96px';
      thumb.style.objectFit = 'cover';
      thumb.style.borderRadius = '8px';
      thumb.style.background = '#e5e7eb';
      thumb.onerror = () => {
        thumb.style.display = 'none';
      };

      const meta = document.createElement('div');
      meta.style.display = 'flex';
      meta.style.flexDirection = 'column';
      meta.style.gap = '6px';
      meta.style.flex = '1';

      const time = document.createElement('div');
      time.textContent = formatTimestamp(photo.createdAt || photo.created_at || '');
      time.style.fontSize = '13px';
      time.style.color = '#1f2937';
      time.style.fontWeight = '600';

      meta.appendChild(time);

      const dl = document.createElement('a');
      dl.textContent = '⤓';
      dl.setAttribute('aria-label', 'Download photo');
      dl.href = '#';
      dl.style.fontSize = '18px';
      dl.style.color = '#1e88e5';
      dl.style.textDecoration = 'none';
      dl.style.fontWeight = '700';
      dl.style.display = 'inline-flex';
      dl.style.alignItems = 'center';
      dl.style.justifyContent = 'center';
      dl.style.padding = '2px 6px';
      dl.style.borderRadius = '6px';
      dl.style.transition = 'color 0.15s ease, background 0.15s ease';
      dl.onmouseover = () => {
        dl.style.color = '#1565c0';
        dl.style.background = 'rgba(21,101,192,0.08)';
      };
      dl.onmouseout = () => {
        dl.style.color = '#1e88e5';
        dl.style.background = 'transparent';
      };
      dl.onclick = evt => {
        evt.preventDefault();
        evt.stopPropagation();
        downloadPhotos([photo]);
      };

      row.appendChild(thumb);
      row.appendChild(meta);
      row.appendChild(dl);
      list.appendChild(row);
    });

    root.appendChild(list);

    const downloadAll = document.createElement('button');
    downloadAll.type = 'button';
    downloadAll.className = 'btn-format-1';
    downloadAll.textContent = `Download all (${activeStack.photos.length})`;
    downloadAll.style.alignSelf = 'flex-end';
    downloadAll.style.marginTop = '4px';
    downloadAll.onclick = async evt => {
      evt.stopPropagation();
      await downloadPhotos(activeStack.photos);
    };

    root.appendChild(downloadAll);

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      anchor: 'left',
      offset: [16, 0],
      maxWidth: '340px',
    })
      .setDOMContent(root)
      .setLngLat([activeStack.longitude, activeStack.latitude])
      .addTo(mapInstance.current);

    stackPopupRef.current = popup;

    const popupEl = popup?.getElement?.();
    if (popupEl) {
      popupEl.style.background = 'transparent';
      popupEl.style.boxShadow = 'none';
      popupEl.style.padding = '0';
      const tip = popupEl.querySelector('.maplibregl-popup-tip');
      if (tip) tip.style.display = 'none';
      const content = popupEl.querySelector('.maplibregl-popup-content');
      if (content) {
        content.style.background = 'transparent';
        content.style.boxShadow = 'none';
        content.style.padding = '0';
      }
    }

    return () => popup.remove();
  }, [activeStack, closeStack, downloadPhotos]);

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
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
};

export default PhotoMapLive;
