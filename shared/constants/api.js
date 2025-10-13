// API Configuration Constants
export const API_ENDPOINTS = {
  PHOTOS: {
    BASE: '/api/photos',
    UPLOAD: '/api/photos/upload',
    BY_LOCATION: '/api/photos/location',
    STATS: '/api/photos/stats'
  },
  LOCATIONS: {
    BASE: '/api/locations',
    NEARBY: '/api/locations/nearby'
  },
  AUTH: {
    LOGIN: '/api/auth/login',
    REGISTER: '/api/auth/register',
    LOGOUT: '/api/auth/logout'
  },
  USERS: {
    BASE: '/api/users'
  }
};

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500
};

export const API_CONFIG = {
  TIMEOUT: 10000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000
};
