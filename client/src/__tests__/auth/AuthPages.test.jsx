import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import LoginPage from '../../pages/LoginPage.jsx';
import RegisterPage from '../../pages/RegisterPage.jsx';
import ProfilePage from '../../pages/ProfilePage.jsx';

const renderWithAuth = (ui, value) =>
  render(
    <AuthContext.Provider
      value={{
        login: jest.fn(),
        signup: jest.fn(),
        logout: jest.fn(),
        refreshProfile: jest.fn(),
        updateProfile: jest.fn(),
        updateLogin: jest.fn(),
        projects: [],
        projectRoles: {},
        activeProject: null,
        setActiveProject: jest.fn(),
        refreshProjects: jest.fn(),
        user: null,
        session: null,
        ...value,
      }}
    >
      <MemoryRouter>{ui}</MemoryRouter>
    </AuthContext.Provider>
  );

test('LoginPage submits credentials via AuthContext', async () => {
  const login = jest.fn().mockResolvedValue({});
  renderWithAuth(<LoginPage />, { login });

  fireEvent.change(screen.getByLabelText(/Email/i), {
    target: { value: 'pilot@example.com' },
  });
  fireEvent.change(screen.getByLabelText(/Password/i), {
    target: { value: 'Secret123!' },
  });

  fireEvent.click(screen.getByRole('button', { name: /login/i }));

  await waitFor(() =>
    expect(login).toHaveBeenCalledWith('pilot@example.com', 'Secret123!')
  );
});

test('RegisterPage submits credentials via AuthContext', async () => {
  const signup = jest.fn().mockResolvedValue({});
  renderWithAuth(<RegisterPage />, { signup });

  fireEvent.change(screen.getByLabelText(/First name/i), {
    target: { value: 'Test' },
  });
  fireEvent.change(screen.getByLabelText(/Last name/i), {
    target: { value: 'Pilot' },
  });
  fireEvent.change(screen.getByLabelText(/Email/i), {
    target: { value: 'new@example.com' },
  });
  fireEvent.change(screen.getByLabelText(/Password/i), {
    target: { value: 'Secret123!' },
  });

  fireEvent.click(screen.getByRole('button', { name: /register/i }));

  await waitFor(() =>
    expect(signup).toHaveBeenCalledWith('new@example.com', 'Secret123!', {
      company: '',
      firstName: 'Test',
      lastName: 'Pilot',
    })
  );
});

test('ProfilePage shows metadata and handles logout', async () => {
  const logout = jest.fn().mockResolvedValue({});

  renderWithAuth(<ProfilePage />, {
    logout,
    user: { email: 'pilot@example.com', id: 'user-123' },
    session: {},
    profile: {
      email: 'pilot@example.com',
      firstName: 'Test',
      lastName: 'Pilot',
      company: 'Swallow',
    },
  });

  expect(screen.getAllByText('pilot@example.com').length).toBeGreaterThan(0);
  expect(screen.getByText('Test Pilot')).toBeInTheDocument();
  expect(screen.getByText('Swallow')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /logout/i }));

  await waitFor(() => expect(logout).toHaveBeenCalled());
});
