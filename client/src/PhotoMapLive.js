import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useAuth } from './context';
import EditLocationModal from './components/map/EditLocationModal';
import { getApiCandidates } from './utils/apiEnv';
import { useProjectMapData } from './hooks/useProjectMapData';
import { formatLocalDateTimeParts } from './utils/mapDataUtils';
import {
  addMarkersToMap,
  clearMarkers,
  renderStackPopup,
} from './utils/mapMarkerRendering';

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

const envApiBases = getApiCandidates();

class BasemapToggleControl {
  constructor({ onSelect, getActive }) {
    this._onSelect = onSelect;
    this._getActive = getActive;
    this._container = null;
  }

  onAdd(map) {
    this._map = map;
    const container = document.createElement('div');
    container.className = 'maplibregl-ctrl';
    container.style.display = 'flex';
    container.style.background = 'var(--color-surface-primary)';
    container.style.border = '1px solid var(--color-border)';
    container.style.borderRadius = 'var(--radius-lg)';
    container.style.boxShadow = 'var(--shadow-xs)';
    container.style.overflow = 'hidden';

    const addButton = (label, value) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.style.padding = '6px 14px';
      btn.style.fontSize = 'var(--font-size-base)';
      btn.style.fontWeight = 'var(--font-weight-medium)';
      btn.style.fontFamily = 'var(--font-family-sans)';
      btn.style.border = 'none';
      btn.style.borderRadius = '0';
      btn.style.cursor = 'pointer';
      btn.style.transition = 'background 150ms ease, color 150ms ease';
      btn.style.lineHeight = 'var(--line-height-snug)';
      btn.style.whiteSpace = 'nowrap';
      btn.onclick = () => this._onSelect(value);
      btn.onmouseenter = () => {
        if (this._getActive() !== value) {
          btn.style.background = 'rgba(183,205,230,0.28)';
        }
      };
      btn.onmouseleave = () => {
        if (this._getActive() !== value) {
          btn.style.background = 'var(--color-surface-primary)';
          btn.style.color = 'var(--color-text-primary)';
        }
      };
      container.appendChild(btn);
      return btn;
    };

    this._standardBtn = addButton('Standard', 'standard');

    const divider = document.createElement('div');
    divider.style.width = '1px';
    divider.style.background = 'var(--color-border)';
    divider.style.alignSelf = 'stretch';
    container.appendChild(divider);

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
    if (this._standardBtn) {
      const isActive = active === 'standard';
      this._standardBtn.style.background = isActive
        ? 'var(--color-primary)'
        : 'var(--color-surface-primary)';
      this._standardBtn.style.color = isActive
        ? 'var(--color-surface-primary)'
        : 'var(--color-text-primary)';
    }
    if (this._satelliteBtn) {
      const isActive = active === 'satellite';
      this._satelliteBtn.style.background = isActive
        ? 'var(--color-primary)'
        : 'var(--color-surface-primary)';
      this._satelliteBtn.style.color = isActive
        ? 'var(--color-surface-primary)'
        : 'var(--color-text-primary)';
    }
  }

  setActive() {
    this._updateActive();
  }
}

const PhotoMapLive = () => {
  const navigate = useNavigate();
  const { activeProject, projects, setActiveProject, roleForActiveProject } =
    useAuth();
  const activeProjectId = activeProject?.id || activeProject || null;
  const role = roleForActiveProject ? roleForActiveProject() : null;
  const canManage =
    (role || '').toLowerCase() === 'owner' ||
    (role || '').toLowerCase() === 'administrator';
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [activeStack, setActiveStack] = useState(null);
  const [projectMarkerOverride, setProjectMarkerOverride] = useState(null);
  const [editLocationOpen, setEditLocationOpen] = useState(false);
  const [isDragMode, setIsDragMode] = useState(false);
  const markersRef = useRef([]);
  const photoPopupRef = useRef(null);
  const projectLocationPopupRef = useRef(null);
  const hasAutoFitRef = useRef(false);
  const userInteractedRef = useRef(false);
  const [refreshCounter, setRefreshCounter] = useState(0);

  const { projectMarker, clusters } = useProjectMapData(
    activeProjectId,
    refreshCounter,
    {
      projectMarkerOverride,
    }
  );
  const activeStyleRef = useRef('standard');
  const satelliteHiddenLayersRef = useRef({});
  const satelliteStyledSymbolsRef = useRef({});
  const [projectToggleWidth, setProjectToggleWidth] = useState(180);
  const projectSelectRef = useRef(null);
  const closeStack = useCallback(() => setActiveStack(null), []);
  const closePhotoPopup = useCallback(() => {
    if (photoPopupRef.current) {
      photoPopupRef.current.remove();
      photoPopupRef.current = null;
    }
  }, []);

  const handleLocationModeChange = useCallback(newMode => {
    setIsDragMode(newMode === 'drag');
  }, []);

  const handleLocationSave = useCallback(data => {
    const newLocation = data.location || null;
    setProjectMarkerOverride(newLocation);
    setRefreshCounter(c => c + 1);
    hasAutoFitRef.current = false;
    userInteractedRef.current = false;
    setIsDragMode(false);
    setEditLocationOpen(false);
    if (newLocation && mapInstance.current) {
      const newLat = Number(newLocation.latitude);
      const newLng = Number(newLocation.longitude);
      if (Number.isFinite(newLat) && Number.isFinite(newLng)) {
        mapInstance.current.flyTo({
          center: [newLng, newLat],
          zoom: Math.max(mapInstance.current.getZoom?.() ?? 10, 13),
          essential: true,
        });
      }
    }
  }, []);

  const selectedProjectName = useMemo(() => {
    const current =
      projects.find(p => p.id === activeProjectId)?.name ||
      projects[0]?.name ||
      '';
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

  const openPhotoOptions = useCallback(
    photo => {
      if (!photo?.id) return;
      navigate(`/photos/${photo.id}/options`, { state: { from: 'map' } });
    },
    [navigate]
  );

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

  const markerRefs = useMemo(
    () => ({
      markersRef,
      photoPopupRef,
      projectLocationPopupRef,
    }),
    []
  );

  const clearMarkersCallback = useCallback(() => {
    clearMarkers(markerRefs);
  }, [markerRefs]);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    try {
      mapInstance.current = new maplibregl.Map({
        container: mapRef.current,
        style: STANDARD_STYLE_URL,
        center: [-98.5, 39.8], // USA center
        zoom: 3.5,
        transformRequest: (url, resourceType) => {
          // Ensure proper CORS headers for style and tile requests
          if (
            resourceType === 'Style' ||
            resourceType === 'Source' ||
            resourceType === 'Tile'
          ) {
            return {
              url: url,
              headers: {},
              credentials: 'omit',
            };
          }
        },
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error initializing map:', error);
      return;
    }

    if (typeof mapInstance.current?.addControl === 'function') {
      mapInstance.current.addControl(
        new maplibregl.NavigationControl(),
        'top-right'
      );
    }

    const handleLoad = () => {
      setIsMapReady(true);
    };

    const handleError = e => {
      // eslint-disable-next-line no-console
      console.error('Map error:', e);
    };

    const supportsEvents = typeof mapInstance.current?.on === 'function';
    if (supportsEvents) {
      mapInstance.current.on('load', handleLoad);
      mapInstance.current.on('error', handleError);
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
      const ensureSatelliteHybrid = () => {
        try {
          const style = map.getStyle();
          if (style && Array.isArray(style.layers)) {
            const backgroundLayer = style.layers.find(
              l => l.type === 'background'
            );
            if (backgroundLayer) {
              map.setPaintProperty(
                backgroundLayer.id,
                'background-color',
                'rgba(0,0,0,0)'
              );
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

            if (
              type === 'fill' ||
              type === 'fill-extrusion' ||
              type === 'background'
            ) {
              try {
                const prevVisibility =
                  map.getLayoutProperty(id, 'visibility') || 'visible';
                map.setLayoutProperty(id, 'visibility', 'none');
                hidden[id] = prevVisibility;
              } catch {
                // ignore
              }
              return;
            }

            if (type === 'line') {
              const isRoad =
                id.includes('road') ||
                id.includes('street') ||
                id.includes('highway');
              const isBoundary =
                id.includes('boundary') || id.includes('admin');

              if (isBoundary) {
                return;
              }

              if (isRoad) {
                try {
                  const prevPaintColor = map.getPaintProperty(id, 'line-color');
                  const prevPaintOpacity = map.getPaintProperty(
                    id,
                    'line-opacity'
                  );
                  const prevVisibility =
                    map.getLayoutProperty(id, 'visibility') || 'visible';
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
                const prevVisibility =
                  map.getLayoutProperty(id, 'visibility') || 'visible';
                map.setLayoutProperty(id, 'visibility', 'none');
                hidden[id] = prevVisibility;
              } catch {
                // ignore
              }
              return;
            }

            if (type === 'symbol') {
              try {
                const prevVisibility =
                  map.getLayoutProperty(id, 'visibility') || 'visible';
                if (prevVisibility !== 'visible') {
                  hidden[id] = prevVisibility;
                  map.setLayoutProperty(id, 'visibility', 'visible');
                }
                const prevTextColor = map.getPaintProperty(id, 'text-color');
                const prevTextHaloColor = map.getPaintProperty(
                  id,
                  'text-halo-color'
                );
                const prevTextHaloWidth = map.getPaintProperty(
                  id,
                  'text-halo-width'
                );
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
              map.setPaintProperty(
                layerId,
                'text-halo-color',
                prevPaint.textHaloColor
              );
            }
            if (prevPaint.textHaloWidth !== undefined) {
              map.setPaintProperty(
                layerId,
                'text-halo-width',
                prevPaint.textHaloWidth
              );
            }
            if (prevPaint.lineColor !== undefined) {
              map.setPaintProperty(layerId, 'line-color', prevPaint.lineColor);
            }
            if (prevPaint.lineOpacity !== undefined) {
              map.setPaintProperty(
                layerId,
                'line-opacity',
                prevPaint.lineOpacity
              );
            }
            if (prevPaint.visibility !== undefined) {
              map.setLayoutProperty(
                layerId,
                'visibility',
                prevPaint.visibility
              );
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
            const backgroundLayer = style.layers.find(
              l => l.type === 'background'
            );
            if (backgroundLayer) {
              map.setPaintProperty(
                backgroundLayer.id,
                'background-color',
                '#f8f9fa'
              );
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
      setIsMapReady(false);
      if (supportsEvents && typeof mapInstance.current?.off === 'function') {
        mapInstance.current.off('load', handleLoad);
        mapInstance.current.off('error', handleError);
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
      clearMarkersCallback();
      if (typeof mapInstance.current?.remove === 'function') {
        mapInstance.current.remove();
      }
      mapInstance.current = null;
    };
  }, [clearMarkersCallback, closeStack, closePhotoPopup]);

  useEffect(() => {
    // Close popups/stacks only when clicking the map background.
    // We intentionally do NOT use MapLibre's map 'click' event here because it can fire for
    // marker DOM clicks in some browsers, causing "open then instantly close" behavior.
    const mapContainer = mapRef.current;
    if (!mapContainer) return;

    const handleDocumentClickCapture = evt => {
      const target = evt?.target;
      if (!target || typeof target.closest !== 'function') return;

      // Ignore clicks on markers, popups, or MapLibre controls.
      if (
        target.closest('.maplibregl-marker') ||
        target.closest('.maplibregl-popup') ||
        target.closest('.maplibregl-ctrl')
      ) {
        return;
      }

      // Only react to clicks that occur within the map container.
      if (!target.closest(`[data-photo-map-live="1"]`)) return;

      if (projectLocationPopupRef.current) {
        try {
          projectLocationPopupRef.current.remove();
        } catch {
          // ignore
        }
        projectLocationPopupRef.current = null;
      }
      closeStack();
      closePhotoPopup();
    };

    document.addEventListener('click', handleDocumentClickCapture, true);
    return () => {
      document.removeEventListener('click', handleDocumentClickCapture, true);
    };
  }, [closePhotoPopup, closeStack]);

  useEffect(() => {
    setProjectMarkerOverride(null);
  }, [activeProjectId]);

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
      const apiUrl = envApiBases?.[0]?.replace(/\/$/, '');
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
    if (!mapInstance.current || !isMapReady) return;

    const result = addMarkersToMap(mapInstance.current, markerRefs, {
      clusters,
      projectMarker,
      canManage,
      selectedProjectName,
      openPhotoOptions,
      closePhotoPopup,
      closeStack,
      setActiveStack,
      onEditProjectLocation: () => setEditLocationOpen(true),
      formatDateTimeParts: formatLocalDateTimeParts,
      isDragMode,
    });

    const { bounds, hasProjectPin, pmLat, pmLng } = result;

    // Auto-fit priority (Map page only)
    if (!hasAutoFitRef.current && !userInteractedRef.current && !isDragMode) {
      if (hasProjectPin && clusters.length === 0) {
        mapInstance.current.flyTo({
          center: [pmLng, pmLat],
          zoom: 13,
          essential: true,
        });
        hasAutoFitRef.current = true;
      } else if (hasProjectPin && clusters.length > 0 && bounds) {
        bounds.extend([pmLng, pmLat]);
        mapInstance.current.fitBounds(bounds, {
          padding: 60,
          maxZoom: 19,
          duration: 800,
        });
        hasAutoFitRef.current = true;
      } else if (bounds && !bounds.isEmpty()) {
        mapInstance.current.fitBounds(bounds, {
          padding: 60,
          maxZoom: 19,
          duration: 800,
        });
        hasAutoFitRef.current = true;
      } else if (selectedProjectCoord) {
        mapInstance.current.flyTo({
          center: [selectedProjectCoord.lon, selectedProjectCoord.lat],
          zoom: 13,
          essential: true,
        });
        hasAutoFitRef.current = true;
      }
    }

    return () => clearMarkers(markerRefs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    clusters,
    closePhotoPopup,
    closeStack,
    isDragMode,
    isMapReady,
    canManage,
    projectMarker,
    selectedProjectCoord,
    selectedProjectName,
  ]);

  useEffect(() => {
    if (!activeStack || !mapInstance.current) return undefined;
    return renderStackPopup(mapInstance.current, activeStack, {
      closeStack,
      formatDateTimeParts: formatLocalDateTimeParts,
      openPhotoOptions,
      downloadPhotos,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStack, closeStack, downloadPhotos]);

  // eslint-disable-next-line no-unused-vars
  const handlePhotoSelect = photo => {
    if (!photo) return;

    if (mapInstance.current) {
      const canFly =
        typeof mapInstance.current.flyTo === 'function' &&
        Number.isFinite(photo.mapLongitude) &&
        Number.isFinite(photo.mapLatitude);
      if (canFly) {
        const currentZoom = mapInstance.current.getZoom?.();
        const zoom = Number.isFinite(currentZoom)
          ? Math.max(currentZoom, 11)
          : 11;
        mapInstance.current.flyTo({
          center: [photo.mapLongitude, photo.mapLatitude],
          zoom,
          essential: true,
        });
      }
    }

    if (photo.url && typeof window !== 'undefined') {
      window.open(photo.url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div
      data-photo-map-live="1"
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
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
          value={activeProjectId || projects[0]?.id || ''}
          onChange={e => {
            const nextId = e.target.value;
            setActiveProject(nextId || null);
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
      <EditLocationModal
        open={editLocationOpen}
        onClose={() => {
          setEditLocationOpen(false);
          setIsDragMode(false);
        }}
        onSave={handleLocationSave}
        projectId={activeProjectId}
        projectMarker={projectMarker}
        mapInstance={mapInstance}
        onModeChange={handleLocationModeChange}
      />
    </div>
  );
};

export default PhotoMapLive;
