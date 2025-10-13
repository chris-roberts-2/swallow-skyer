#!/bin/bash

# Swallow Skyer Setup Script
echo "Setting up Swallow Skyer..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed. Please install Node.js 18+ and try again."
    exit 1
fi

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "Python 3 is not installed. Please install Python 3.8+ and try again."
    exit 1
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file from template..."
    cp .env.example .env
    echo "Please edit .env file with your configuration before continuing."
fi

# Install frontend dependencies
echo "Installing frontend dependencies..."
cd client
npm install
cd ..

# Install backend dependencies
echo "Installing backend dependencies..."
cd server
pip install -r requirements.txt
cd ..

# Create necessary directories
echo "Creating necessary directories..."
mkdir -p server/uploads
mkdir -p server/instance
mkdir -p client/public/uploads

# Initialize database
echo "Initializing database..."
cd server
flask db init
flask db migrate -m "Initial migration"
flask db upgrade
cd ..

echo "Setup complete! 🎉"
echo ""
echo "To start the development servers:"
echo "1. Backend: cd server && python app.py"
echo "2. Frontend: cd client && npm start"
echo ""
echo "Don't forget to configure your .env file!"
