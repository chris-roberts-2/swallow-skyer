#!/bin/bash

# Swallow Skyer Setup Script
# This script automates the setup process for the Swallow Skyer project
# It is idempotent and safe to run multiple times

set -e  # Exit on any error

echo "🚀 Setting up Swallow Skyer..."
echo "=================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Node.js is installed
print_status "Checking Node.js installation..."
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 18+ and try again."
    print_status "Visit: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node --version)
print_success "Node.js found: $NODE_VERSION"

# Check if Python is installed
print_status "Checking Python installation..."
if ! command -v python3 &> /dev/null; then
    print_error "Python 3 is not installed. Please install Python 3.8+ and try again."
    print_status "Visit: https://python.org/"
    exit 1
fi

PYTHON_VERSION=$(python3 --version)
print_success "Python found: $PYTHON_VERSION"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed. Please install npm and try again."
    exit 1
fi

# Check if pip is installed
if ! command -v pip3 &> /dev/null; then
    print_error "pip3 is not installed. Please install pip3 and try again."
    exit 1
fi

# Create virtual environment if it doesn't exist
print_status "Setting up Python virtual environment..."
if [ ! -d "venv" ]; then
    print_status "Creating virtual environment..."
    python3 -m venv venv
    print_success "Virtual environment created"
else
    print_success "Virtual environment already exists"
fi

# Activate virtual environment
print_status "Activating virtual environment..."
source venv/bin/activate
print_success "Virtual environment activated"

# Create .env files if they don't exist
print_status "Setting up environment files..."

if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        print_success "Created .env from .env.example"
        print_warning "Please edit .env file with your configuration"
    else
        print_warning "No .env.example found, skipping root .env creation"
    fi
else
    print_success ".env file already exists"
fi

if [ ! -f "server/.env" ]; then
    if [ -f "server/.env.example" ]; then
        cp server/.env.example server/.env
        print_success "Created server/.env from server/.env.example"
        print_warning "Please edit server/.env file with your Supabase and R2 credentials"
    else
        print_warning "No server/.env.example found"
    fi
else
    print_success "server/.env file already exists"
fi

if [ ! -f "client/.env.local" ]; then
    if [ -f "client/env.example" ]; then
        cp client/env.example client/.env.local
        print_success "Created client/.env.local from client/env.example"
        print_warning "Please edit client/.env.local with your Supabase anon key and API URLs"
    else
        print_warning "No client/env.example found"
    fi
else
    print_success "client/.env.local file already exists"
fi

# Install backend dependencies
print_status "Installing backend dependencies..."
cd server
if [ -f "requirements.txt" ]; then
    pip install -r requirements.txt
    print_success "Backend dependencies installed"
else
    print_error "requirements.txt not found in server directory"
    exit 1
fi
cd ..

# Install frontend dependencies
print_status "Installing frontend dependencies..."
cd client
if [ -f "package.json" ]; then
    npm install
    print_success "Frontend dependencies installed"
else
    print_error "package.json not found in client directory"
    exit 1
fi
cd ..

# Create necessary directories
print_status "Creating necessary directories..."
mkdir -p server/uploads
mkdir -p server/instance
mkdir -p client/public/uploads
mkdir -p shared/constants
mkdir -p shared/schemas
mkdir -p shared/types
mkdir -p shared/validation
print_success "Directories created"

# Initialize database (if Flask app exists)
print_status "Setting up database..."
cd server
if [ -f "app/__init__.py" ]; then
    # Try to initialize database, but don't fail if it already exists
    python -c "
import sys
sys.path.append('.')
from app import create_app, db
app = create_app()
with app.app_context():
    try:
        db.create_all()
        print('Database tables created/verified')
    except Exception as e:
        print(f'Database setup completed (may already exist): {e}')
    " 2>/dev/null || print_warning "Database initialization skipped (may need manual setup)"
else
    print_warning "Flask app not found, skipping database initialization"
fi
cd ..

# Make scripts executable
print_status "Making scripts executable..."
chmod +x scripts/*.sh 2>/dev/null || true
chmod +x git-push-commands/*.sh 2>/dev/null || true
print_success "Scripts made executable"

echo ""
echo "=================================="
print_success "Setup complete! 🎉"
echo "=================================="
echo ""
echo "📋 Next Steps:"
echo "1. Configure your environment files:"
echo "   - Edit .env files with your actual credentials"
echo "   - Update Supabase URL and service key"
echo "   - Update Cloudflare R2 credentials"
echo ""
echo "2. Start the development servers:"
echo "   ${BLUE}Backend:${NC}  source venv/bin/activate && cd server && flask run"
echo "   ${BLUE}Frontend:${NC} cd client && npm start"
echo ""
echo "3. Access the application:"
echo "   ${BLUE}Frontend:${NC} http://localhost:3000"
echo "   ${BLUE}Backend:${NC}  http://localhost:5000"
echo ""
echo "4. Run tests:"
echo "   ${BLUE}Backend:${NC}  cd server && pytest"
echo "   ${BLUE}Frontend:${NC} cd client && npm test"
echo ""
echo "📚 Documentation:"
echo "   - Architecture: docs/architecture.md"
echo "   - API endpoints: docs/api/endpoints.md"
echo "   - Deployment: docs/deployment/README.md"
echo ""
print_warning "Don't forget to configure your .env files with real credentials!"
echo ""
