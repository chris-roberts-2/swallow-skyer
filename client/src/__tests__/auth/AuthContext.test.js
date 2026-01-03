import React from 'react';
import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
} from '@testing-library/react';
import { AuthProvider, useAuth } from '../../context/AuthContext';

jest.mock('../../lib/supabaseClient', () =>
  require('../../__mocks__/supabase')
);

const supabaseMock = require('../../__mocks__/supabase');
jest.mock('../../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockResolvedValue({ projects: [] }),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    request: jest.fn(),
  },
}));

const TestComponent = () => {
  const { isLoading, user } = useAuth();
  return (
    <div>
      <div data-testid="loading">{isLoading ? 'yes' : 'no'}</div>
      <div data-testid="user">{user ? user.email : 'none'}</div>
    </div>
  );
};

const renderWithProvider = ui =>
  render(<AuthProvider>{ui || <TestComponent />}</AuthProvider>);

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  supabaseMock.resetSupabaseMocks();
  supabaseMock.auth.onAuthStateChange.mockImplementation(callback => {
    return {
      data: { subscription: { unsubscribe: jest.fn() } },
    };
  });
});

test('restores session from Supabase on mount', async () => {
  const session = {
    access_token: 'token',
    refresh_token: 'refresh',
    user: { email: 'mock@example.com' },
  };
  supabaseMock.auth.getSession.mockResolvedValueOnce({
    data: { session },
    error: null,
  });

  renderWithProvider();

  expect(screen.getByTestId('loading').textContent).toBe('yes');

  await waitFor(() =>
    expect(screen.getByTestId('user').textContent).toBe('mock@example.com')
  );
  expect(localStorage.getItem('supabaseSession')).toContain('mock@example.com');
  expect(localStorage.getItem('access_token')).toBe('token');
  expect(localStorage.getItem('refresh_token')).toBe('refresh');
});

test('login stores Supabase session and updates user state', async () => {
  const session = {
    access_token: 'token-123',
    refresh_token: 'refresh-123',
    user: { email: 'login@example.com' },
  };
  supabaseMock.auth.signInWithPassword.mockResolvedValue({
    data: { session, user: session.user },
    error: null,
  });

  const LoginButton = () => {
    const { login, user } = useAuth();
    return (
      <>
        <button
          type="button"
          onClick={() => login('login@example.com', 'Secret123!')}
        >
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
  expect(supabaseMock.auth.signInWithPassword).toHaveBeenCalledWith({
    email: 'login@example.com',
    password: 'Secret123!',
  });
  expect(localStorage.getItem('access_token')).toBe('token-123');
});

test('logout clears session state', async () => {
  const session = {
    access_token: 'token',
    refresh_token: 'refresh',
    user: { email: 'logout@example.com' },
  };
  supabaseMock.auth.getSession.mockResolvedValueOnce({
    data: { session },
    error: null,
  });

  const LogoutButton = () => {
    const { logout, user } = useAuth();
    return (
      <>
        <button type="button" onClick={() => logout()}>
          trigger-logout
        </button>
        <div data-testid="user">{user ? user.email : 'none'}</div>
      </>
    );
  };

  renderWithProvider(<LogoutButton />);

  await waitFor(() =>
    expect(screen.getByTestId('user').textContent).toBe('logout@example.com')
  );

  fireEvent.click(screen.getByText('trigger-logout'));

  await waitFor(() =>
    expect(screen.getByTestId('user').textContent).toBe('none')
  );
  expect(supabaseMock.auth.signOut).toHaveBeenCalled();
  expect(localStorage.getItem('supabaseSession')).toBeNull();
});

test('signup forwards credentials to Supabase', async () => {
  supabaseMock.auth.signUp.mockResolvedValue({
    data: { session: null, user: { email: 'register@example.com' } },
    error: null,
  });

  const SignupButton = () => {
    const { signup } = useAuth();
    return (
      <button
        type="button"
        onClick={() => signup('register@example.com', 'Secret123!')}
      >
        trigger-signup
      </button>
    );
  };

  renderWithProvider(<SignupButton />);

  fireEvent.click(screen.getByText('trigger-signup'));

  await waitFor(() =>
    expect(supabaseMock.auth.signUp).toHaveBeenCalledWith({
      email: 'register@example.com',
      password: 'Secret123!',
    })
  );
});

test('onAuthStateChange updates session state when Supabase emits events', async () => {
  renderWithProvider();

  const handler = supabaseMock.auth.onAuthStateChange.mock.calls[0][0];

  act(() => {
    handler('SIGNED_IN', {
      access_token: 'next-token',
      refresh_token: 'next-refresh',
      user: { email: 'event@example.com' },
    });
  });

  await waitFor(() =>
    expect(screen.getByTestId('user').textContent).toBe('event@example.com')
  );
});
