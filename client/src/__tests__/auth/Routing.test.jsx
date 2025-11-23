import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { AppRoutes } from '../../App';
import { AuthContext } from '../../context/AuthContext';

jest.mock('../../PhotoMapLive', () => () => <div>Mock Photo Map</div>);

const renderWithRouter = (initialEntries, value) => {
  const defaults = {
    user: null,
    isLoading: false,
    login: jest.fn(),
    signup: jest.fn(),
    logout: jest.fn(),
    session: null,
  };

  return render(
    <AuthContext.Provider value={{ ...defaults, ...value }}>
      <MemoryRouter initialEntries={initialEntries}>
        <AppRoutes />
      </MemoryRouter>
    </AuthContext.Provider>
  );
};

test('protected routes redirect unauthenticated users to login', () => {
  renderWithRouter(['/map'], { user: null });

  expect(screen.getByRole('heading', { name: /login/i })).toBeInTheDocument();
});

test('protected routes render when user is present', () => {
  renderWithRouter(['/profile'], { user: { email: 'pilot@example.com' } });

  expect(screen.getByRole('heading', { name: /profile/i })).toBeInTheDocument();
});

test('root redirect sends authenticated users to /map', () => {
  renderWithRouter(['/'], { user: { email: 'pilot@example.com' } });

  expect(screen.getByText('Mock Photo Map')).toBeInTheDocument();
});

test('root redirect sends guests to /login', () => {
  renderWithRouter(['/'], { user: null });

  expect(screen.getByRole('heading', { name: /login/i })).toBeInTheDocument();
});
