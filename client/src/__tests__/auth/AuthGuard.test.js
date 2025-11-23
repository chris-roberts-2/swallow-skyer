import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AuthGuard from '../../components/auth/AuthGuard';
import { AuthContext } from '../../context/AuthContext';

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useLocation: () => ({ pathname: '/protected' }),
    Navigate: ({ to }) => <div>redirect:{to}</div>,
  };
});

const renderWithAuth = value =>
  render(
    <AuthContext.Provider value={value}>
      <MemoryRouter>
        <AuthGuard>
          <div>Protected Content</div>
        </AuthGuard>
      </MemoryRouter>
    </AuthContext.Provider>
  );

test('redirects to login when unauthenticated', () => {
  renderWithAuth({
    user: null,
    isLoading: false,
  });

  expect(screen.getByText('redirect:/login')).toBeInTheDocument();
});

test('renders children when authenticated', () => {
  renderWithAuth({
    user: { email: 'test@example.com' },
    isLoading: false,
  });

  expect(screen.getByText('Protected Content')).toBeInTheDocument();
});
