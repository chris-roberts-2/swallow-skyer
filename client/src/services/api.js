import { getApiOrigin } from '../utils/apiEnv';

const normalizeBaseUrl = baseOrigin => {
  const trimmed = (baseOrigin || '').trim().replace(/\/+$/, '');
  return `${trimmed}/api`;
};

class ApiClient {
  constructor() {
    this.baseURL = normalizeBaseUrl(getApiOrigin());
    this.getAccessToken = () => localStorage.getItem('access_token');
    this.getRefreshToken = () => localStorage.getItem('refresh_token');
    this.refreshPromise = null;
  }

  setAuthHandlers({ refreshTokens, logout }) {
    this.refreshTokens = refreshTokens;
    this.logout = logout;
  }

  async request(endpoint, options = {}, attempt = 0) {
    const url = `${this.baseURL}${endpoint}`;
    const isFormData = options && options.body instanceof FormData;
    const headers = isFormData
      ? { ...(options.headers || {}) }
      : {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        };

    const accessToken = this.getAccessToken();
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const config = {
      ...options,
      headers,
    };

    try {
      const response = await fetch(url, config);
      if (response.status === 401 && attempt === 0 && this.refreshTokens) {
        await this._refreshTokens();
        return this.request(endpoint, options, attempt + 1);
      }

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const error = new Error(
          errorBody?.error || `HTTP error ${response.status}`
        );
        error.status = response.status;
        error.payload = errorBody;
        throw error;
      }

      if (response.status === 204) {
        return null;
      }

      return await response.json();
    } catch (error) {
      if (error.status === 401 && this.logout) {
        this.logout();
      }
      console.error('API request failed:', error);
      throw error;
    }
  }

  async _refreshTokens() {
    if (!this.refreshTokens) {
      throw new Error('No refresh handler registered');
    }
    if (!this.refreshPromise) {
      this.refreshPromise = this.refreshTokens();
    }
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  // Generic CRUD methods
  async get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  }

  async post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async put(endpoint, data) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  async patch(endpoint, data) {
    return this.request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }
}

const apiClient = new ApiClient();

export default apiClient;
