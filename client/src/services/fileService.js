import apiClient from './api';

class FileService {
  async getPresignedDownloadURL(projectId, photoId) {
    return apiClient.get(
      `/v1/projects/${projectId}/photos/${photoId}/download`
    );
  }
}

export default new FileService();

