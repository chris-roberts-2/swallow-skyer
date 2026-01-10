import apiClient from './api';

class PublicService {
  async getProject(token) {
    return apiClient.get(`/v1/public/${token}/project`);
  }

  async getPhotos(token) {
    return apiClient.get(`/v1/public/${token}/photos`);
  }

  async getDownloadURL(token, photoId) {
    return apiClient.get(`/v1/public/${token}/photos/${photoId}/download`);
  }
}

export default new PublicService();
