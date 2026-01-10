# Frontend Testing Structure

## Purpose

This directory contains all React component and unit tests for the Swallow Skyer frontend. These tests run locally/CI and are not deployed to GitHub Pages.

## Organization

```
__tests__/
├── components/          # Component tests
│   ├── map/            # Map component tests
│   ├── photo/          # Photo component tests
│   └── common/         # Common component tests
├── pages/              # Page component tests
├── services/           # Service layer tests
├── utils/              # Utility function tests
└── __mocks__/          # Mock files and test utilities
```

## Testing Framework

- **Jest** - Test runner and assertion library
- **React Testing Library** - Component testing utilities
- **MSW** - API mocking (if needed)

## Test Naming Convention

- Component tests: `ComponentName.test.js`
- Service tests: `serviceName.test.js`
- Utility tests: `utilityName.test.js`

## Running Tests

```bash
npm test                    # Run all tests
npm test -- --watch        # Watch mode
npm test -- --coverage     # With coverage report
```
