import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, waitFor } from '@testing-library/react';
import App, { AppRoutes } from '../../App';
import { AuthProvider } from '../../context';

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

describe('Public embed mode', () => {
  beforeEach(() => {
    jest
      .spyOn(require('../../lib/supabaseClient').default.auth, 'getSession')
      .mockResolvedValue({ data: { session: null }, error: null });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('hides header when embed=1', async () => {
    mockFetch([
      { ok: true, status: 200, body: { project: { id: 'p1', name: 'Demo' } } },
      { ok: true, status: 200, body: { photos: [] } },
    ]);

    const { queryByText } = render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/public/token123?embed=1']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    );

    await waitFor(() => expect(queryByText('Swallow Skyer')).not.toBeInTheDocument());
  });
});

