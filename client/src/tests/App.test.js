import React from 'react';
import { render, screen } from '@testing-library/react';
jest.mock(
  'react-router-dom',
  () => ({
    BrowserRouter: ({ children }) => <div>{children}</div>,
    Routes: ({ children }) => <div>{children}</div>,
    Route: ({ element }) => element,
    Navigate: () => null,
  }),
  { virtual: true }
);
import App from '../App';

// Wrapper component to provide router context for tests
const AppWithRouter = () => (
  <BrowserRouter>
    <App />
  </BrowserRouter>
);

test('renders Swallow Skyer title', () => {
  render(<App />);
  const titleElement = screen.getByRole('heading', { name: /^Swallow Skyer$/i });
  expect(titleElement).toBeInTheDocument();
});

test('renders navigation links', () => {
  render(<App />);
  const homeLink = screen.getByRole('link', { name: /^Home$/i });
  const mapLink = screen.getByRole('link', { name: /^Map$/i });

  expect(homeLink).toBeInTheDocument();
  expect(mapLink).toBeInTheDocument();
});

test('renders welcome message on home page', () => {
  render(<App />);
  const welcomeMessage = screen.getByText(/welcome to swallow skyer/i);
  expect(welcomeMessage).toBeInTheDocument();
});
