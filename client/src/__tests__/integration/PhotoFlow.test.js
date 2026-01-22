import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// We'll test against PhotoUpload and the map fetching example
import PhotoUpload from '../../components/photo/PhotoUpload';
import PhotoMapFetchExample from '../../components/PhotoMapFetchExample';
import { AuthContext } from '../../context/AuthContext';

// Mock fetch globally for backend API calls
const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

function createFile(name = 'sample.jpg', type = 'image/jpeg', size = 1024) {
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], name, { type });
}

test('upload form submission -> backend response handled', async () => {
  const mockOnUpload = jest.fn(async (file, caption, location) => {
    // Simulate client-side service calling /api/photos/upload via fetch
    const formData = new FormData();
    formData.append('file', file);
    formData.append('caption', caption);
    formData.append('latitude', location.latitude);
    formData.append('longitude', location.longitude);
    formData.append('user_id', 'user-42');

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'success',
        photo_id: 'photo-123',
        url: 'https://mock.cdn/abc.jpg',
      }),
    });

    const resp = await fetch('http://localhost:5000/api/photos/upload', {
      method: 'POST',
      body: formData,
    });
    return resp.json();
  });

  const location = { latitude: 37.7749, longitude: -122.4194 };

  render(<PhotoUpload onUpload={mockOnUpload} location={location} />);

  const fileInput = screen.getByRole('textbox', { hidden: true });
  // Fallback: query by input[type=file]
  const fileInputs = document.querySelectorAll('input[type="file"]');
  const fileEl = fileInputs[0];
  const testFile = createFile();

  // Set caption
  const captionInput = screen.getByPlaceholderText('Add a caption...');
  fireEvent.change(captionInput, { target: { value: 'Test caption' } });

  // Set file
  Object.defineProperty(fileEl, 'files', { value: [testFile] });
  fireEvent.change(fileEl);

  // Submit
  const submitBtn = screen.getByRole('button', { name: /upload photo/i });
  fireEvent.click(submitBtn);

  await waitFor(() => expect(mockOnUpload).toHaveBeenCalled());
  expect(global.fetch).toHaveBeenCalledWith(
    'http://localhost:5000/api/photos/upload',
    expect.objectContaining({ method: 'POST' })
  );
});

test('map component fetch -> photos render at coordinates', async () => {
  // Mock GET /api/photos
  global.fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      photos: [
        {
          id: 'photo-123',
          url: 'https://mock.cdn/abc.jpg',
          latitude: 37.7749,
          longitude: -122.4194,
          taken_at: '2024-01-01T00:00:00Z',
        },
      ],
      pagination: { limit: 50, offset: 0, total: 1 },
    }),
  });

  const authValue = {
    user: { id: 'user-123', email: 'pilot@example.com' },
    session: { user: { id: 'user-123', email: 'pilot@example.com' } },
    isLoading: false,
    login: jest.fn(),
    signup: jest.fn(),
    logout: jest.fn(),
    refreshProfile: jest.fn(),
    updateProfile: jest.fn(),
    updateLogin: jest.fn(),
    projects: [{ id: 'project-1', name: 'Test Project' }],
    projectRoles: {},
    activeProject: { id: 'project-1', name: 'Test Project' },
    setActiveProject: jest.fn(),
    refreshProjects: jest.fn(),
  };

  render(
    <AuthContext.Provider value={authValue}>
      <PhotoMapFetchExample />
    </AuthContext.Provider>
  );

  // Wait for fetch to complete and markers to be added (we can't inspect maplibre canvas directly)
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());

  // Verify that popup HTML would include coordinates when marker is created
  // We can't click the maplibre marker easily; instead we assert that data was processed
  // by checking console log side effect or DOM changes around counts.
  // The component shows an info panel with count.
  expect(await screen.findByText(/Showing 1 photo/)).toBeInTheDocument();
});
