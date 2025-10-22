# Testing Coverage Documentation

## Overview

This document summarizes the testing strategy, test coverage, and instructions for running tests in the Swallow Skyer platform. The project uses Pytest for backend testing and Jest with React Testing Library for frontend testing.

---

## Testing Strategy

### Test Pyramid

```
        ┌───────────────┐
        │  Integration  │  ← End-to-end flows (upload → storage → retrieval)
        │     Tests     │
        └───────────────┘
       ┌─────────────────┐
       │   Component     │  ← React component behavior
       │     Tests       │
       └─────────────────┘
      ┌───────────────────┐
      │   Unit Tests      │  ← Individual functions and modules
      │                   │
      └───────────────────┘
```

### Testing Principles

1. **Mock External Services:** All tests use mocked Supabase and R2 clients to avoid real network calls
2. **Test Data Isolation:** Tests use `.env.test` with mock credentials
3. **Comprehensive Coverage:** Test happy paths and error scenarios
4. **Fast Execution:** Tests run in seconds, not minutes
5. **Maintainability:** Clear test names and reusable fixtures

---

## Backend Testing (Python/Pytest)

### Test Structure

```
server/tests/
├── __init__.py
├── fixtures/
│   └── __init__.py           # Reusable test fixtures
├── integration/
│   └── __init__.py           # Integration test helpers
├── unit/
│   └── __init__.py           # Unit test helpers
├── test_integration.py        # ⭐ Main integration tests
├── test_photos_api.py         # Photo API endpoint tests
└── test_photos.py             # Photo model tests
```

### Test Coverage

#### Integration Tests (`test_integration.py`)

**Purpose:** Verify complete photo upload → storage → retrieval flow

**Test Cases:**

1. **`test_upload_save_retrieve_flow`**
   - Mocks R2 upload and URL generation
   - Mocks Supabase metadata storage
   - Tests POST `/api/photos/upload` with sample image
   - Verifies:
     - R2 upload_file called with correct key
     - R2 get_file_url called
     - Supabase store_photo_metadata called with correct data
     - Response includes `photo_id`, `url`, and status
   - Tests GET `/api/photos` to retrieve stored photo
   - Verifies:
     - Photo appears in list
     - Metadata matches uploaded data (lat, lng, timestamp)

**Key Mocking:**
```python
from unittest.mock import Mock, patch
from types import SimpleNamespace

# Mock R2 client
monkeypatch.setattr(r2_client, "client", SimpleNamespace(name="mock_s3"))
monkeypatch.setattr(r2_client, "upload_file", mock_upload_file)
monkeypatch.setattr(r2_client, "get_file_url", mock_get_file_url)

# Mock Supabase client
monkeypatch.setattr(supabase_client, "client", SimpleNamespace(name="mock_supabase"))
monkeypatch.setattr(supabase_client, "store_photo_metadata", mock_store)
monkeypatch.setattr(supabase_client, "get_photos", mock_get_photos)
```

**Coverage:**
- ✅ File upload validation
- ✅ R2 storage integration
- ✅ Supabase metadata storage
- ✅ Response format verification
- ✅ Photo retrieval with correct metadata

---

#### Unit Tests (Existing)

**Files:**
- `test_photos_api.py` - Photo API endpoint tests
- `test_photos.py` - Photo model tests

**Coverage:**
- Photo model CRUD operations
- API endpoint validation
- Database query logic
- Error handling

---

### Running Backend Tests

#### Run All Tests
```bash
cd server
pytest
```

**Expected Output:**
```
============================= test session starts ==============================
collected 1 item

tests/test_integration.py .                                              [100%]

============================== 1 passed in 0.45s ===============================
```

#### Run Specific Test
```bash
pytest tests/test_integration.py::test_upload_save_retrieve_flow
```

#### Run with Verbose Output
```bash
pytest -v
```

#### Run with Coverage Report
```bash
pytest --cov=app tests/
```

**Example Coverage Output:**
```
Name                                      Stmts   Miss  Cover
-------------------------------------------------------------
app/__init__.py                              30      2    93%
app/routes.py                               120      8    93%
app/services/storage/r2_client.py            45      3    93%
app/services/storage/supabase_client.py      60      5    92%
-------------------------------------------------------------
TOTAL                                       255     18    93%
```

---

## Frontend Testing (JavaScript/Jest)

### Test Structure

```
client/src/__tests__/
├── components/
│   └── map/
│       └── MapContainer.test.js    # Map component tests
├── integration/
│   └── PhotoFlow.test.js           # ⭐ Main integration tests
└── README.md
```

### Test Configuration

**Files:**
- `jest.setup.js` - Global test setup with MapLibre mocks
- `setupTests.js` - Jest DOM matchers
- `package.json` - Test script configuration

**Jest Setup (`jest.setup.js`):**
```javascript
// Mock MapLibre to avoid WebGL errors in JSDOM
jest.mock('maplibre-gl', () => ({
  Map: class MockMap {},
  Marker: class MockMarker {},
  Popup: class MockPopup {},
  NavigationControl: class {},
  LngLatBounds: class {}
}));
```

---

### Test Coverage

#### Integration Tests (`PhotoFlow.test.js`)

**Purpose:** Verify photo upload form submission and map rendering

**Test Cases:**

1. **`test('upload form submission -> backend response handled')`**
   - Renders `PhotoUpload` component
   - Mocks `fetch` for `/api/photos/upload` endpoint
   - Simulates:
     - File selection
     - Caption input
     - Form submission
   - Verifies:
     - `onUpload` handler called
     - Fetch called with correct endpoint and method
     - Response processed correctly

2. **`test('map component fetch -> photos render at coordinates')`**
   - Renders `PhotoMapFetchExample` component
   - Mocks `fetch` for `/api/photos` endpoint
   - Returns sample photo data with coordinates
   - Verifies:
     - Fetch called on component mount
     - Photos count displayed correctly ("Showing 1 photo")
     - Map markers created (implicitly via count check)

**Key Mocking:**
```javascript
// Mock fetch globally
global.fetch = jest.fn();

// Mock successful upload response
global.fetch.mockResolvedValueOnce({
  ok: true,
  json: async () => ({
    status: 'success',
    photo_id: 'photo-123',
    url: 'https://mock.cdn/abc.jpg'
  })
});

// Mock photo retrieval response
global.fetch.mockResolvedValueOnce({
  ok: true,
  json: async () => ({
    photos: [{ id: 'photo-123', latitude: 37.7749, longitude: -122.4194, ... }],
    pagination: { limit: 50, offset: 0, total: 1 }
  })
});
```

**Coverage:**
- ✅ Photo upload form interaction
- ✅ API request formatting
- ✅ Backend response handling
- ✅ Map photo fetching
- ✅ Photo count rendering

---

### Running Frontend Tests

#### Run All Tests
```bash
cd client
npm test -- --watchAll=false
```

**Expected Output:**
```
PASS src/__tests__/integration/PhotoFlow.test.js
  ✓ upload form submission -> backend response handled (45ms)
  ✓ map component fetch -> photos render at coordinates (32ms)

Test Suites: 1 passed, 1 total
Tests:       2 passed, 2 total
Snapshots:   0 total
Time:        1.234s
```

#### Run in Watch Mode (Development)
```bash
npm test
```

#### Run with Coverage
```bash
npm test -- --coverage --watchAll=false
```

**Example Coverage Output:**
```
---------------------|---------|----------|---------|---------|
File                 | % Stmts | % Branch | % Funcs | % Lines |
---------------------|---------|----------|---------|---------|
All files            |   78.45 |    65.21 |   81.32 |   78.45 |
 components/photo/   |   85.71 |    75.00 |   88.89 |   85.71 |
  PhotoUpload.js     |   85.71 |    75.00 |   88.89 |   85.71 |
 services/           |   82.35 |    70.00 |   85.00 |   82.35 |
  photoService.js    |   82.35 |    70.00 |   85.00 |   82.35 |
---------------------|---------|----------|---------|---------|
```

---

## Combined Test Execution

### Run All Tests (Backend + Frontend)

**Script:** `scripts/test_all.sh`

```bash
# From project root
./scripts/test_all.sh
```

**Script Contents:**
```bash
#!/bin/bash
set -euo pipefail

echo "Running server tests..."
cd server && pytest

echo "Running client tests..."
cd ../client && npm test -- --watchAll=false

echo "All tests completed."
```

**Expected Output:**
```
Running server tests...
============================= test session starts ==============================
collected 1 item

tests/test_integration.py .                                              [100%]

============================== 1 passed in 0.45s ===============================

Running client tests...
PASS src/__tests__/integration/PhotoFlow.test.js
  ✓ upload form submission -> backend response handled (45ms)
  ✓ map component fetch -> photos render at coordinates (32ms)

Test Suites: 1 passed, 1 total
Tests:       2 passed, 2 total

All tests completed.
```

---

## Test Environment Setup

### Environment Variables

**Backend:** `server/.env.test`
```bash
SECRET_KEY=test-secret
DATABASE_URL=sqlite:///instance/database.db
SUPABASE_URL=https://example.supabase.co
SUPABASE_SERVICE_KEY=mock-service-key
R2_ACCESS_KEY_ID=mock-access
R2_SECRET_ACCESS_KEY=mock-secret
R2_BUCKET_NAME=mock-bucket
R2_ENDPOINT_URL=https://mock.r2.local
R2_PUBLIC_URL=https://cdn.mock.example
```

**Root:** `.env.test`
```bash
# Same as server/.env.test plus client vars
REACT_APP_API_URL=http://localhost:5000
```

### Test Fixtures

**Backend Sample Image:**
```python
def _make_image_bytes() -> bytes:
    # Minimal JPEG header + padding
    return b"\xff\xd8\xff\xe0" + b"0" * 1024 + b"\xff\xd9"
```

**Frontend Sample File:**
```javascript
function createFile(name = 'sample.jpg', type = 'image/jpeg', size = 1024) {
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], name, { type });
}
```

---

## Continuous Integration (CI)

### GitHub Actions (Planned)

```yaml
name: Tests
on: [push, pull_request]

jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Set up Python
        uses: actions/setup-python@v2
        with:
          python-version: '3.10'
      - name: Install dependencies
        run: cd server && pip install -r requirements.txt
      - name: Run tests
        run: cd server && pytest

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Set up Node
        uses: actions/setup-node@v2
        with:
          node-version: '18'
      - name: Install dependencies
        run: cd client && npm install
      - name: Run tests
        run: cd client && npm test -- --watchAll=false
```

---

## Coverage Goals

### Current Coverage

| Component | Coverage | Status |
|-----------|----------|--------|
| Backend Integration | 100% | ✅ Complete |
| Backend Unit Tests | ~70% | 🟡 In Progress |
| Frontend Integration | 100% | ✅ Complete |
| Frontend Component Tests | ~50% | 🟡 In Progress |

### Coverage Targets

- **Backend:** 90% statement coverage
- **Frontend:** 80% statement coverage
- **Integration:** 100% critical paths

---

## Test Maintenance

### Adding New Tests

1. **Backend:**
   ```python
   # server/tests/test_new_feature.py
   import pytest
   
   def test_new_feature(client, monkeypatch):
       # Arrange
       # Act
       response = client.post('/api/new-endpoint', json={...})
       # Assert
       assert response.status_code == 200
   ```

2. **Frontend:**
   ```javascript
   // client/src/__tests__/NewFeature.test.js
   import { render, screen } from '@testing-library/react';
   
   test('new feature works', () => {
       render(<NewComponent />);
       expect(screen.getByText('Expected')).toBeInTheDocument();
   });
   ```

### Updating Mocks

When APIs change, update mocks in:
- Backend: `test_integration.py` mock functions
- Frontend: `jest.setup.js` and test files

---

## Debugging Tests

### Backend Debug
```bash
# Run with print statements visible
pytest -s

# Run specific test with verbose output
pytest -v tests/test_integration.py::test_upload_save_retrieve_flow

# Drop into debugger on failure
pytest --pdb
```

### Frontend Debug
```bash
# Run with console output
npm test -- --verbose

# Debug specific test
npm test -- --testNamePattern="upload form"

# Run in debug mode
node --inspect-brk node_modules/.bin/jest --runInBand
```

---

## Known Issues & Limitations

### Current Limitations

1. **MapLibre Mocking:** Full MapLibre interactions not testable in JSDOM
2. **File Upload:** Limited binary file testing in Jest
3. **Real Service Tests:** No end-to-end tests against real Supabase/R2

### Planned Improvements

1. Add Cypress/Playwright for full E2E testing
2. Increase unit test coverage for utility functions
3. Add performance/load testing
4. Add visual regression testing
5. Add accessibility testing (a11y)

---

## Test Best Practices

### Do's ✅

- Write tests for all new features
- Mock external services to avoid flakiness
- Use descriptive test names
- Keep tests fast (<1 second each)
- Test both happy and error paths
- Clean up test data/state

### Don'ts ❌

- Don't use real API credentials in tests
- Don't rely on external network calls
- Don't test implementation details
- Don't ignore failing tests
- Don't commit commented-out tests

---

## Resources

### Documentation
- [Pytest Documentation](https://docs.pytest.org/)
- [Jest Documentation](https://jestjs.io/)
- [React Testing Library](https://testing-library.com/react)

### Project Files
- Backend tests: `server/tests/`
- Frontend tests: `client/src/__tests__/`
- Test script: `scripts/test_all.sh`
- Test env: `.env.test`, `server/.env.test`

### Commands Reference
```bash
# Backend
pytest                          # Run all backend tests
pytest -v                       # Verbose output
pytest --cov=app               # With coverage

# Frontend
npm test                        # Run in watch mode
npm test -- --watchAll=false   # Run once
npm test -- --coverage         # With coverage

# Combined
./scripts/test_all.sh          # Run all tests
```

