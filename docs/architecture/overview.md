# Architecture Overview

## System Architecture

Swallow Skyer follows a modern full-stack architecture with clear separation of concerns:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React Client  │    │   Flask API     │    │   Supabase      │
│                 │    │                 │    │                 │
│ • MapLibre GL   │◄──►│ • REST API      │◄──►│ • PostgreSQL    │
│ • Photo Upload  │    │ • File Storage  │    │ • File Storage  │
│ • Location UI   │    │ • Auth Service  │    │ • Real-time     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Frontend Architecture

### Component Hierarchy
```
App
├── MapPage
│   ├── MapContainer
│   │   ├── MapMarker
│   │   └── PhotoStack
│   └── PhotoUpload
├── PhotoPage
│   ├── PhotoGallery
│   └── PhotoCard
└── Layout
    ├── Header
    ├── Sidebar
    └── Footer
```

### State Management
- **React Context** for global state
- **Local State** for component-specific data
- **Custom Hooks** for reusable logic

## Backend Architecture

### Layered Architecture
```
Routes (API Layer)
    ↓
Services (Business Logic)
    ↓
Models (Data Layer)
    ↓
Database (Storage)
```

### Key Components
- **Models**: SQLAlchemy ORM models
- **Services**: Business logic and file processing
- **Routes**: REST API endpoints
- **Utils**: Helper functions and validators

## Data Flow

1. **Photo Upload**:
   User → React → Flask API → File Processing → Database → Supabase Storage

2. **Photo Retrieval**:
   Database → Flask API → React → Map Display

3. **Location Search**:
   Coordinates → Flask API → Database Query → Filtered Results → React

## Security Considerations

- **File Upload Validation**: Type and size checking
- **CORS Configuration**: Restricted origins
- **Input Validation**: Server-side validation
- **Authentication**: JWT tokens (future implementation)
