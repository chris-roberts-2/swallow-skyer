/**
 * Photos API service for fetching photo data from backend.
 */

import { getApiOrigin } from '../utils/apiEnv';

const API_ORIGIN = getApiOrigin();

/**
 * Fetch photos from the backend API.
 *
 * @param {Object} params - Query parameters
 * @param {number} params.limit - Maximum number of photos to return (default: 50, max: 200)
 * @param {number} params.offset - Number of photos to skip for pagination (default: 0)
 * @param {string} params.since - ISO timestamp to filter photos taken after this date
 * @param {string} params.bbox - Bounding box as "lat_min,lng_min,lat_max,lng_max"
 * @param {string} params.user_id - Filter by user ID
 * @returns {Promise<Object>} Response with photos array and pagination info
 */
export const fetchPhotos = async (params = {}) => {
  const queryParams = new URLSearchParams();

  // NOTE: Production API is project-scoped under /api/v1/photos.
  if (!params.project_id) {
    throw new Error('fetchPhotos requires params.project_id');
  }
  queryParams.append('project_id', params.project_id);

  // Optional filters (v1 supports a different shape than legacy /api/photos)
  if (params.page !== undefined) queryParams.append('page', params.page);
  if (params.page_size !== undefined) queryParams.append('page_size', params.page_size);
  if (params.user_id) queryParams.append('user_id', params.user_id);

  const url = `${API_ORIGIN}/api/v1/photos/?${queryParams.toString()}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching photos:', error);
    throw error;
  }
};

/**
 * Fetch photos within a bounding box (useful for map viewport).
 *
 * @param {number} latMin - Minimum latitude
 * @param {number} lngMin - Minimum longitude
 * @param {number} latMax - Maximum latitude
 * @param {number} lngMax - Maximum longitude
 * @param {number} limit - Maximum number of photos
 * @returns {Promise<Object>} Response with photos array
 */
export const fetchPhotosInBounds = async (
  projectId,
  latMin,
  lngMin,
  latMax,
  lngMax,
  limit = 100
) => {
  const bbox = `${latMin},${lngMin},${latMax},${lngMax}`;
  return fetchPhotos({ project_id: projectId, bbox, page_size: limit });
};

/**
 * Fetch recent photos since a given timestamp.
 *
 * @param {string} sinceTimestamp - ISO 8601 timestamp
 * @param {number} limit - Maximum number of photos
 * @returns {Promise<Object>} Response with photos array
 */
export const fetchRecentPhotos = async (projectId, sinceTimestamp, limit = 50) => {
  // v1 API currently supports paging + date_range; keep helper minimal for now.
  return fetchPhotos({ project_id: projectId, page_size: limit, since: sinceTimestamp });
};
