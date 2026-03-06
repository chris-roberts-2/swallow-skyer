/**
 * Renders project photo markers and popups on the Plan page using the same
 * data pipeline and marker rendering as the Map page (PhotoMapLive).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProjectMapData } from '../../hooks/useProjectMapData';
import { formatLocalDateTimeParts } from '../../utils/mapDataUtils';
import {
  addMarkersToMap,
  clearMarkers,
  renderStackPopup,
} from '../../utils/mapMarkerRendering';

function PlanMapMarkers({
  mapInstanceRef,
  mapContainerRef,
  isMapReady,
  projectId,
  canManage,
  selectedProjectName,
  navigate,
  onEditProjectLocation,
  refreshMarkersKey = 0,
}) {
  const [activeStack, setActiveStack] = useState(null);
  const markersRef = useRef([]);
  const photoPopupRef = useRef(null);
  const projectLocationPopupRef = useRef(null);

  const { projectMarker, clusters } = useProjectMapData(
    projectId,
    refreshMarkersKey
  );

  const markerRefs = useMemo(
    () => ({
      markersRef,
      photoPopupRef,
      projectLocationPopupRef,
    }),
    []
  );

  const closeStack = useCallback(() => setActiveStack(null), []);

  const closePhotoPopup = useCallback(() => {
    if (photoPopupRef.current) {
      try {
        photoPopupRef.current.remove();
      } catch {
        // ignore
      }
      photoPopupRef.current = null;
    }
  }, []);

  useEffect(() => {
    const container = mapContainerRef?.current;
    if (!container) return;
    const handleDocumentClick = evt => {
      const target = evt?.target;
      if (!target || typeof target.closest !== 'function') return;
      if (
        target.closest('.maplibregl-marker') ||
        target.closest('.maplibregl-popup') ||
        target.closest('.maplibregl-ctrl')
      ) {
        return;
      }
      if (!target.closest('[data-plan-page-map="1"]')) return;
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
    document.addEventListener('click', handleDocumentClick, true);
    return () =>
      document.removeEventListener('click', handleDocumentClick, true);
  }, [mapContainerRef, closeStack, closePhotoPopup]);

  const openPhotoOptions = useCallback(
    photo => {
      if (photo?.id && navigate) {
        navigate(`/photos/${photo.id}/options`, { state: { from: 'plan' } });
      }
    },
    [navigate]
  );

  const downloadPhotos = useCallback(async items => {
    if (!items?.length) return;
    items.forEach(item => {
      const url =
        item.primaryUrl || item.url || item.fallbackUrl || item.thumbnailUrl;
      if (url && typeof window !== 'undefined') {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    });
  }, []);

  useEffect(() => {
    if (!activeStack) return;
    const stackIds = new Set(activeStack.photos.map(p => p.id));
    const stillPresent = clusters.some(c =>
      c.photos.some(p => stackIds.has(p.id))
    );
    if (!stillPresent) setActiveStack(null);
  }, [activeStack, clusters]);

  useEffect(() => {
    if (!mapInstanceRef?.current || !isMapReady) return;
    const map = mapInstanceRef.current;

    addMarkersToMap(map, markerRefs, {
      clusters,
      projectMarker,
      canManage,
      selectedProjectName,
      openPhotoOptions,
      closePhotoPopup,
      closeStack,
      setActiveStack,
      onEditProjectLocation,
      mapZoom: map.getZoom?.() ?? 10,
      formatDateTimeParts: formatLocalDateTimeParts,
      isDragMode: false,
    });

    return () => clearMarkers(markerRefs);
  }, [
    mapInstanceRef,
    isMapReady,
    clusters,
    projectMarker,
    canManage,
    selectedProjectName,
    markerRefs,
    closePhotoPopup,
    closeStack,
    openPhotoOptions,
    onEditProjectLocation,
  ]);

  useEffect(() => {
    if (!activeStack || !mapInstanceRef?.current) return undefined;
    return renderStackPopup(mapInstanceRef.current, activeStack, {
      closeStack,
      formatDateTimeParts: formatLocalDateTimeParts,
      openPhotoOptions,
      downloadPhotos,
    });
  }, [
    activeStack,
    mapInstanceRef,
    closeStack,
    openPhotoOptions,
    downloadPhotos,
  ]);

  return null;
}

export default PlanMapMarkers;
