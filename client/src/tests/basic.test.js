// Basic test to verify Jest and React Testing Library are working
import { render, screen } from '@testing-library/react';

// Simple component for testing
const TestComponent = () => {
  return <div>Test Component</div>;
};

test('renders test component', () => {
  render(<TestComponent />);
  const element = screen.getByText('Test Component');
  expect(element).toBeInTheDocument();
});

test('basic math works', () => {
  expect(2 + 2).toBe(4);
});
