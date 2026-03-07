import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useAuth } from '../context';
import apiClient from '../services/api';
import UploadPlanModal from '../components/plan/UploadPlanModal';
import PlanMapMarkers from '../components/plan/PlanMapMarkers';
import EditLocationModal from '../components/map/EditLocationModal';

const SATELLITE_RASTER_SOURCE = {
  type: 'raster',
  tiles: [
    'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  ],
  tileSize: 256,
  attribution:
    'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
};

const MINIMAL_BASE_STYLE = {
  version: 8,
  sources: {
    'minimal-raster': SATELLITE_RASTER_SOURCE,
  },
  layers: [
    {
      id: 'minimal-raster',
      type: 'raster',
      source: 'minimal-raster',
      paint: { 'raster-opacity': 0.2 },
    },
  ],
};

const DEFAULT_CENTER = [-98.5, 39.8];
const DEFAULT_ZOOM = 3.5;

const PLAN_FIT_PADDING = 50;
const PLAN_FIT_MAX_ZOOM = 22;

/**
 * Compute MapLibre LngLatBounds from plan metadata corner coordinates.
 * Uses corner_nw, corner_ne, corner_se, corner_sw (from stored min/max or API).
 * Returns null if any corner is missing.
 */
function getPlanBounds(planMetadata) {
  if (!planMetadata) return null;
  const coords = [
    planMetadata.corner_nw,
    planMetadata.corner_ne,
    planMetadata.corner_se,
    planMetadata.corner_sw,
  ].filter(Boolean);
  if (coords.length !== 4) return null;
  const bounds = new maplibregl.LngLatBounds();
  coords.forEach(c => bounds.extend(c));
  return bounds;
}

function derivePlanCorners(plan) {
  const minLat = plan?.min_lat;
  const minLng = plan?.min_lng;
  const maxLat = plan?.max_lat;
  const maxLng = plan?.max_lng;
  if (
    minLat == null ||
    minLng == null ||
    maxLat == null ||
    maxLng == null ||
    !Number.isFinite(minLat) ||
    !Number.isFinite(minLng) ||
    !Number.isFinite(maxLat) ||
    !Number.isFinite(maxLng)
  ) {
    return null;
  }
  return {
    corner_nw: [minLng, maxLat],
    corner_ne: [maxLng, maxLat],
    corner_se: [maxLng, minLat],
    corner_sw: [minLng, minLat],
  };
}

const PlanPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { activeProject, setActiveProject, roleForActiveProject, projects } =
    useAuth();
  const projectSelectRef = useRef(null);
  const [projectSelectWidth, setProjectSelectWidth] = useState(180);

  const projectId = id || null;
  const activeProjectId = activeProject?.id || activeProject || null;
  const currentProjectId = projectId || activeProjectId;

  useEffect(() => {
    if (currentProjectId && currentProjectId !== activeProjectId) {
      setActiveProject(currentProjectId);
    }
  }, [activeProjectId, currentProjectId, setActiveProject]);

  const role = useMemo(
    () => (currentProjectId ? roleForActiveProject(currentProjectId) : null),
    [currentProjectId, roleForActiveProject]
  );
  const canManagePlan = useMemo(() => {
    const r = (role || '').toLowerCase();
    return r === 'owner' || r === 'administrator';
  }, [role]);

  const selectedProjectName = useMemo(
    () => (projects || []).find(p => p.id === currentProjectId)?.name || '',
    [projects, currentProjectId]
  );

  useEffect(() => {
    const selectEl = projectSelectRef.current;
    if (!selectEl || !selectedProjectName) return;
    selectEl.style.width = 'auto';
    const scrollWidth = selectEl.scrollWidth;
    const buffer = 18;
    const computed = Math.min(
      Math.max(scrollWidth + buffer, 140),
      typeof window !== 'undefined' ? window.innerWidth * 0.9 : 400
    );
    setProjectSelectWidth(computed);
  }, [selectedProjectName, projects.length]);

  const projectCenter = useMemo(() => {
    const proj = (projects || []).find(p => p.id === currentProjectId);
    const raw =
      proj?.address_coord ||
      proj?.addressCoord ||
      proj?.address_coordinates ||
      null;
    if (!raw) return null;
    const parsed =
      typeof raw === 'string'
        ? (() => {
            try {
              return JSON.parse(raw);
            } catch {
              return null;
            }
          })()
        : raw;
    if (!parsed) return null;
    const lat = Number(parsed.lat ?? parsed.latitude);
    const lng = Number(parsed.lng ?? parsed.lon ?? parsed.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }, [projects, currentProjectId]);

  const [planLoading, setPlanLoading] = useState(true);
  const [planError, setPlanError] = useState('');
  const [plan, setPlan] = useState(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [removePlanLoading, setRemovePlanLoading] = useState(false);
  const [removePlanError, setRemovePlanError] = useState('');
  const [isMapReady, setIsMapReady] = useState(false);
  const [editLocationOpen, setEditLocationOpen] = useState(false);
  const [projectMarkerForEdit, setProjectMarkerForEdit] = useState(null);
  const [refreshMarkersKey, setRefreshMarkersKey] = useState(0);

  const planMetadata = useMemo(() => {
    if (!plan) return null;
    const corners = derivePlanCorners(plan);
    return {
      imageUrl: plan.image_url || null,
      corner_nw: corners?.corner_nw,
      corner_ne: corners?.corner_ne,
      corner_se: corners?.corner_se,
      corner_sw: corners?.corner_sw,
    };
  }, [plan]);

  const fetchPlan = useCallback(async () => {
    if (!currentProjectId) return;
    setPlanLoading(true);
    setPlanError('');
    try {
      const resp = await apiClient.get(`/v1/projects/${currentProjectId}/plan`);
      setPlan(resp?.plan ?? null);
    } catch (err) {
      setPlan(null);
      setPlanError(
        err?.payload?.error || err?.message || 'Unable to load plan'
      );
    } finally {
      setPlanLoading(false);
    }
  }, [currentProjectId]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  const mapRef = useRef(null);
  const mapWrapperRef = useRef(null);
  const mapInstance = useRef(null);
  const planOverlayAddedRef = useRef(false);

  useEffect(() => {
    if (!plan || !mapRef.current || mapInstance.current) return;

    planOverlayAddedRef.current = false;

    try {
      mapInstance.current = new maplibregl.Map({
        container: mapRef.current,
        style: MINIMAL_BASE_STYLE,
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        transformRequest: (url, resourceType) => {
          if (
            resourceType === 'Style' ||
            resourceType === 'Source' ||
            resourceType === 'Tile'
          ) {
            return {
              url,
              headers: {},
              credentials: 'omit',
            };
          }
        },
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Plan map init error:', error);
      return;
    }

    const map = mapInstance.current;

    if (typeof map?.addControl === 'function') {
      map.addControl(new maplibregl.NavigationControl(), 'top-right');
    }

    const removePlanOverlay = () => {
      if (!map) return;
      try {
        if (map.getLayer('plan-overlay')) {
          map.removeLayer('plan-overlay');
        }
        if (map.getSource('plan-image')) {
          map.removeSource('plan-image');
        }
      } catch {
        // ignore
      }
      planOverlayAddedRef.current = false;
    };

    const addPlanOverlay = () => {
      if (!map || !planMetadata?.imageUrl || planOverlayAddedRef.current)
        return;
      const coords = [
        planMetadata.corner_nw,
        planMetadata.corner_ne,
        planMetadata.corner_se,
        planMetadata.corner_sw,
      ].filter(Boolean);
      if (coords.length !== 4) return;

      try {
        if (map.getSource('plan-image')) {
          map.removeSource('plan-image');
        }
        map.addSource('plan-image', {
          type: 'image',
          url: planMetadata.imageUrl,
          coordinates: coords,
        });
        if (!map.getLayer('plan-overlay')) {
          map.addLayer({
            id: 'plan-overlay',
            type: 'raster',
            source: 'plan-image',
            minzoom: 0,
            maxzoom: 24,
          });
        }
        planOverlayAddedRef.current = true;

        const bounds = getPlanBounds(planMetadata);
        if (bounds) {
          map.fitBounds(bounds, {
            padding: PLAN_FIT_PADDING,
            maxZoom: PLAN_FIT_MAX_ZOOM,
            duration: 0,
          });
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Plan overlay error:', err);
      }
    };

    const onStyleData = () => {
      if (map.isStyleLoaded() && !planOverlayAddedRef.current) {
        addPlanOverlay();
      }
    };

    const onLoad = () => {
      setIsMapReady(true);
      if (map.isStyleLoaded()) {
        addPlanOverlay();
      }
    };

    if (typeof map?.on === 'function') {
      map.on('load', onLoad);
      map.on('styledata', onStyleData);
    }

    return () => {
      setIsMapReady(false);
      if (typeof map?.off === 'function') {
        map.off('load', onLoad);
        map.off('styledata', onStyleData);
      }
      removePlanOverlay();
      if (mapInstance.current) {
        try {
          mapInstance.current.remove();
        } catch {
          // ignore
        }
        mapInstance.current = null;
      }
    };
  }, [plan, planMetadata]);

  const handleUploadPlan = useCallback(() => {
    setUploadModalOpen(true);
  }, []);

  const handleReplacePlan = useCallback(() => {
    setRemovePlanError('');
    setUploadModalOpen(true);
  }, []);

  const handleRemovePlan = useCallback(async () => {
    if (
      !currentProjectId ||
      !window.confirm(
        'Remove this plan? Photos and locations will not be affected.'
      )
    ) {
      return;
    }
    setRemovePlanLoading(true);
    setRemovePlanError('');
    try {
      await apiClient.delete(`/v1/projects/${currentProjectId}/plan`);
      setPlan(null);
    } catch (err) {
      setRemovePlanError(
        err?.payload?.message || err?.message || 'Unable to remove plan'
      );
    } finally {
      setRemovePlanLoading(false);
    }
  }, [currentProjectId]);

  const handleCalibrationComplete = useCallback(
    (payload = {}) => {
      if (payload?.planCreated) {
        fetchPlan();
      }
    },
    [fetchPlan]
  );

  const handleCloseUploadModal = useCallback(() => {
    setUploadModalOpen(false);
  }, []);

  const handleFitPlan = useCallback(() => {
    const map = mapInstance.current;
    if (!map || !planMetadata) return;
    const bounds = getPlanBounds(planMetadata);
    if (!bounds) return;
    map.fitBounds(bounds, {
      padding: PLAN_FIT_PADDING,
      maxZoom: PLAN_FIT_MAX_ZOOM,
      duration: 300,
    });
  }, [planMetadata]);

  const handleEditProjectLocation = useCallback(marker => {
    setProjectMarkerForEdit(marker);
    setEditLocationOpen(true);
  }, []);

  const handleLocationSave = useCallback(() => {
    setEditLocationOpen(false);
    setProjectMarkerForEdit(null);
    setRefreshMarkersKey(k => k + 1);
  }, []);

  if (!currentProjectId) {
    return (
      <div className="plan-page plan-page--empty">
        <p className="plan-page__message">Select a project to view its plan.</p>
      </div>
    );
  }

  if (planLoading) {
    return (
      <div className="plan-page plan-page--loading">
        <p className="plan-page__message">Loading plan…</p>
      </div>
    );
  }

  if (planError) {
    return (
      <div className="plan-page plan-page--error">
        <p className="plan-page__message plan-page__message--error">
          {planError}
        </p>
      </div>
    );
  }

  if (!plan) {
    return (
      <>
        <div className="plan-page plan-page--empty">
          <div className="plan-page__empty-state">
            <p className="plan-page__message">
              No plan has been uploaded yet. Uploading a plan lets you view
              project photos in engineering plan context as well as on the
              geographic map.
            </p>
            {canManagePlan && (
              <button
                type="button"
                className="btn-primary plan-page__upload-btn"
                onClick={handleUploadPlan}
              >
                Upload Plan
              </button>
            )}
          </div>
        </div>
        <UploadPlanModal
          open={uploadModalOpen}
          onClose={handleCloseUploadModal}
          projectId={currentProjectId}
          onCalibrationComplete={handleCalibrationComplete}
          projectCenter={projectCenter}
        />
      </>
    );
  }

  return (
    <div className="plan-page plan-page--with-map" data-plan-page="1">
      {removePlanError && (
        <p
          role="alert"
          className="plan-page__message plan-page__message--error plan-page__message--inline"
        >
          {removePlanError}
        </p>
      )}
      <div
        ref={mapWrapperRef}
        className="plan-page__map-wrapper"
        data-plan-page-map="1"
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
            value={currentProjectId || ''}
            onChange={e => {
              const nextId = e.target.value || null;
              if (nextId) {
                setActiveProject(nextId);
                navigate(`/projects/${nextId}/plan`);
              }
            }}
            style={{
              paddingRight: 28,
              width: `${projectSelectWidth}px`,
              whiteSpace: 'nowrap',
            }}
          >
            {(projects || []).map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div
          ref={mapRef}
          className="plan-page__map map-container"
          aria-label="Plan map"
        />
        <div className="plan-page__map-controls plan-page__map-controls--top-right">
          <button
            type="button"
            className="plan-page__fit-plan-btn maplibregl-ctrl maplibregl-ctrl-group"
            onClick={handleFitPlan}
            title="Fit plan to view"
            aria-label="Fit plan to view"
          >
            Fit Plan
          </button>
          {canManagePlan && (
            <>
              <button
                type="button"
                className="plan-page__manage-btn plan-page__replace-btn maplibregl-ctrl maplibregl-ctrl-group"
                onClick={handleReplacePlan}
                title="Replace plan"
                aria-label="Replace plan"
              >
                Replace Plan
              </button>
              <button
                type="button"
                className="plan-page__manage-btn plan-page__remove-btn maplibregl-ctrl maplibregl-ctrl-group"
                onClick={handleRemovePlan}
                disabled={removePlanLoading}
                title="Remove plan"
                aria-label="Remove plan"
              >
                {removePlanLoading ? 'Removing…' : 'Remove Plan'}
              </button>
            </>
          )}
        </div>
        <PlanMapMarkers
          mapInstanceRef={mapInstance}
          mapContainerRef={mapWrapperRef}
          isMapReady={isMapReady}
          projectId={currentProjectId}
          canManage={canManagePlan}
          selectedProjectName={selectedProjectName}
          navigate={navigate}
          onEditProjectLocation={handleEditProjectLocation}
          refreshMarkersKey={refreshMarkersKey}
        />
      </div>
      <UploadPlanModal
        open={uploadModalOpen}
        onClose={handleCloseUploadModal}
        projectId={currentProjectId}
        onCalibrationComplete={handleCalibrationComplete}
        projectCenter={projectCenter}
        isReplaceMode
      />
      <EditLocationModal
        open={editLocationOpen}
        onClose={() => {
          setEditLocationOpen(false);
          setProjectMarkerForEdit(null);
        }}
        onSave={handleLocationSave}
        projectId={currentProjectId}
        projectMarker={projectMarkerForEdit}
        mapInstance={mapInstance}
      />
    </div>
  );
};

export default PlanPage;
