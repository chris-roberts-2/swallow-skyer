import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AuthProvider, useAuth } from '../../context/AuthContext';

jest.mock('../../services/authService', () => ({
  signup: jest.fn(),
  login: jest.fn(),
  refresh: jest.fn(),
  me: jest.fn(),
}));

jest.mock('../../services/api', () => ({
  setAuthHandlers: jest.fn(),
}));

const authService = require('../../services/authService');

const TestComponent = () => {
  const { isLoading, isAuthenticated, user } = useAuth();
  return (
    <div>
      <div data-testid="loading">{isLoading ? 'yes' : 'no'}</div>
      <div data-testid="authed">{isAuthenticated ? 'yes' : 'no'}</div>
      <div data-testid="user">{user ? user.email : 'none'}</div>
    </div>
  );
};

const renderWithProvider = ui =>
  render(<AuthProvider>{ui || <TestComponent />}</AuthProvider>);

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

test('loads user from existing access token', async () => {
  localStorage.setItem('access_token', 'access');
  authService.me.mockResolvedValueOnce({ user: { email: 'mock@example.com' } });

  renderWithProvider(<TestComponent />);

  expect(screen.getByTestId('loading').textContent).toBe('yes');

  await waitFor(() =>
    expect(screen.getByTestId('authed').textContent).toBe('yes')
  );
  expect(screen.getByTestId('user').textContent).toBe('mock@example.com');
  expect(authService.me).toHaveBeenCalledTimes(1);
});

test('refreshes tokens when access token invalid', async () => {
  localStorage.setItem('access_token', 'bad');
  localStorage.setItem('refresh_token', 'refresh');
  authService.me.mockRejectedValueOnce(new Error('expired'));
  authService.refresh.mockResolvedValueOnce({
    access_token: 'new-access',
    refresh_token: 'new-refresh',
    user: { email: 'refresh@example.com' },
  });
  authService.me.mockResolvedValueOnce({ user: { email: 'refresh@example.com' } });

  renderWithProvider();

  await waitFor(() =>
    expect(screen.getByTestId('user').textContent).toBe('refresh@example.com')
  );
  expect(authService.refresh).toHaveBeenCalledWith('refresh');
  expect(localStorage.getItem('access_token')).toBe('new-access');
  expect(localStorage.getItem('refresh_token')).toBe('new-refresh');
});

test('login stores tokens and updates user state', async () => {
  authService.login.mockResolvedValueOnce({
    access_token: 'token-123',
    refresh_token: 'refresh-123',
    user: { email: 'login@example.com' },
  });

  const LoginButton = () => {
    const { login, user } = useAuth();
    return (
      <>
        <button type="button" onClick={() => login('login@example.com', 'Secret123!')}>
          trigger-login
        </button>
        <div data-testid="user">{user ? user.email : 'none'}</div>
      </>
    );
  };

  renderWithProvider(<LoginButton />);

  fireEvent.click(screen.getByText('trigger-login'));

  await waitFor(() =>
    expect(screen.getByTestId('user').textContent).toBe('login@example.com')
  );
  expect(localStorage.getItem('access_token')).toBe('token-123');
  expect(localStorage.getItem('refresh_token')).toBe('refresh-123');
});


