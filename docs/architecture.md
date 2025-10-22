# Swallow Skyer - Architecture Documentation

## Project Overview

Swallow Skyer is a web application for storing and managing geotagged photos on an interactive map. The project uses a modern full-stack architecture with React frontend and Flask backend, integrated with Supabase for metadata storage and Cloudflare R2 for file storage.

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (React)                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │  PhotoUpload     │  │  MapContainer    │  │  PhotoCard    │ │
│  │  Component       │  │  (MapLibre GL)   │  │  Component    │ │
│  └────────┬─────────┘  └────────┬─────────┘  └───────┬───────┘ │
│           │                     │                     │         │
│           └─────────────────────┼─────────────────────┘         │
│                                 │                               │
│                        ┌────────▼────────┐                      │
│                        │  API Services   │                      │
│                        │  (fetch/axios)  │                      │
│                        └────────┬────────┘                      │
└─────────────────────────────────┼───────────────────────────────┘
                                  │
                                  │ HTTP/HTTPS
                                  │
┌─────────────────────────────────▼───────────────────────────────┐
│                       BACKEND (Flask)                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                     API Routes                            │  │
│  │  • /api/photos/upload (POST)                             │  │
│  │  • /api/photos (GET)                                     │  │
│  │  • /api/v1/photos/* (Blueprint)                          │  │
│  └───────┬──────────────────────────────────┬────────────────┘  │
│          │                                  │                   │
│  ┌───────▼────────┐              ┌──────────▼────────┐         │
│  │  R2 Client     │              │  Supabase Client  │         │
│  │  (boto3)       │              │  (supabase-py)    │         │
│  └───────┬────────┘              └──────────┬────────┘         │
└──────────┼───────────────────────────────────┼──────────────────┘
           │                                   │
           │                                   │
┌──────────▼────────┐              ┌───────────▼───────┐
│  Cloudflare R2    │              │    Supabase       │
│  ┌─────────────┐  │              │  ┌─────────────┐  │
│  │   Photos    │  │              │  │   photos    │  │
│  │   Bucket    │  │              │  │   table     │  │
│  │  (Binary)   │  │              │  │ (Metadata)  │  │
│  └─────────────┘  │              │  └─────────────┘  │
│                   │              │                   │
│  Storage: Images  │              │  Storage: JSON    │
│  Access: Presigned│              │  Access: REST API │
│         URLs      │              │                   │
└───────────────────┘              └───────────────────┘
```

## Project Structure

```
swallow-skyer-5/
├── client/                 # React frontend application
│   ├── public/            # Static assets
│   ├── src/
│   │   ├── components/    # React components
│   │   │   ├── map/      # Map-related components
│   │   │   ├── photo/    # Photo components
│   │   │   └── common/   # Shared components
│   │   ├── services/     # API integration services
│   │   ├── api/          # Backend API calls
│   │   ├── utils/        # Helper functions
│   │   └── __tests__/    # Jest tests
│   └── package.json
├── server/                # Flask backend application
│   ├── app/
│   │   ├── __init__.py   # Flask factory
│   │   ├── models.py     # SQLAlchemy models
│   │   ├── routes.py     # Main API routes
│   │   ├── api_routes/   # Blueprint routes
│   │   │   └── v1/       # API v1 routes
│   │   ├── services/     # Business logic
│   │   │   └── storage/  # R2 & Supabase clients
│   │   └── utils/        # Validators, helpers
│   ├── tests/            # Pytest tests
│   │   ├── integration/  # Integration tests
│   │   └── unit/         # Unit tests
│   └── requirements.txt
├── scripts/              # Development scripts
│   ├── test_all.sh      # Combined test runner
│   └── setup.sh         # Project setup
├── docs/                # Documentation
└── .env.test           # Test environment config
```

## Architecture Components

### Frontend (`client/`)

**Technology Stack:**
- React 19+ with functional components and hooks
- MapLibre GL JS for interactive maps
- React Router for navigation
- Jest + React Testing Library for testing
- ESLint/Prettier for code formatting

**Key Components:**
- `App.js` - Main application with MapLibre integration
- `components/map/` - Map-related components
  - `MapContainer.js` - Map wrapper component
  - `MapMarker.js` - Individual photo markers
  - `PhotoStack.js` - Photo collection display
  - `nodes/` - Node management for clustered photos
- `components/photo/` - Photo-related components
  - `PhotoCard.js` - Individual photo display
  - `PhotoUpload.js` - Photo upload interface
- `services/` - API integration services
  - `photoService.js` - Photo operations
  - `api.js` - Base API client
- `api/photos.js` - Photo fetching utilities

### Backend (`server/`)

**Technology Stack:**
- Flask 3+ with application factory pattern
- SQLAlchemy for local database ORM
- Flask-CORS for cross-origin requests
- Supabase Python client for metadata operations
- Boto3 for Cloudflare R2 file storage
- Pytest for testing with mocking

**Key Components:**
- `app/__init__.py` - Flask application factory
- `app/models.py` - Database models (User, Photo, Location)
- `app/routes.py` - Main API endpoints
- `app/api_routes/v1/photos.py` - V1 photo endpoints with Supabase
- `app/services/storage/` - External service integrations
  - `supabase_client.py` - Supabase metadata CRUD
  - `r2_client.py` - R2 file operations (upload, URL generation)
- `tests/test_integration.py` - End-to-end integration tests

## External Services

### Supabase
- **Purpose:** Photo metadata storage and real-time capabilities
- **Tables:** `photos`, `users`, `locations`
- **Operations:** Insert, query, filter by location/user/time
- **Features:** Real-time subscriptions, REST API, authentication

### Cloudflare R2
- **Purpose:** Photo file storage (images)
- **Bucket:** Configured via `R2_BUCKET_NAME`
- **Operations:** Upload via boto3, presigned URL generation
- **Features:** S3-compatible API, global CDN, cost-effective

### MapLibre GL JS
- **Purpose:** Interactive map rendering
- **Features:** Vector tiles, custom markers, navigation controls
- **Data Source:** OpenStreetMap demo tiles

## Data Models

### Photo Metadata (Supabase)
```typescript
{
  id: uuid,
  user_id: string,
  r2_key: string,           // Path in R2 bucket
  url: string,              // Public or presigned URL
  latitude: float,
  longitude: float,
  taken_at: timestamp,
  created_at: timestamp
}
```

### Photo Model (SQLAlchemy - Local)
```python
Photo:
  - id: Integer (primary key)
  - filename: String
  - caption: String
  - latitude: Float
  - longitude: Float
  - user_id: Integer (foreign key)
  - created_at: DateTime
```

## Security Considerations

- All credentials stored in environment variables (`.env`, `.env.test`)
- No hardcoded secrets in source code
- CORS properly configured for frontend-backend communication
- Supabase row-level security for data access control
- R2 presigned URLs for time-limited file access
- Multipart file upload validation (type, size)

## Performance Considerations

- MapLibre vector tiles for efficient map rendering
- Photo thumbnails for faster loading (planned)
- Supabase filtering/pagination for large datasets
- R2 CDN for global photo delivery
- React component optimization with proper hooks usage
- Database indexing on latitude/longitude (planned)

## Testing Strategy

- **Backend:** Pytest with mocked R2 and Supabase clients
- **Frontend:** Jest + React Testing Library with mocked fetch/MapLibre
- **Integration:** End-to-end tests covering upload → storage → retrieval
- **Mocking:** All external services mocked to avoid real credentials

## Development Workflow

### Git Branches
- `Integration` - Current integration development branch
- `main` - Production-ready code

### Running Tests
```bash
# All tests
./scripts/test_all.sh

# Backend only
cd server && pytest

# Frontend only
cd client && npm test -- --watchAll=false
```

### Code Formatting
```bash
# Backend (Black)
cd server && black app/ tests/

# Frontend (Prettier)
cd client && npm run format
```

## Future Enhancements

- Real-time photo updates via Supabase subscriptions
- Advanced clustering algorithms for dense photo areas
- Photo filtering and search capabilities
- User authentication and photo ownership
- Mobile-responsive design improvements
- Offline map caching
- Photo metadata editing
- Batch photo uploads
- Thumbnail generation and storage
