/**
 * Georeferencing utility: convert two calibration pairs (pixel + geo)
 * into the four geographic corner coordinates for a plan image.
 * Uses a local planar approximation (equirectangular) to compute
 * scale, rotation, and translation, then maps pixel corners to lat/lng.
 */

const M_PER_DEG_LAT = 111320;
const DEG_TO_RAD = Math.PI / 180;

function metersPerDegLng(latDeg) {
  return M_PER_DEG_LAT * Math.cos(latDeg * DEG_TO_RAD);
}

/**
 * Convert (lng, lat) relative to origin (lng0, lat0) into local planar meters.
 * x = east, y = north.
 */
function geoToPlanar(lng, lat, lng0, lat0) {
  const x = (lng - lng0) * metersPerDegLng(lat0);
  const y = (lat - lat0) * M_PER_DEG_LAT;
  return [x, y];
}

/**
 * Convert local planar meters (x, y) relative to origin (lng0, lat0) back to lng/lat.
 */
function planarToGeo(x, y, lng0, lat0) {
  const lng = lng0 + x / metersPerDegLng(lat0);
  const lat = lat0 + y / M_PER_DEG_LAT;
  return [lng, lat];
}

/**
 * Compute scale (meters per pixel) and rotation (radians, from pixel space to planar)
 * from two calibration pairs. Pixel origin is first calibration point; planar origin
 * is first geo point.
 */
function computeScaleAndRotation(pair1, pair2) {
  const [px1, py1] = pair1.pixel;
  const [px2, py2] = pair2.pixel;
  const dxPx = px2 - px1;
  const dyPx = py2 - py1;
  const distPx = Math.hypot(dxPx, dyPx);
  if (distPx < 1e-6) return null;

  const [lng1, lat1] = pair1.geo;
  const [lng2, lat2] = pair2.geo;
  const [x2, y2] = geoToPlanar(lng2, lat2, lng1, lat1);
  const distM = Math.hypot(x2, y2);
  if (distM < 1e-6) return null;

  const scale = distM / distPx;
  const anglePlanar = Math.atan2(y2, x2);
  const anglePixel = Math.atan2(dyPx, dxPx);
  const rotation = anglePlanar - anglePixel;

  return {
    scale,
    rotation,
    originPixel: [px1, py1],
    originGeo: [lng1, lat1],
  };
}

/**
 * Transform a pixel point to geographic [lng, lat] using the computed transform.
 */
function pixelToGeo(px, py, transform) {
  const { scale, rotation, originPixel, originGeo } = transform;
  const [px0, py0] = originPixel;
  const [lng0, lat0] = originGeo;
  const dx = px - px0;
  const dy = py - py0;
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  const xM = scale * (cosR * dx - sinR * dy);
  const yM = scale * (sinR * dx + cosR * dy);
  return planarToGeo(xM, yM, lng0, lat0);
}

/**
 * Validate that four corners form a reasonable non-inverted quadrilateral.
 * Returns an error message string or null if valid.
 */
function validateCorners(corners) {
  const { nw, ne, se, sw } = corners;
  const lats = [nw[1], ne[1], se[1], sw[1]];
  const lngs = [nw[0], ne[0], se[0], sw[0]];
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  if (minLat < -90 || maxLat > 90 || minLng < -180 || maxLng > 360) {
    return 'Computed coordinates are outside valid geographic range.';
  }
  if (maxLat - minLat < 1e-7 || maxLng - minLng < 1e-7) {
    return 'Computed corners are too close together; try calibration points farther apart.';
  }
  const area =
    (nw[0] * (ne[1] - sw[1]) +
      ne[0] * (se[1] - nw[1]) +
      se[0] * (sw[1] - ne[1]) +
      sw[0] * (nw[1] - se[1])) /
    2;
  if (Math.abs(area) < 1e-10) {
    return 'Computed corners form a degenerate or self-intersecting shape.';
  }
  return null;
}

/**
 * Compute the four geographic corner coordinates from calibration data.
 *
 * @param {Object} params
 * @param {number} params.imageWidth - Raster width in pixels
 * @param {number} params.imageHeight - Raster height in pixels
 * @param {Array<{ pixel: [number, number], geo: [number, number] }>} params.calibrationPairs - Two pairs; geo is [lng, lat]
 * @returns {{ success: true, corners, bbox, cornersForMapLibre } | { success: false, error: string }}
 */
export function computePlanCorners({
  imageWidth,
  imageHeight,
  calibrationPairs,
}) {
  if (
    !Number.isFinite(imageWidth) ||
    !Number.isFinite(imageHeight) ||
    imageWidth < 1 ||
    imageHeight < 1
  ) {
    return { success: false, error: 'Invalid image dimensions.' };
  }
  if (
    !Array.isArray(calibrationPairs) ||
    calibrationPairs.length < 2 ||
    !calibrationPairs[0]?.pixel?.length ||
    !calibrationPairs[0]?.geo?.length ||
    !calibrationPairs[1]?.pixel?.length ||
    !calibrationPairs[1]?.geo?.length
  ) {
    return {
      success: false,
      error: 'Two calibration pairs (pixel and geo) are required.',
    };
  }

  const [pair1, pair2] = calibrationPairs;
  const transform = computeScaleAndRotation(pair1, pair2);
  if (!transform) {
    return {
      success: false,
      error:
        'Calibration points are too close together; choose two distinct points farther apart.',
    };
  }

  const nw = pixelToGeo(0, 0, transform);
  const ne = pixelToGeo(imageWidth, 0, transform);
  const se = pixelToGeo(imageWidth, imageHeight, transform);
  const sw = pixelToGeo(0, imageHeight, transform);

  const corners = { nw, ne, se, sw };
  const validationError = validateCorners(corners);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const lats = [nw[1], ne[1], se[1], sw[1]];
  const lngs = [nw[0], ne[0], se[0], sw[0]];
  const bbox = {
    min_lat: Math.min(...lats),
    max_lat: Math.max(...lats),
    min_lng: Math.min(...lngs),
    max_lng: Math.max(...lngs),
  };

  return {
    success: true,
    corners: {
      corner_nw_lat: nw[1],
      corner_nw_lng: nw[0],
      corner_ne_lat: ne[1],
      corner_ne_lng: ne[0],
      corner_se_lat: se[1],
      corner_se_lng: se[0],
      corner_sw_lat: sw[1],
      corner_sw_lng: sw[0],
    },
    bbox,
    cornersForMapLibre: {
      corner_nw: nw,
      corner_ne: ne,
      corner_se: se,
      corner_sw: sw,
    },
  };
}
