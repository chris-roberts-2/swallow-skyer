import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import PublicProjectView from '../../pages/PublicProjectView';

const mockFetch = responses => {
  let call = 0;
  jest.spyOn(global, 'fetch').mockImplementation(() => {
    const current = responses[call] || responses[responses.length - 1];
    call += 1;
    return Promise.resolve({
      ok: current.ok,
      status: current.status,
      json: () => Promise.resolve(current.body),
    });
  });
};

describe('PublicProjectView', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('loads project and photos', async () => {
    mockFetch([
      { ok: true, status: 200, body: { project: { id: 'p1', name: 'Demo' } } },
      {
        ok: true,
        status: 200,
        body: {
          photos: [{ id: 'photo-1', r2_url: 'u', thumbnail_r2_url: 't' }],
        },
      },
    ]);

    render(
      <MemoryRouter initialEntries={['/public/token-1']}>
        <Routes>
          <Route path="/public/:token" element={<PublicProjectView />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() =>
      expect(screen.getByTestId('public-view')).toBeInTheDocument()
    );
    expect(screen.getByText('Demo')).toBeInTheDocument();
  });

  test('shows expired message', async () => {
    mockFetch([{ ok: false, status: 410, body: { error: 'expired' } }]);

    render(
      <MemoryRouter initialEntries={['/public/token-expired']}>
        <Routes>
          <Route path="/public/:token" element={<PublicProjectView />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() =>
      expect(screen.getByTestId('public-error')).toBeInTheDocument()
    );
  });

  test('download click opens url', async () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => {});
    mockFetch([
      { ok: true, status: 200, body: { project: { id: 'p1', name: 'Demo' } } },
      {
        ok: true,
        status: 200,
        body: {
          photos: [{ id: 'photo-1', r2_url: 'u', thumbnail_r2_url: 't' }],
        },
      },
      { ok: true, status: 200, body: { url: 'https://signed/file' } },
    ]);

    render(
      <MemoryRouter initialEntries={['/public/token-download']}>
        <Routes>
          <Route path="/public/:token" element={<PublicProjectView />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() =>
      expect(screen.getByTestId('public-view')).toBeInTheDocument()
    );
    fireEvent.click(screen.getByTestId('download-photo-photo-1'));

    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith(
        'https://signed/file',
        '_blank',
        'noopener,noreferrer'
      )
    );
  });
});
