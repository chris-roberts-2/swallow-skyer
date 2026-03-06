/**
 * Shared data utilities for map photo/location pipeline.
 * Used by both Map page (PhotoMapLive) and Plan page for consistent
 * normalisation and clustering.
 */

import { formatLocalDateTime, formatLocalDateTimeParts } from './dateTime';

const R2_PUBLIC_BASE =
  process.env.REACT_APP_R2_PUBLIC_BASE_URL ||
  process.env.REACT_APP_R2_PUBLIC_URL ||
  process.env.R2_PUBLIC_BASE_URL ||
  '';

export function toLngLat(lng, lat) {
  const lngNum = Number(lng);
  const latNum = Number(lat);
  if (!Number.isFinite(lngNum) || !Number.isFinite(latNum)) return null;
  return [lngNum, latNum];
}

export function parseCoordinate(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeLongitude(value) {
  if (!Number.isFinite(value)) return value;
  return value;
}

export function resolvePhotoUrl(photo) {
  const r2Path = photo.r2_path || photo.r2Path || photo.r2_key || photo.r2Key;
  const r2Url = (photo.r2_url || '').trim();
  const primaryUrl = (photo.url || r2Url || '').trim();
  const fallbackUrl =
    R2_PUBLIC_BASE && r2Path
      ? `${R2_PUBLIC_BASE.replace(/\/$/, '')}/${r2Path}`
      : '';
  const resolvedUrl = primaryUrl || fallbackUrl;
  return { primaryUrl, fallbackUrl, resolvedUrl };
}

export function parsePhotoCapturedAtMs(photo) {
  const raw =
    photo?.captured_at ||
    photo?.capturedAt ||
    photo?.taken_at ||
    photo?.takenAt ||
    photo?.uploaded_at ||
    photo?.uploadedAt ||
    photo?.created_at ||
    photo?.createdAt ||
    null;
  if (!raw) return null;
  try {
    const ms = new Date(raw).getTime();
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

const formatTimestamp = iso => formatLocalDateTime(iso);

/**
 * Build normalised photo list for mapping (same shape as PhotoMapLive).
 */
export function buildNormalisedPhotos(photos) {
  return (photos || [])
    .map(photo => {
      if (photo.show_on_photos === false) return null;
      const exifGps = photo?.exif_data?.gps || {};
      const exifLat = parseCoordinate(exifGps.lat);
      const exifLon = parseCoordinate(exifGps.lon);
      const latitude = parseCoordinate(photo.latitude) ?? exifLat;
      const longitudeRaw = parseCoordinate(photo.longitude) ?? exifLon;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitudeRaw))
        return null;
      const mapLongitude = normalizeLongitude(longitudeRaw);
      const { primaryUrl, fallbackUrl, resolvedUrl } = resolvePhotoUrl(photo);
      if (!resolvedUrl) return null;
      const isoTimestamp =
        photo.captured_at ||
        photo.capturedAt ||
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
}

/**
 * Build clusters from locations and normalised photos (backend clustering via location_id).
 */
export function buildClusters(locations, normalisedPhotos) {
  return (locations || [])
    .map(location => {
      const locationPhotos = (normalisedPhotos || []).filter(
        photo => photo.location_id === location.id
      );
      const sortedPhotos = [...locationPhotos].sort((a, b) => {
        const am = parsePhotoCapturedAtMs(a);
        const bm = parsePhotoCapturedAtMs(b);
        if (am === null && bm === null) return 0;
        if (am === null) return 1;
        if (bm === null) return -1;
        return am - bm;
      });
      return {
        latitude: location.latitude,
        longitude: location.longitude,
        photos: sortedPhotos,
        locationNumber: location.number || 0,
      };
    })
    .filter(cluster => cluster.photos.length > 0);
}

export { formatLocalDateTimeParts };
