/**
 * Photos API service for fetching photo data from backend.
 */

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

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
  
  if (params.limit !== undefined) queryParams.append('limit', params.limit);
  if (params.offset !== undefined) queryParams.append('offset', params.offset);
  if (params.since) queryParams.append('since', params.since);
  if (params.bbox) queryParams.append('bbox', params.bbox);
  if (params.user_id) queryParams.append('user_id', params.user_id);
  
  const url = `${API_BASE_URL}/api/photos?${queryParams.toString()}`;
  
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
export const fetchPhotosInBounds = async (latMin, lngMin, latMax, lngMax, limit = 100) => {
  const bbox = `${latMin},${lngMin},${latMax},${lngMax}`;
  return fetchPhotos({ bbox, limit });
};

/**
 * Fetch recent photos since a given timestamp.
 * 
 * @param {string} sinceTimestamp - ISO 8601 timestamp
 * @param {number} limit - Maximum number of photos
 * @returns {Promise<Object>} Response with photos array
 */
export const fetchRecentPhotos = async (sinceTimestamp, limit = 50) => {
  return fetchPhotos({ since: sinceTimestamp, limit });
};

