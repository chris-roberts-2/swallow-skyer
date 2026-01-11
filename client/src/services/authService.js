import { getApiOrigin } from '../utils/apiEnv';

const API_ORIGIN = getApiOrigin();

const jsonHeaders = {
  'Content-Type': 'application/json',
};

const handleResponse = async response => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error || response.statusText);
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
};

const authService = {
  async signup({ email, password, name }) {
    const res = await fetch(`${API_ORIGIN}/api/auth/signup`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ email, password, name }),
    });
    return handleResponse(res);
  },

  async login({ email, password }) {
    const res = await fetch(`${API_ORIGIN}/api/auth/login`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ email, password }),
    });
    return handleResponse(res);
  },

  async refresh(refreshToken) {
    const res = await fetch(`${API_ORIGIN}/api/auth/refresh`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    return handleResponse(res);
  },

  async me(accessToken) {
    const res = await fetch(`${API_ORIGIN}/api/auth/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    return handleResponse(res);
  },
};

export default authService;
