# Swallow Skyer

A platform for storing and managing photos on a map based on their GPS coordinates. Users can upload photos, view them on an interactive map, and stack multiple photos at the same location.

## Features

- 📍 **Map-based Photo Storage**: Upload photos with GPS coordinates
- 🗺️ **Interactive Map**: Browse photos using MapLibre GL
- 📚 **Photo Stacking**: Multiple photos at the same location
- 🔍 **Location-based Search**: Find photos by location
- 📱 **Responsive Design**: Works on desktop and mobile
- 🔐 **User Authentication**: Secure user accounts
- ☁️ **Cloud Storage**: Supabase integration for scalable storage

## Tech Stack

### Frontend
- **React 19** - UI framework
- **MapLibre GL** - Interactive mapping
- **Supabase** - Backend-as-a-Service

### Backend
- **Flask** - Python web framework
- **SQLAlchemy** - ORM
- **Pillow** - Image processing

### Database
- **SQLite** (development)
- **PostgreSQL** (production via Supabase)

## Project Structure

```
swallow-skyer/
├── client/                    # React frontend
│   ├── public/               # Static assets
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   │   ├── common/       # Common components
│   │   │   ├── layout/       # Layout components
│   │   │   ├── map/          # Map-related components
│   │   │   └── photo/        # Photo-related components
│   │   ├── pages/            # Page components
│   │   ├── services/         # API services
│   │   ├── hooks/            # Custom React hooks
│   │   ├── context/          # React Context providers
│   │   ├── utils/            # Utility functions
│   │   └── assets/           # Static assets (fonts, icons, images)
│   ├── .env.example          # Frontend environment template
│   └── package.json
├── server/                   # Flask backend
│   ├── app/
│   │   ├── models/           # Database models
│   │   ├── routes/           # API routes
│   │   │   └── v1/           # API versioning
│   │   ├── services/         # Business logic
│   │   │   └── storage/      # Storage services (Supabase, R2)
│   │   ├── utils/            # Utility functions
│   │   ├── config/           # Configuration files
│   │   └── middleware/       # Custom middleware
│   ├── tests/                # Test suite
│   │   ├── unit/             # Unit tests
│   │   ├── integration/      # Integration tests
│   │   └── fixtures/         # Test fixtures
│   ├── migrations/           # Database migrations
│   ├── uploads/              # File upload directory
│   ├── instance/             # Instance-specific files
│   ├── .env.example          # Backend environment template
│   └── app.py                # Application entry point
├── shared/                   # Shared utilities
│   ├── constants/            # Shared constants
│   ├── types/                # TypeScript definitions
│   ├── schemas/              # Data validation schemas
│   └── validation/           # Validation utilities
├── docs/                     # Documentation
│   ├── api/                  # API documentation
│   ├── architecture/         # System architecture
│   ├── deployment/           # Deployment guides
│   └── user-guide/           # User documentation
├── scripts/                  # Automation scripts
│   ├── deployment/           # Deployment scripts
│   └── development/          # Development scripts
├── docker-compose.yml        # Docker configuration
├── requirements.txt          # Python dependencies
└── README.md                 # Project overview
```

## Getting Started

### Quick Setup (Recommended)

Use the automated setup script for the easiest installation:

```bash
# Clone the repository
git clone <repository-url>
cd swallow-skyer

# Run the setup script
./scripts/setup.sh

# Configure your environment files with real credentials
# Edit .env, server/.env, and client/.env files

# Start the development servers
source venv/bin/activate && cd server && flask run  # Terminal 1
cd client && npm start                               # Terminal 2
```

### Manual Setup

If you prefer manual setup or need to troubleshoot:

#### Prerequisites
- Node.js 18+
- Python 3.8+
- Git

#### Installation Steps

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd swallow-skyer
   ```

2. **Set up Python virtual environment**
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **Install backend dependencies**
   ```bash
   cd server
   pip install -r requirements.txt
   ```

4. **Install frontend dependencies**
   ```bash
   cd ../client
   npm install
   ```

5. **Configure environment variables**
   ```bash
   # Copy example files
   cp .env.example .env
   cp server/.env.example server/.env
   cp client/.env.example client/.env
   
   # Edit the files with your actual credentials:
   # - Supabase URL and service key
   # - Cloudflare R2 credentials
   # - API URLs
   ```

6. **Initialize database**
   ```bash
   cd server
   flask db init
   flask db migrate -m "Initial migration"
   flask db upgrade
   ```

7. **Start the development servers**
   ```bash
   # Terminal 1 - Backend
   source venv/bin/activate
   cd server
   flask run
   
   # Terminal 2 - Frontend
   cd client
   npm start
   ```

8. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5000

## Project Status

**Current Stage: 1.7 - Documentation & Setup Scripts**

### Development Branches
- `foundation` - Current development branch (Stage 1.x)
- `main` - Production-ready code

### Completed Features
- ✅ **Stage 1.1-1.4**: Foundational project structure and architecture
- ✅ **Stage 1.5**: Supabase & Cloudflare R2 integration
- ✅ **Stage 1.6**: Basic MapLibre integration in frontend
- ✅ **Stage 1.7**: Documentation & setup scripts

### Architecture Overview
- **Frontend**: React 19 + MapLibre GL JS with interactive map and photo markers
- **Backend**: Flask 3+ with Supabase metadata storage and R2 file storage
- **Database**: SQLite (dev) / PostgreSQL via Supabase (prod)
- **Storage**: Cloudflare R2 for photo files
- **Maps**: OpenStreetMap tiles via MapLibre GL

### Key Components
- **Map Integration**: Interactive MapLibre map with navigation controls
- **Photo Markers**: Clickable markers with photo stack display
- **API Integration**: RESTful API with health checks and integration tests
- **Environment Setup**: Automated setup script with environment configuration
- **Code Quality**: ESLint/Prettier formatting, comprehensive testing setup

## API Documentation

### Photos
- `GET /api/photos` - Get all photos
- `POST /api/photos/upload` - Upload a new photo
- `GET /api/photos/location` - Get photos by location
- `GET /api/photos/:id` - Get specific photo
- `PUT /api/photos/:id` - Update photo
- `DELETE /api/photos/:id` - Delete photo

### Locations
- `GET /api/locations` - Get all locations
- `GET /api/locations/nearby` - Get nearby locations

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/auth/logout` - User logout

## Development

### Code Style
- **Frontend**: ESLint + Prettier
- **Backend**: Black + isort
- **Naming**: camelCase for variables, PascalCase for components

### Testing
```bash
# Frontend tests
cd client
npm test

# Frontend linting
npm run lint
npm run lint:fix

# Backend tests
cd server
pytest

# Backend integration test
curl http://localhost:5000/api/test/supabase-r2

# Health check
curl http://localhost:5000/api/health
```

### Database Migrations
```bash
cd server
flask db migrate -m "Description of changes"
flask db upgrade
```

## Deployment

### Environment Setup
1. Set production environment variables
2. Configure database connection
3. Set up file storage (Supabase or AWS S3)
4. Configure CORS for production domain

### Build for Production
```bash
# Frontend
cd client
npm run build

# Backend
cd server
# Deploy using your preferred method (Docker, Heroku, etc.)
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support, email support@swallowskyer.com or create an issue in the repository.
