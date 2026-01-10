import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthContext } from '../../context/AuthContext';
import UploadPanel from '../../components/upload/UploadPanel';
import ProjectDashboard from '../../components/projects/ProjectDashboard';
import MemberManager from '../../components/projects/MemberManager';
import PhotoControls from '../../components/map/PhotoControls';

const baseContext = {
  user: { id: 'user-1' },
  session: {},
  isLoading: false,
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
        activeProject: 'project-1',
        projectRoles: { 'project-1': role },
        roleForActiveProject: () => role,
      }}
    >
      <UploadPanel />
      <ProjectDashboard />
      <MemberManager />
      <PhotoControls photoId="photo-1" />
    </AuthContext.Provider>
  );

describe('role-based UI permissions', () => {
  test('viewer sees view-only controls', () => {
    renderWithRole('viewer');
    expect(screen.getByTestId('upload-disabled')).toBeInTheDocument();
    expect(screen.queryByTestId('dropzone')).not.toBeInTheDocument();
    expect(screen.queryByTestId('edit-project')).not.toBeInTheDocument();
    expect(screen.queryByTestId('delete-project')).not.toBeInTheDocument();
    expect(screen.queryByTestId('add-member')).not.toBeInTheDocument();
    expect(screen.queryByTestId('delete-photo')).not.toBeInTheDocument();
  });

  test('collaborator can upload but not manage project or members', () => {
    renderWithRole('collaborator');
    expect(screen.getByTestId('dropzone')).toBeInTheDocument();
    expect(screen.queryByTestId('edit-project')).not.toBeInTheDocument();
    expect(screen.queryByTestId('delete-project')).not.toBeInTheDocument();
    expect(screen.queryByTestId('add-member')).not.toBeInTheDocument();
    expect(screen.queryByTestId('delete-photo')).not.toBeInTheDocument();
  });

  test('owner can see all management actions', () => {
    renderWithRole('owner');
    expect(screen.getByTestId('dropzone')).toBeInTheDocument();
    expect(screen.getByTestId('edit-project')).toBeInTheDocument();
    expect(screen.getByTestId('delete-project')).toBeInTheDocument();
    expect(screen.getByTestId('add-member')).toBeInTheDocument();
    expect(screen.getByTestId('delete-photo')).toBeInTheDocument();
  });

  test('forbidden responses surface permission toast', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ message: 'forbidden' }),
      })
      .mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ message: 'forbidden' }),
      });

    renderWithRole('owner');

    fireEvent.click(screen.getByTestId('delete-project'));

    await waitFor(() =>
      expect(screen.getByTestId('permission-toast')).toBeInTheDocument()
    );

    fetchSpy.mockRestore();
  });
});
