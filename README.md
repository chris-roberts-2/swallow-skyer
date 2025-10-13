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

### Prerequisites

- Node.js 18+
- Python 3.8+
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd swallow-skyer
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Install dependencies**
   ```bash
   # Frontend
   cd client
   npm install
   
   # Backend
   cd ../server
   pip install -r requirements.txt
   ```

4. **Set up the database**
   ```bash
   cd server
   flask db init
   flask db migrate -m "Initial migration"
   flask db upgrade
   ```

5. **Start the development servers**
   ```bash
   # Terminal 1 - Backend
   cd server
   python app.py
   
   # Terminal 2 - Frontend
   cd client
   npm start
   ```

6. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5000

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

# Backend tests
cd server
python -m pytest
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
