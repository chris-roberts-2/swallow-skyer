# Swallow Skyer - Architecture Documentation

## Project Overview

Swallow Skyer is a web application for storing and managing photos on a map based on GPS coordinates. The project uses a modern full-stack architecture with React frontend and Flask backend, integrated with Supabase for metadata storage and Cloudflare R2 for file storage.

## Project Structure

```
swallow-skyer/
├── client/                 # React frontend application
├── server/                 # Flask backend application
├── shared/                 # Shared utilities and schemas
├── scripts/                # Development and deployment scripts
├── git-push-commands/      # Git workflow automation scripts
├── docs/                   # Project documentation
├── instance/              # Database and runtime files
└── venv/                  # Python virtual environment
```

## Architecture Components

### Frontend (`client/`)

**Technology Stack:**
- React 19+ with functional components and hooks
- MapLibre GL JS for interactive maps
- React Router for navigation
- ESLint/Prettier for code formatting
- Jest + React Testing Library for testing

**Key Components:**
- `App.js` - Main application with MapLibre integration
- `components/map/` - Map-related components
  - `MapContainer.js` - Map wrapper component
  - `MapMarker.js` - Individual photo markers
  - `PhotoStack.js` - Photo collection display
  - `nodes/` - Advanced node management components
- `components/photo/` - Photo-related components
  - `PhotoCard.js` - Individual photo display
  - `PhotoUpload.js` - Photo upload interface
- `services/` - API integration services
- `utils/` - Helper functions and constants

**Features:**
- Interactive MapLibre map with navigation controls
- Photo markers with click handlers
- Photo stack display for location-based collections
- Responsive design with modern CSS

### Backend (`server/`)

**Technology Stack:**
- Flask 3+ with application factory pattern
- SQLAlchemy for database ORM
- Flask-CORS for cross-origin requests
- Supabase Python client for metadata operations
- Boto3 for Cloudflare R2 file storage
- Pytest for testing

**Key Components:**
- `app/__init__.py` - Flask application factory
- `app/models.py` - Database models (User, Photo, Location)
- `app/routes.py` - API endpoints and integration tests
- `app/services/storage/` - External service integrations
  - `supabase_client.py` - Supabase metadata operations
  - `r2_client.py` - Cloudflare R2 file operations
- `app/config/` - Environment-based configuration
- `tests/` - Test suite with fixtures and integration tests

**API Endpoints:**
- `GET /ping` - Health check
- `GET /api/health` - Detailed health status
- `GET/POST /api/users` - User management
- `GET/POST /api/photos` - Photo metadata
- `GET/POST /api/locations` - Location management
- `GET /api/test/supabase-r2` - Integration testing

### Shared Resources (`shared/`)

**Components:**
- `constants/` - Shared configuration constants
- `schemas/` - Data validation schemas
- `types/` - TypeScript type definitions
- `validation/` - Common validation utilities

### Scripts (`scripts/`)

**Development Scripts:**
- `setup.sh` - Automated project setup
- `development/` - Development workflow scripts
- `deployment/` - Production deployment scripts

### Git Workflow (`git-push-commands/`)

**Automation Scripts:**
- `Integration.sh` - Foundation branch operations
- `main.sh` - Main branch operations

## Data Flow

1. **Photo Upload Process:**
   - Frontend uploads file to backend
   - Backend stores file in Cloudflare R2
   - Backend stores metadata in Supabase
   - Frontend displays photo marker on map

2. **Photo Display Process:**
   - Frontend requests photo metadata from Supabase
   - Frontend renders markers on MapLibre map
   - User clicks marker to view photo details
   - Frontend fetches photo from R2 using stored URL

3. **Location-based Queries:**
   - Frontend sends location coordinates to backend
   - Backend queries Supabase for nearby photos
   - Backend returns photo metadata with R2 URLs
   - Frontend clusters and displays results on map

## External Services

### Supabase
- **Purpose:** Metadata storage and real-time subscriptions
- **Tables:** users, photos, locations
- **Features:** Authentication, real-time updates, row-level security

### Cloudflare R2
- **Purpose:** File storage for uploaded photos
- **Bucket:** skyer-platform-v0
- **Features:** S3-compatible API, global CDN, cost-effective storage

### MapLibre GL JS
- **Purpose:** Interactive map rendering
- **Features:** Vector tiles, custom markers, navigation controls
- **Data Source:** OpenStreetMap tiles

## Setup Instructions

### Prerequisites
- Node.js 18+ and npm
- Python 3.8+ and pip
- Git

### Quick Setup
```bash
# Run the automated setup script
./scripts/setup.sh

# Activate virtual environment
source venv/bin/activate

# Start backend (in one terminal)
cd server && flask run

# Start frontend (in another terminal)
cd client && npm start
```

### Manual Setup

#### Backend Setup
```bash
# Create and activate virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
cd server
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your Supabase and R2 credentials

# Initialize database
flask db upgrade

# Run backend
flask run
```

#### Frontend Setup
```bash
# Install dependencies
cd client
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API URLs

# Start development server
npm start
```

### Environment Configuration

#### Backend Environment Variables
```bash
# Flask Configuration
SECRET_KEY=your-secret-key-here
FLASK_ENV=development
DATABASE_URL=sqlite:///instance/database.db

# Supabase Configuration
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_KEY=your-service-key-here

# Cloudflare R2 Configuration
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
R2_BUCKET_NAME=skyer-platform-v0
R2_ENDPOINT_URL=https://your-account-id.r2.cloudflarestorage.com
R2_PUBLIC_URL=https://your-custom-domain.com
```

#### Frontend Environment Variables
```bash
# Supabase Configuration
REACT_APP_SUPABASE_URL=your-supabase-url
REACT_APP_SUPABASE_ANON_KEY=your-supabase-anon-key

# API Configuration
REACT_APP_API_URL=http://localhost:5000/api
```

## Development Workflow

### Git Branches
- `foundation` - Current development branch (Stage 1.x)
- `main` - Production-ready code

### Testing
```bash
# Backend tests
cd server
pytest

# Frontend tests
cd client
npm test

# Linting
cd client
npm run lint
npm run lint:fix
```

### Deployment
```bash
# Use deployment scripts
./scripts/deployment/deploy-staging.sh
./scripts/deployment/deploy-production.sh
```

## Security Considerations

- All credentials stored in environment variables
- No hardcoded secrets in source code
- CORS properly configured for frontend-backend communication
- Supabase row-level security for data access
- R2 bucket permissions configured for public read access

## Performance Considerations

- MapLibre vector tiles for efficient map rendering
- Photo thumbnails for faster loading
- Database indexing on location coordinates
- R2 CDN for global photo delivery
- React component optimization with proper hooks usage

## Future Enhancements

- Real-time photo updates via Supabase subscriptions
- Advanced clustering algorithms for dense photo areas
- Photo filtering and search capabilities
- User authentication and photo ownership
- Mobile-responsive design improvements
- Offline map caching
- Photo metadata editing
- Batch photo uploads
