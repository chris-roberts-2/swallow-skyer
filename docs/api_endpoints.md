# API Endpoints Documentation

## Overview

Swallow Skyer backend provides RESTful API endpoints for photo upload, retrieval, and metadata management. The API is built with Flask and integrates with Supabase for metadata storage and Cloudflare R2 for file storage.

**Base URL:** `http://localhost:5000` (development)

---

## Health & System Endpoints

### GET `/ping`

Simple health check endpoint.

**Response:**
```json
{
  "status": "ok"
}
```

**Status Codes:**
- `200 OK` - Service is running

---

### GET `/api/health`

Detailed health check with database status.

**Response:**
```json
{
  "status": "ok",
  "database": "healthy",
  "version": "1.0.0"
}
```

**Status Codes:**
- `200 OK` - Service and database are healthy
- Database status values: `"healthy"` or `"unhealthy"`

---

### GET `/api/test/supabase-r2`

Test endpoint to verify Supabase and R2 integration.

**Response:**
```json
{
  "status": "test_completed",
  "results": {
    "supabase": {
      "status": "connected",
      "details": "Client initialized successfully"
    },
    "r2": {
      "status": "connected",
      "details": "Client initialized for bucket: mock-bucket"
    },
    "integration": {
      "status": "success",
      "details": "Successfully stored metadata with R2 URL"
    }
  },
  "message": "Integration test completed - check individual service status"
}
```

---

## Photo Endpoints

### POST `/api/photos/upload`

Upload a photo to Cloudflare R2 and store metadata in Supabase.

**Content-Type:** `multipart/form-data`

**Request Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | Yes | Image file (JPEG, PNG, etc.) |
| `user_id` | String | No | User identifier |
| `latitude` | Float | Yes | Photo latitude coordinate |
| `longitude` | Float | Yes | Photo longitude coordinate |
| `timestamp` | String | No | ISO 8601 timestamp (e.g., "2024-01-01T00:00:00Z") |

**Example Request (cURL):**
```bash
curl -X POST http://localhost:5000/api/photos/upload \
  -F "file=@/path/to/photo.jpg" \
  -F "user_id=user-42" \
  -F "latitude=37.7749" \
  -F "longitude=-122.4194" \
  -F "timestamp=2024-01-01T00:00:00Z"
```

**Example Request (JavaScript):**
```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('user_id', 'user-42');
formData.append('latitude', '37.7749');
formData.append('longitude', '-122.4194');
formData.append('timestamp', '2024-01-01T00:00:00Z');

const response = await fetch('http://localhost:5000/api/photos/upload', {
  method: 'POST',
  body: formData
});

const data = await response.json();
```

**Success Response (201 Created):**
```json
{
  "status": "success",
  "photo_id": "550e8400-e29b-41d4-a716-446655440000",
  "url": "https://cdn.example.com/uploads/user-42/abc123_photo.jpg"
}
```

**Error Responses:**

**400 Bad Request - Missing file:**
```json
{
  "status": "error",
  "message": "Image file is required"
}
```

**400 Bad Request - Invalid file type:**
```json
{
  "status": "error",
  "message": "Invalid file type. Image required"
}
```

**400 Bad Request - Missing coordinates:**
```json
{
  "status": "error",
  "message": "latitude and longitude are required"
}
```

**413 Payload Too Large:**
```json
{
  "status": "error",
  "message": "File too large (max 20MB)"
}
```

**500 Internal Server Error:**
```json
{
  "status": "error",
  "message": "Storage not configured. Check R2 environment variables."
}
```

---

### GET `/api/photos`

Retrieve photos from Supabase with optional filtering and pagination.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | Integer | 50 | Maximum number of photos (max: 200) |
| `offset` | Integer | 0 | Number of photos to skip |
| `since` | String | - | ISO timestamp - filter photos taken after this date |
| `bbox` | String | - | Bounding box "lat_min,lng_min,lat_max,lng_max" |
| `user_id` | String | - | Filter by user ID |

**Example Request:**
```bash
# Get first 50 photos
curl http://localhost:5000/api/photos

# Get photos with pagination
curl http://localhost:5000/api/photos?limit=10&offset=20

# Get photos in bounding box
curl "http://localhost:5000/api/photos?bbox=37.7,-122.5,37.8,-122.4"

# Get photos for specific user
curl http://localhost:5000/api/photos?user_id=user-42

# Get recent photos since timestamp
curl "http://localhost:5000/api/photos?since=2024-01-01T00:00:00Z"
```

**Success Response (200 OK):**
```json
{
  "photos": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "user_id": "user-42",
      "r2_key": "uploads/user-42/abc123_photo.jpg",
      "url": "https://cdn.example.com/uploads/user-42/abc123_photo.jpg",
      "latitude": 37.7749,
      "longitude": -122.4194,
      "taken_at": "2024-01-01T00:00:00Z",
      "created_at": "2024-01-01T12:00:00Z"
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "user_id": "user-43",
      "r2_key": "uploads/user-43/def456_landscape.jpg",
      "url": "https://cdn.example.com/uploads/user-43/def456_landscape.jpg",
      "latitude": 34.0522,
      "longitude": -118.2437,
      "taken_at": "2024-01-02T00:00:00Z",
      "created_at": "2024-01-02T12:00:00Z"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 2
  }
}
```

**Error Response (400 Bad Request):**
```json
{
  "error": "Invalid bbox format. Expected lat_min,lng_min,lat_max,lng_max"
}
```

**Error Response (500 Internal Server Error):**
```json
{
  "error": "Database connection failed"
}
```

---

### POST `/api/photos`

Create a new photo record (metadata only, no file upload).

**Content-Type:** `application/json`

**Request Body:**
```json
{
  "filename": "photo.jpg",
  "caption": "Beautiful sunset",
  "latitude": 37.7749,
  "longitude": -122.4194,
  "altitude": 10.5,
  "user_id": 1,
  "file_url": "https://cdn.example.com/photo.jpg"
}
```

**Required Fields:**
- `filename` (string)
- `latitude` (float)
- `longitude` (float)

**Success Response (201 Created):**
```json
{
  "id": 1,
  "filename": "photo.jpg",
  "caption": "Beautiful sunset",
  "latitude": 37.7749,
  "longitude": -122.4194,
  "altitude": 10.5,
  "user_id": 1,
  "file_url": "https://cdn.example.com/photo.jpg",
  "created_at": "2024-01-01T12:00:00Z"
}
```

**Error Response (400 Bad Request):**
```json
{
  "error": "filename, latitude, and longitude are required"
}
```

---

## API v1 Endpoints (Supabase Integration)

### GET `/api/v1/photos/`

Get all photos with optional filtering - uses Supabase backend.

**Query Parameters:** Same as `/api/photos` endpoint

**Success Response (200 OK):**
```json
{
  "photos": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "user_id": "user-42",
      "r2_key": "uploads/user-42/abc123_photo.jpg",
      "url": "https://presigned.r2.example.com/...",
      "latitude": 37.7749,
      "longitude": -122.4194,
      "taken_at": "2024-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 1
  }
}
```

**Note:** URLs are automatically generated as presigned URLs from R2 if not explicitly stored.

---

## User Endpoints

### GET `/api/users`

Get all users.

**Success Response (200 OK):**
```json
[
  {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "profile_picture_url": "https://example.com/profile.jpg",
    "created_at": "2024-01-01T12:00:00Z"
  }
]
```

---

### POST `/api/users`

Create a new user.

**Content-Type:** `application/json`

**Request Body:**
```json
{
  "name": "Jane Smith",
  "email": "jane@example.com",
  "profile_picture_url": "https://example.com/jane.jpg"
}
```

**Required Fields:**
- `name` (string)

**Success Response (201 Created):**
```json
{
  "id": 2,
  "name": "Jane Smith",
  "email": "jane@example.com",
  "profile_picture_url": "https://example.com/jane.jpg",
  "created_at": "2024-01-01T12:00:00Z"
}
```

**Error Response (400 Bad Request):**
```json
{
  "error": "Name is required"
}
```

---

## Location Endpoints

### GET `/api/locations`

Get all locations.

**Success Response (200 OK):**
```json
[
  {
    "id": 1,
    "name": "Golden Gate Bridge",
    "latitude": 37.8199,
    "longitude": -122.4783,
    "description": "Famous suspension bridge",
    "created_at": "2024-01-01T12:00:00Z"
  }
]
```

---

### POST `/api/locations`

Create a new location record.

**Content-Type:** `application/json`

**Request Body:**
```json
{
  "name": "Alcatraz Island",
  "latitude": 37.8267,
  "longitude": -122.4230,
  "description": "Historic federal prison"
}
```

**Required Fields:**
- `name` (string)
- `latitude` (float)
- `longitude` (float)

**Success Response (201 Created):**
```json
{
  "id": 2,
  "name": "Alcatraz Island",
  "latitude": 37.8267,
  "longitude": -122.4230,
  "description": "Historic federal prison",
  "created_at": "2024-01-01T12:00:00Z"
}
```

---

## Error Response Format

All error responses follow a consistent format:

```json
{
  "error": "Error message describing what went wrong",
  "status": "error",
  "message": "Additional details (optional)"
}
```

**Common HTTP Status Codes:**
- `200 OK` - Request succeeded
- `201 Created` - Resource created successfully
- `400 Bad Request` - Invalid request parameters
- `404 Not Found` - Resource not found
- `413 Payload Too Large` - File size exceeds limit
- `500 Internal Server Error` - Server-side error
- `502 Bad Gateway` - External service error

---

## Rate Limiting

Currently, no rate limiting is implemented. This will be added in future versions.

---

## Authentication

Currently, no authentication is required. User-based authentication will be added in Stage 3.

---

## CORS Configuration

CORS is enabled for the frontend origin specified in `FRONTEND_ORIGIN` environment variable (default: `http://localhost:3000`).

---

## Testing Endpoints

All endpoints can be tested using:
- cURL (command line)
- Postman (GUI)
- Frontend integration tests (Jest)
- Backend integration tests (Pytest)

**Example Integration Test Flow:**
1. Upload photo via `/api/photos/upload`
2. Retrieve photos via `/api/photos`
3. Verify metadata matches uploaded data
4. Verify URL is accessible

See `server/tests/test_integration.py` for complete test examples.

