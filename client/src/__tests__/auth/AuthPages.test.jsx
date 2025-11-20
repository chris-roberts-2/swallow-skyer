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

  fireEvent.change(screen.getByLabelText(/Email/i), {
    target: { value: 'new@example.com' },
  });
  fireEvent.change(screen.getByLabelText(/Password/i), {
    target: { value: 'Secret123!' },
  });

  fireEvent.click(screen.getByRole('button', { name: /register/i }));

  await waitFor(() =>
    expect(signup).toHaveBeenCalledWith('new@example.com', 'Secret123!')
  );
});

test('ProfilePage shows metadata and handles logout', async () => {
  const logout = jest.fn().mockResolvedValue({});
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const createdAt = '2025-01-01T00:00:00.000Z';

  renderWithAuth(<ProfilePage />, {
    logout,
    user: { email: 'pilot@example.com', id: 'user-123' },
    session: { expires_at: expiresAt, created_at: createdAt },
  });

  expect(screen.getByText('pilot@example.com')).toBeInTheDocument();
  expect(screen.getByText('user-123')).toBeInTheDocument();
  expect(
    screen.getByText(new Date(expiresAt * 1000).toLocaleString())
  ).toBeInTheDocument();
  expect(
    screen.getByText(new Date(createdAt).toLocaleString())
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /logout/i }));

  await waitFor(() => expect(logout).toHaveBeenCalled());
});
