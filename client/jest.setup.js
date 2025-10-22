// Setup Jest DOM matchers
import '@testing-library/jest-dom';

// Mock MapLibre to avoid WebGL/canvas in JSDOM
jest.mock('maplibre-gl', () => {
  class MockMap {
    constructor() {}
    addControl() {}
    remove() {}
    fitBounds() {}
    getBounds() {
      return {
        getSouth: () => -1,
        getWest: () => -1,
        getNorth: () => 1,
        getEast: () => 1,
      };
    }
  }

  class MockMarker {
    constructor() {}
    setLngLat() { return this; }
    setPopup() { return this; }
    addTo() { return this; }
    remove() {}
  }

  class MockPopup {
    constructor() {}
    setHTML() { return this; }
  }

  return {
    Map: MockMap,
    Marker: MockMarker,
    Popup: MockPopup,
    NavigationControl: class {},
    LngLatBounds: class {
      extend() { return this; }
      isEmpty() { return true; }
    },
  };
});


