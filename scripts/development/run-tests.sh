#!/bin/bash

# Run all tests
set -e

echo "🧪 Running test suite..."

# Run frontend tests
echo "🧪 Running frontend tests..."
cd client
npm test -- --coverage --watchAll=false
cd ..

# Run backend tests
echo "🐍 Running backend tests..."
cd server
python -m pytest tests/ -v --cov=app --cov-report=html
cd ..

echo "✅ All tests completed!"
