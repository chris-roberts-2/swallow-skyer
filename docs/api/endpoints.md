# API Endpoints Documentation

## Base URL
```
Development: http://localhost:5000/api
Production: https://your-domain.com/api
```

## Authentication Endpoints

### POST /auth/login
Login user with credentials.

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "user": {
    "id": "string",
    "username": "string",
    "email": "string"
  },
  "token": "string"
}
```

### POST /auth/register
Register new user.

**Request Body:**
```json
{
  "username": "string",
  "email": "string",
  "password": "string"
}
```

## Photo Endpoints

### GET /photos
Get all photos with optional filtering.

**Query Parameters:**
- `page` (int): Page number (default: 1)
- `per_page` (int): Items per page (default: 20)
- `lat` (float): Latitude filter
- `lng` (float): Longitude filter
- `radius` (float): Search radius (default: 0.01)

**Response:**
```json
{
  "photos": [
    {
      "id": "string",
      "filename": "string",
      "caption": "string",
      "latitude": 0.0,
      "longitude": 0.0,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 100,
  "page": 1,
  "per_page": 20,
  "pages": 5
}
```

### POST /photos/upload
Upload a new photo.

**Request (multipart/form-data):**
- `file`: Image file
- `caption`: Photo caption (optional)
- `latitude`: GPS latitude
- `longitude`: GPS longitude

**Response:**
```json
{
  "id": "string",
  "filename": "string",
  "file_path": "string",
  "thumbnail_path": "string",
  "caption": "string",
  "latitude": 0.0,
  "longitude": 0.0,
  "created_at": "2024-01-01T00:00:00Z"
}
```

### GET /photos/location
Get photos by location coordinates.

**Query Parameters:**
- `lat` (float): Latitude (required)
- `lng` (float): Longitude (required)
- `radius` (float): Search radius (default: 0.001)

## Location Endpoints

### GET /locations
Get all locations with photo counts.

**Response:**
```json
[
  {
    "latitude": 0.0,
    "longitude": 0.0,
    "photo_count": 5
  }
]
```

### GET /locations/nearby
Get locations near given coordinates.

**Query Parameters:**
- `lat` (float): Latitude (required)
- `lng` (float): Longitude (required)
- `radius` (float): Search radius (default: 0.01)

## Error Responses

All endpoints may return error responses in the following format:

```json
{
  "error": "Error message description"
}
```

**HTTP Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `404` - Not Found
- `500` - Internal Server Error
