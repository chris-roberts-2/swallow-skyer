/**
 * Shared hook for project photo/location data used by Map and Plan pages.
 * Uses the same request patterns as PhotoMapLive (getApiCandidates + fetch).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { getApiCandidates } from '../utils/apiEnv';
import { buildClusters, buildNormalisedPhotos } from '../utils/mapDataUtils';

function getAccessToken() {
  try {
    return localStorage.getItem('access_token') || '';
  } catch {
    return '';
  }
}

/**
 * Fetches photos for a project (same endpoints and pattern as PhotoMapLive).
 */
async function fetchPhotos(projectId, candidates) {
  const accessToken = getAccessToken();
  for (const base of candidates) {
    try {
      const url = new URL(`${base}/api/v1/photos/`);
      url.searchParams.set('project_id', projectId);
      const res = await fetch(url.toString(), {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      const data = await res.json();
      if (!res.ok) continue;
      return Array.isArray(data.photos) ? data.photos : [];
    } catch {
      continue;
    }
  }
  return [];
}

/**
 * Fetches locations for a project (same endpoints and pattern as PhotoMapLive).
 */
async function fetchLocations(projectId, candidates) {
  const accessToken = getAccessToken();
  for (const base of candidates) {
    try {
      const url = new URL(`${base}/api/v1/locations/`);
      url.searchParams.set('project_id', projectId);
      url.searchParams.set('show_on_photos', 'true');
      const res = await fetch(url.toString(), {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      const data = await res.json();
      if (!res.ok) continue;
      return Array.isArray(data.locations) ? data.locations : [];
    } catch {
      continue;
    }
  }
  return [];
}

/**
 * Fetches project location (same endpoint and pattern as PhotoMapLive).
 */
async function fetchProjectLocation(projectId, candidates) {
  const accessToken = getAccessToken();
  for (const base of candidates) {
    try {
      const url = new URL(`${base}/api/v1/projects/${projectId}/location`);
      const res = await fetch(url.toString(), {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      const data = await res.json();
      if (!res.ok) continue;
      return data.location || null;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Returns project photos, locations, project marker, normalised photos, and clusters.
 * refreshCounter: increment to force refetch (e.g. after location save).
 * projectMarkerOverride: optional; when set (e.g. after user saves in EditLocationModal),
 *   returned projectMarker uses this instead of fetched value until refetch.
 */
export function useProjectMapData(
  projectId,
  refreshCounter = 0,
  { projectMarkerOverride = null } = {}
) {
  const [photos, setPhotos] = useState([]);
  const [locations, setLocations] = useState([]);
  const [projectMarkerFetched, setProjectMarkerFetched] = useState(null);
  const photosCacheRef = useRef({ data: null, projectId: null });
  const locationsCacheRef = useRef({ data: null, projectId: null });
  const projectMarkerCacheRef = useRef({ data: null, projectId: null });

  const candidates = useMemo(() => getApiCandidates(), []);

  useEffect(() => {
    if (!projectId) {
      setPhotos([]);
      setLocations([]);
      setProjectMarkerFetched(null);
      return;
    }
    let cancelled = false;

    const run = async () => {
      const [photosList, locationsList, location] = await Promise.all([
        fetchPhotos(projectId, candidates),
        fetchLocations(projectId, candidates),
        fetchProjectLocation(projectId, candidates),
      ]);
      if (cancelled) return;
      setPhotos(photosList);
      setLocations(locationsList);
      setProjectMarkerFetched(location);
      photosCacheRef.current = { data: photosList, projectId };
      locationsCacheRef.current = { data: locationsList, projectId };
      projectMarkerCacheRef.current = { data: location, projectId };
    };

    const photosCached =
      photosCacheRef.current.projectId === projectId &&
      photosCacheRef.current.data !== null;
    const locationsCached =
      locationsCacheRef.current.projectId === projectId &&
      locationsCacheRef.current.data !== null;
    const markerCached = projectMarkerCacheRef.current.projectId === projectId;

    if (
      photosCached &&
      locationsCached &&
      markerCached &&
      refreshCounter === 0
    ) {
      setPhotos(photosCacheRef.current.data);
      setLocations(locationsCacheRef.current.data);
      setProjectMarkerFetched(projectMarkerCacheRef.current.data);
      return;
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [projectId, refreshCounter, candidates]);

  const normalisedPhotos = useMemo(
    () => buildNormalisedPhotos(photos),
    [photos]
  );

  const clusters = useMemo(
    () => buildClusters(locations, normalisedPhotos),
    [locations, normalisedPhotos]
  );

  const projectMarker =
    projectMarkerOverride !== undefined && projectMarkerOverride !== null
      ? projectMarkerOverride
      : projectMarkerFetched;

  return {
    photos,
    locations,
    projectMarker,
    projectMarkerFetched,
    normalisedPhotos,
    clusters,
  };
}
