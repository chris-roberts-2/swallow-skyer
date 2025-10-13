// Application Configuration Constants
export const APP_CONFIG = {
  NAME: 'Swallow Skyer',
  VERSION: '1.0.0',
  DESCRIPTION: 'A platform for storing and managing photos on a map',
  
  // Map Configuration
  MAP: {
    DEFAULT_CENTER: [0, 0],
    DEFAULT_ZOOM: 2,
    MIN_ZOOM: 1,
    MAX_ZOOM: 18,
    CLUSTER_RADIUS: 50,
    TILE_SERVER: 'https://demotiles.maplibre.org/style.json'
  },
  
  // Photo Configuration
  PHOTO: {
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    THUMBNAIL_SIZE: 300,
    PREVIEW_SIZE: 800,
    QUALITY: 0.8
  },
  
  // UI Configuration
  UI: {
    ANIMATION_DURATION: 300,
    DEBOUNCE_DELAY: 500,
    TOAST_DURATION: 3000,
    PAGINATION_SIZE: 20
  }
};

export const ENVIRONMENT = {
  DEVELOPMENT: 'development',
  PRODUCTION: 'production',
  TESTING: 'testing'
};
