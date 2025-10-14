import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

// Wrapper component to provide router context for tests
const AppWithRouter = () => (
  <BrowserRouter>
    <App />
  </BrowserRouter>
);

test('renders Swallow Skyer title', () => {
  render(<AppWithRouter />);
  const titleElement = screen.getByText(/swallow skyer/i);
  expect(titleElement).toBeInTheDocument();
});

test('renders navigation links', () => {
  render(<AppWithRouter />);
  const homeLink = screen.getByText(/home/i);
  const mapLink = screen.getByText(/map/i);

  expect(homeLink).toBeInTheDocument();
  expect(mapLink).toBeInTheDocument();
});

test('renders welcome message on home page', () => {
  render(<AppWithRouter />);
  const welcomeMessage = screen.getByText(/welcome to swallow skyer/i);
  expect(welcomeMessage).toBeInTheDocument();
});
