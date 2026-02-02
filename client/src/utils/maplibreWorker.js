import maplibregl from 'maplibre-gl';

// GitHub Pages + CRA sometimes has issues with the default blob worker bundle.
// Point MapLibre at the CSP worker hosted on a CDN to avoid blob worker runtime errors.
export function configureMaplibreWorker() {
  if (typeof maplibregl === 'undefined') return;

  // Use setWorkerUrl method for better compatibility
  // Pin to the installed major/minor to avoid unexpected breaking changes.
  if (typeof maplibregl.setWorkerUrl === 'function') {
    maplibregl.setWorkerUrl(
      'https://unpkg.com/maplibre-gl@5.9.0/dist/maplibre-gl-csp-worker.js'
    );
  } else {
    // Fallback for older versions
    maplibregl.workerUrl =
      'https://unpkg.com/maplibre-gl@5.9.0/dist/maplibre-gl-csp-worker.js';
  }
}
