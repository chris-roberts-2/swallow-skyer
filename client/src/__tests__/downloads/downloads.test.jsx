import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthContext } from '../../context/AuthContext';
import PhotoDetailView from '../../components/photo/PhotoDetailView';

const baseContext = {
  user: { id: 'user-1' },
  session: {},
  isLoading: false,
  activeProject: 'project-1',
  setActiveProject: jest.fn(),
  setProjectRole: jest.fn(),
  login: jest.fn(),
  signup: jest.fn(),
  logout: jest.fn(),
};

const renderWithRole = role =>
  render(
    <AuthContext.Provider
      value={{
        ...baseContext,
        projectRoles: { 'project-1': role },
        roleForActiveProject: () => role,
      }}
    >
      <PhotoDetailView
        photo={{
          id: 'photo-1',
          project_id: 'project-1',
          caption: 'Test Photo',
          file_name: 'photo-1.jpg',
        }}
      />
    </AuthContext.Provider>
  );

describe('download actions', () => {
  beforeEach(() => {
    jest.spyOn(window, 'open').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('successful download opens new tab', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ url: 'https://signed.test/file' }),
    });

    renderWithRole('viewer');

    fireEvent.click(screen.getByTestId('download-photo'));

    await waitFor(() =>
      expect(window.open).toHaveBeenCalledWith(
        'https://signed.test/file',
        '_blank',
        'noopener,noreferrer'
      )
    );
  });

  test('403 shows permission toast', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ message: 'forbidden' }),
    });

    renderWithRole('viewer');

    fireEvent.click(screen.getByTestId('download-photo'));

    await waitFor(() =>
      expect(screen.getByTestId('permission-toast')).toBeInTheDocument()
    );
  });

  test('download hidden when no role', () => {
    renderWithRole(null);

    expect(screen.queryByTestId('download-photo')).not.toBeInTheDocument();
  });
});
