import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../../context/AuthContext';

const Consumer = () => {
  const { activeProject, setActiveProject } = useAuth();
  React.useEffect(() => {
    setActiveProject({ id: 'project-from-test' });
  }, [setActiveProject]);
  return (
    <div data-testid="active-project">{activeProject?.id || activeProject}</div>
  );
};

describe('AuthContext project switching', () => {
  beforeEach(() => {
    localStorage.clear();
    jest
      .spyOn(require('../../lib/supabaseClient').default.auth, 'getSession')
      .mockResolvedValue({ data: { session: null }, error: null });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('persists active project selection', async () => {
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId('active-project').textContent).toBe('project-from-test')
    );
    expect(localStorage.getItem('activeProjectId')).toBe('project-from-test');
  });

  test('restores active project from storage', async () => {
    localStorage.setItem('activeProjectId', 'persisted-project');

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId('active-project').textContent).toBe(
        'persisted-project'
      )
    );
  });
});

