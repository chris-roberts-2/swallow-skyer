import React from 'react';
import { render, waitFor } from '@testing-library/react';
import App from '../App';

describe('Geocoded location shape', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          photos: [
            {
              id: '1',
              r2_path: 'projects/p/photos/1.jpg',
              r2_url: 'https://cdn/p/1.jpg',
              location_city: 'Paris',
              location_state: 'Ile-de-France',
              location_country: 'France',
            },
          ],
          pagination: { total: 1, page: 1, page_size: 50 },
        }),
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('includes geocoded fields when present', async () => {
    render(<App />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const payload = await global.fetch.mock.results[0].value.json();
    const photo = payload.photos[0];
    expect(photo.location_city).toBe('Paris');
    expect(photo.location_state).toBe('Ile-de-France');
    expect(photo.location_country).toBe('France');
  });
});

