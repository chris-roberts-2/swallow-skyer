import maplibregl from 'maplibre-gl';

// GitHub Pages requires workers to be served from the same origin
// Use the worker file we've placed in the public folder
export function configureMaplibreWorker() {
  if (typeof maplibregl === 'undefined') return;

  // For GitHub Pages deployment with subpath (/swallow-skyer)
  const basename = process.env.PUBLIC_URL || '';
  const workerPath = `${basename}/maplibre-gl-csp-worker.js`;

  // Set worker URL to load from same origin
  if (typeof maplibregl.setWorkerUrl === 'function') {
    maplibregl.setWorkerUrl(workerPath);
  } else {
    maplibregl.workerUrl = workerPath;
  }
}
