import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from './App';
import { AuthContext } from './context/AuthContext';

const renderWithAuth = (value = {}, initialEntries = ['/login']) => {
  const defaults = {
    user: null,
    session: null,
    isLoading: false,
    login: jest.fn(),
    signup: jest.fn(),
    logout: jest.fn(),
  };

  return render(
    <AuthContext.Provider value={{ ...defaults, ...value }}>
      <MemoryRouter initialEntries={initialEntries}>
        <AppRoutes />
      </MemoryRouter>
    </AuthContext.Provider>
  );
};

test('renders Swallow Skyer title', () => {
  renderWithAuth();
  expect(
    screen.getByRole('heading', {
      name: /^Swallow Skyer$/i,
    })
  ).toBeInTheDocument();
});

test('shows login/register links when signed out', () => {
  renderWithAuth({ user: null }, ['/login']);
  expect(screen.getAllByRole('link', { name: /login/i }).length).toBeGreaterThan(0);
  expect(screen.getAllByRole('link', { name: /register/i }).length).toBeGreaterThan(0);
});

test('shows profile navigation when signed in', () => {
  renderWithAuth({ user: { email: 'pilot@example.com' } }, ['/map']);
  expect(screen.getAllByText(/pilot@example.com/i).length).toBeGreaterThan(0);
  expect(screen.getByRole('link', { name: /photos/i })).toBeInTheDocument();
});
