import React from 'react';
import { render, waitFor } from '@testing-library/react';
import App from '../App';

describe('Photo metadata shape', () => {
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
              thumbnail_r2_path: 'projects/p/photos/1_thumb.jpg',
              thumbnail_r2_url: 'https://cdn/p/1_thumb.jpg',
              exif_data: { DateTimeOriginal: '2024:01:01 00:00:00' },
              captured_at: '2024-01-01T00:00:00Z',
              location_id: 'loc-1',
            },
          ],
          pagination: { total: 1, page: 1, page_size: 50 },
        }),
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('includes exif_data, captured_at, location_id in responses', async () => {
    render(<App />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const payload = await global.fetch.mock.results[0].value.json();
    const photo = payload.photos[0];
    expect(photo.exif_data).toBeTruthy();
    expect(photo.captured_at).toBeTruthy();
    expect(photo.location_id).toBe('loc-1');
  });
});
