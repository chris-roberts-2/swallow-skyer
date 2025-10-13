// API Configuration
export const API_CONFIG = {
  BASE_URL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  TIMEOUT: 10000,
};

// Map Configuration
export const MAP_CONFIG = {
  DEFAULT_CENTER: [0, 0],
  DEFAULT_ZOOM: 2,
  MIN_ZOOM: 1,
  MAX_ZOOM: 18,
  CLUSTER_RADIUS: 50,
};

// Photo Configuration
export const PHOTO_CONFIG = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  THUMBNAIL_SIZE: 300,
  PREVIEW_SIZE: 800,
};

// UI Configuration
export const UI_CONFIG = {
  ANIMATION_DURATION: 300,
  DEBOUNCE_DELAY: 500,
  TOAST_DURATION: 3000,
};

// Storage Keys
export const STORAGE_KEYS = {
  USER_PREFERENCES: 'swallow_skyer_preferences',
  MAP_STATE: 'swallow_skyer_map_state',
  RECENT_PHOTOS: 'swallow_skyer_recent_photos',
};

// Error Messages
export const ERROR_MESSAGES = {
  UPLOAD_FAILED: 'Failed to upload photo. Please try again.',
  INVALID_FILE: 'Invalid file type. Please upload an image.',
  FILE_TOO_LARGE: 'File is too large. Maximum size is 10MB.',
  NETWORK_ERROR: 'Network error. Please check your connection.',
  GENERIC_ERROR: 'Something went wrong. Please try again.',
};
