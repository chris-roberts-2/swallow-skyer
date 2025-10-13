# Tests Directory

This directory contains test files for the Swallow Skyer application.

## Setup

Tests use Jest and React Testing Library, which are already configured in the project.

## Structure

- `App.test.js` - Main App component tests
- `routes/` - Route component tests
- `components/` - Component-specific tests
- `utils/` - Utility function tests

## Running Tests

```bash
npm test
```

## Test Guidelines

- Write tests for all major components
- Test user interactions and behavior
- Use descriptive test names
- Follow the AAA pattern (Arrange, Act, Assert)

## Example Test

```javascript
import { render, screen } from '@testing-library/react';
import App from '../App';

test('renders welcome message', () => {
  render(<App />);
  const linkElement = screen.getByText(/welcome to swallow skyer/i);
  expect(linkElement).toBeInTheDocument();
});
```
