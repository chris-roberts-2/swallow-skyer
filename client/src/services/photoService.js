import apiClient from './api';

class PhotoService {
  // Get all photos
  async getPhotos() {
    return apiClient.get('/photos');
  }

  // Get photos by location
  async getPhotosByLocation(latitude, longitude) {
    return apiClient.get(`/photos/location?lat=${latitude}&lng=${longitude}`);
  }

  // Upload a new photo
  async uploadPhoto(photoData) {
    const formData = new FormData();
    formData.append('file', photoData.file);
    formData.append('caption', photoData.caption);
    formData.append('latitude', photoData.latitude);
    formData.append('longitude', photoData.longitude);

    return apiClient.request('/photos/upload', {
      method: 'POST',
      body: formData,
      headers: {}, // Let browser set Content-Type for FormData
    });
  }

  // Get photo by ID
  async getPhoto(id) {
    return apiClient.get(`/photos/${id}`);
  }

  // Update photo
  async updatePhoto(id, updates) {
    return apiClient.put(`/photos/${id}`, updates);
  }

  // Delete photo
  async deletePhoto(id) {
    return apiClient.delete(`/photos/${id}`);
  }

  // Get photo statistics
  async getPhotoStats() {
    return apiClient.get('/photos/stats');
  }
}

export default new PhotoService();
