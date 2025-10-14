import { PHOTO_CONFIG } from './constants';

// File validation helpers
export const validateFile = file => {
  if (!file) {
    return { isValid: false, error: 'No file selected' };
  }

  if (!PHOTO_CONFIG.ALLOWED_TYPES.includes(file.type)) {
    return { isValid: false, error: 'Invalid file type' };
  }

  if (file.size > PHOTO_CONFIG.MAX_FILE_SIZE) {
    return { isValid: false, error: 'File too large' };
  }

  return { isValid: true };
};

// Location helpers
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const formatCoordinates = (lat, lng, precision = 4) => {
  return {
    latitude: parseFloat(lat.toFixed(precision)),
    longitude: parseFloat(lng.toFixed(precision)),
  };
};

// Photo helpers
export const generateThumbnail = (file, size = PHOTO_CONFIG.THUMBNAIL_SIZE) => {
  return new Promise(resolve => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      const { width, height } = img;
      const aspectRatio = width / height;

      let newWidth = size;
      let newHeight = size;

      if (aspectRatio > 1) {
        newHeight = size / aspectRatio;
      } else {
        newWidth = size * aspectRatio;
      }

      canvas.width = newWidth;
      canvas.height = newHeight;

      ctx.drawImage(img, 0, 0, newWidth, newHeight);
      canvas.toBlob(resolve, 'image/jpeg', 0.8);
    };

    img.src = URL.createObjectURL(file);
  });
};

// Date helpers
export const formatDate = date => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Debounce helper
export const debounce = (func, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(null, args), delay);
  };
};

// Local storage helpers
export const saveToStorage = (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save to localStorage:', error);
  }
};

export const loadFromStorage = (key, defaultValue = null) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.error('Failed to load from localStorage:', error);
    return defaultValue;
  }
};
