import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../App';
import { AuthContext } from '../context/AuthContext';
import { resetSupabaseMocks } from '../__mocks__/supabase';

describe('Geocoded location shape', () => {
  beforeEach(() => {
    resetSupabaseMocks();
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
    resetSupabaseMocks();
    jest.clearAllMocks();
  });

  it('includes geocoded fields when present', async () => {
    render(
      <AuthContext.Provider
        value={{
          user: { email: 'pilot@example.com' },
          isLoading: false,
          projects: [{ id: 'project-1', name: 'Project 1' }],
          activeProject: { id: 'project-1' },
          setActiveProject: jest.fn(),
        }}
      >
        <MemoryRouter initialEntries={['/map']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthContext.Provider>
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const response = await global.fetch.mock.results[0].value;
    const payload = await response.json();
    const photo = payload.photos[0];
    expect(photo.location_city).toBe('Paris');
    expect(photo.location_state).toBe('Ile-de-France');
    expect(photo.location_country).toBe('France');
  });
});
