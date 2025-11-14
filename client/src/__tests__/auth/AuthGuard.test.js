import React from 'react';
import { render, screen } from '@testing-library/react';
import AuthGuard from '../../components/auth/AuthGuard';
import { AuthContext } from '../../context/AuthContext';

jest.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/protected' }),
  Navigate: ({ to }) => <div>redirect:{to}</div>,
}));

const renderWithAuth = value =>
  render(
    <AuthContext.Provider value={value}>
      <AuthGuard>
        <div>Protected Content</div>
      </AuthGuard>
    </AuthContext.Provider>
  );

test('redirects to login when unauthenticated', () => {
  renderWithAuth({
    user: null,
    isAuthenticated: false,
    isLoading: false,
  });

  expect(screen.getByText('redirect:/login')).toBeInTheDocument();
});

test('renders children when authenticated', () => {
  renderWithAuth({
    user: { email: 'test@example.com' },
    isAuthenticated: true,
    isLoading: false,
  });

  expect(screen.getByText('Protected Content')).toBeInTheDocument();
});

