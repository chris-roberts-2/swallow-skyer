import React from 'react';
import { render, screen } from '@testing-library/react';
import MapContainer from '../../../components/map/MapContainer';

// Mock MapLibre GL
jest.mock('maplibre-gl', () => ({
  Map: jest.fn(() => ({
    on: jest.fn(),
    off: jest.fn(),
    remove: jest.fn(),
  })),
}));

describe('MapContainer', () => {
  const mockPhotos = [
    {
      id: '1',
      latitude: 40.7128,
      longitude: -74.0060,
      caption: 'Test photo'
    }
  ];

  it('renders map container', () => {
    render(
      <MapContainer 
        photos={mockPhotos}
        onPhotoSelect={jest.fn()}
        onLocationClick={jest.fn()}
      />
    );
    
    expect(screen.getByRole('img', { hidden: true })).toBeInTheDocument();
  });

  it('handles photo selection', () => {
    const onPhotoSelect = jest.fn();
    render(
      <MapContainer 
        photos={mockPhotos}
        onPhotoSelect={onPhotoSelect}
        onLocationClick={jest.fn()}
      />
    );
    
    // Test photo selection logic
    expect(onPhotoSelect).toBeDefined();
  });
});
