import maplibregl from 'maplibre-gl';

// GitHub Pages requires workers to be served from the same origin
// Use the default blob worker which is bundled with maplibre-gl
export function configureMaplibreWorker() {
  // No configuration needed - let MapLibre use its default blob worker
  // This avoids CORS issues with external CDN workers on GitHub Pages
}
