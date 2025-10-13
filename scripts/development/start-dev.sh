#!/bin/bash

# Start development environment
set -e

echo "🔧 Starting development environment..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required but not installed"
    exit 1
fi

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required but not installed"
    exit 1
fi

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd client
npm install
cd ..

# Install backend dependencies
echo "🐍 Installing backend dependencies..."
cd server
pip install -r requirements.txt
cd ..

echo "✅ Development environment setup complete!"
echo "💡 Use 'npm start' in client/ and 'python app.py' in server/ to start the applications"
