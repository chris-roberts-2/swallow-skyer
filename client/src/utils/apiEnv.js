const DEV_DEFAULT_API_ORIGIN = 'http://localhost:5001';

export function getApiOrigin() {
  const raw = (process.env.REACT_APP_API_BASE_URL || '').trim();
  if (raw) return raw.replace(/\/+$/, '');

  // In production builds, require explicit configuration so we never silently
  // ship a bundle that points at localhost.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Missing REACT_APP_API_BASE_URL. Set it at build time (e.g. REACT_APP_API_BASE_URL=https://swallow-skyer-v1.onrender.com).'
    );
  }

  return DEV_DEFAULT_API_ORIGIN;
}

export function getApiCandidates() {
  const origin = getApiOrigin();

  // In production, never attempt localhost fallbacks.
  if (process.env.NODE_ENV === 'production') return [origin];

  return Array.from(
    new Set([origin, 'http://127.0.0.1:5001', 'http://localhost:5001'])
  ).filter(Boolean);
}


