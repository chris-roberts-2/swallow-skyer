import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import BatchUploader from '../components/upload/BatchUploader';
import { AuthContext } from '../context/AuthContext';
import { usePermissionToast } from '../components/common/PermissionToast';

const renderWithAuth = (ui, { projectId = 'proj-123' } = {}) => {
  const value = {
    user: { id: 'user-1' },
    session: {},
    activeProject: projectId,
    setActiveProject: () => {},
  };
  return render(
    <AuthContext.Provider value={value}>{ui}</AuthContext.Provider>
  );
};

describe('BatchUploader', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'success',
          uploaded: [
            { photo_id: '1', original_filename: 'one.jpg' },
            { photo_id: '2', original_filename: 'two.jpg' },
          ],
        }),
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('submits multiple selected files with project_id', async () => {
    const { getByText, getByTestId } = renderWithAuth(<BatchUploader />);
    const input = getByTestId('dropzone').querySelector('input[type="file"]');

    const file1 = new File(['a'], 'one.jpg', { type: 'image/jpeg' });
    const file2 = new File(['b'], 'two.jpg', { type: 'image/jpeg' });

    fireEvent.change(input, { target: { files: [file1, file2] } });
    fireEvent.click(getByText('Upload'));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    const body = global.fetch.mock.calls[0][1].body;
    expect(body instanceof FormData).toBe(true);
    expect(body.getAll('files').length).toBe(2);
    expect(body.get('project_id')).toBe('proj-123');
  });

  it('handles drag and drop', async () => {
    const { getByTestId, getByText } = renderWithAuth(<BatchUploader />);
    const dropzone = getByTestId('dropzone');
    const file = new File(['x'], 'drag.jpg', { type: 'image/jpeg' });

    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [file],
      },
    });

    fireEvent.click(getByText('Upload'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  });

  it('calls API with multipart shape for a single file', async () => {
    const { getByTestId, getByText } = renderWithAuth(<BatchUploader />);
    const input = getByTestId('dropzone').querySelector('input[type="file"]');
    const file = new File(['a'], 'only.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(getByText('Upload'));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = global.fetch.mock.calls[0][1].body;
    expect(body.getAll('files')[0].name).toBe('only.jpg');
  });

  it('shows toast on 403 response', async () => {
    const spyToast = jest.fn();
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ message: 'forbidden' }),
    });

    const { getByTestId, getByText } = render(
      <AuthContext.Provider
        value={{
          user: { id: 'user-1' },
          session: {},
          activeProject: 'proj-123',
          setActiveProject: () => {},
        }}
      >
        <BatchUploader onForbidden={spyToast} />
      </AuthContext.Provider>
    );
    const input = getByTestId('dropzone').querySelector('input[type="file"]');
    const file = new File(['a'], 'only.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(getByText('Upload'));

    await waitFor(() => expect(spyToast).toHaveBeenCalled());
  });
});
