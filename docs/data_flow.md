# Data Flow Documentation

## Overview

This document describes the complete data flow for photo upload, storage, retrieval, and rendering in the Swallow Skyer platform. The system follows a decoupled architecture where images are stored in Cloudflare R2 and metadata is stored in Supabase.

---

## Photo Upload Flow

### Step 1: User Initiates Upload (Frontend)

**Component:** `PhotoUpload.js`

1. User selects an image file and provides metadata (caption, location)
2. Frontend validates file type and size client-side
3. Form data is prepared with:
   - File (binary)
   - User ID
   - Latitude/longitude coordinates
   - Optional timestamp

**Code Example:**
```javascript
const formData = new FormData();
formData.append('file', selectedFile);
formData.append('user_id', currentUserId);
formData.append('latitude', location.latitude);
formData.append('longitude', location.longitude);
formData.append('timestamp', new Date().toISOString());
```

---

### Step 2: Frontend Sends Upload Request

**Service:** `photoService.js` → `api.js`

1. Frontend makes POST request to `/api/photos/upload`
2. Request uses `multipart/form-data` encoding
3. File and metadata sent in single HTTP request

**Code Flow:**
```
PhotoUpload Component
    ↓
photoService.uploadPhoto()
    ↓
fetch('/api/photos/upload', { method: 'POST', body: formData })
    ↓
Flask Backend
```

---

### Step 3: Backend Receives and Validates Request

**Handler:** `app/routes.py` → `upload_photo()`

1. **File validation:**
   - Check file exists in request
   - Verify MIME type starts with `image/`
   - Check file size < 20MB (configurable)

2. **Metadata validation:**
   - Verify latitude and longitude present
   - Parse and validate coordinate values (float)
   - Extract optional user_id and timestamp

**Validation Code:**
```python
# File presence
if not file or not getattr(file, 'filename', None):
    return {"error": "Image file is required"}, 400

# MIME type
if not mimetype.startswith('image/'):
    return {"error": "Invalid file type. Image required"}, 400

# Coordinates
if latitude is None or longitude is None:
    return {"error": "latitude and longitude are required"}, 400
```

---

### Step 4: Upload Image to Cloudflare R2

**Service:** `app/services/storage/r2_client.py`

1. **Generate unique storage key:**
   ```python
   safe_name = secure_filename(file.filename)
   key = f"uploads/{user_id or 'anonymous'}/{uuid4().hex}_{safe_name}"
   # Example: uploads/user-42/abc123def456_photo.jpg
   ```

2. **Upload to R2 using boto3:**
   ```python
   uploaded = r2_client.upload_file(file.stream, key)
   # Uses boto3 S3 client with R2 endpoint
   ```

3. **Generate public URL:**
   ```python
   file_url = r2_client.get_file_url(key)
   # Returns: https://cdn.example.com/uploads/user-42/abc123_photo.jpg
   ```

**R2 Storage Structure:**
```
R2 Bucket: skyer-platform-v0/
├── uploads/
│   ├── user-42/
│   │   ├── abc123def456_photo.jpg
│   │   └── def789ghi012_landscape.jpg
│   ├── user-43/
│   │   └── ghi345jkl678_sunset.jpg
│   └── anonymous/
│       └── jkl901mno234_untitled.jpg
```

---

### Step 5: Store Metadata in Supabase

**Service:** `app/services/storage/supabase_client.py`

1. **Prepare metadata object:**
   ```python
   photo_data = {
       "user_id": user_id,
       "r2_key": key,                    # Path in R2
       "url": file_url,                  # Public/presigned URL
       "latitude": lat_val,
       "longitude": lon_val,
       "taken_at": timestamp             # Optional
   }
   ```

2. **Insert into Supabase photos table:**
   ```python
   stored = supabase_client.store_photo_metadata(photo_data)
   # Returns record with auto-generated UUID
   ```

**Supabase Table Schema:**
```sql
CREATE TABLE photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT,
    r2_key TEXT NOT NULL,
    url TEXT,
    latitude FLOAT NOT NULL,
    longitude FLOAT NOT NULL,
    taken_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### Step 6: Backend Returns Success Response

**Response to Frontend:**
```json
{
  "status": "success",
  "photo_id": "550e8400-e29b-41d4-a716-446655440000",
  "url": "https://cdn.example.com/uploads/user-42/abc123_photo.jpg"
}
```

**Frontend handling:**
```javascript
const result = await photoService.uploadPhoto(formData);
if (result.status === 'success') {
    console.log('Photo uploaded:', result.photo_id);
    // Refresh map to show new photo
    refreshPhotos();
}
```

---

## Photo Retrieval Flow

### Step 1: Frontend Requests Photos

**Trigger Points:**
- Initial map load
- Map pan/zoom (fetch photos in viewport)
- Manual refresh
- After successful upload

**API Call:**
```javascript
// Fetch all recent photos
const response = await fetchPhotos({ limit: 50 });

// Fetch photos in bounding box (map viewport)
const bounds = map.getBounds();
const response = await fetchPhotosInBounds(
    bounds.getSouth(),
    bounds.getWest(),
    bounds.getNorth(),
    bounds.getEast(),
    100
);
```

---

### Step 2: Backend Queries Supabase

**Handler:** `app/routes.py` → `get_photos()`

1. **Parse query parameters:**
   ```python
   limit = request.args.get('limit', 50, type=int)
   offset = request.args.get('offset', 0, type=int)
   bbox = request.args.get('bbox', type=str)  # "lat_min,lng_min,lat_max,lng_max"
   user_id = request.args.get('user_id', type=str)
   since = request.args.get('since', type=str)
   ```

2. **Query Supabase with filters:**
   ```python
   result = supabase_client.get_photos(
       limit=limit,
       offset=offset,
       bbox=bbox,
       user_id=user_id,
       since=since
   )
   ```

**Supabase Query Logic:**
```python
# Start with base query
query = client.table("photos").select("*", count="exact")

# Apply filters
if user_id:
    query = query.eq("user_id", user_id)
if since:
    query = query.gte("taken_at", since)
if bbox:
    lat_min, lng_min, lat_max, lng_max = parse_bbox(bbox)
    query = (query
        .gte("latitude", lat_min).lte("latitude", lat_max)
        .gte("longitude", lng_min).lte("longitude", lng_max))

# Order and paginate
query = query.order("taken_at", desc=True)
query = query.limit(limit).offset(offset)
```

---

### Step 3: Process Photo URLs

**Handler:** `app/routes.py` → URL processing loop

For each photo returned from Supabase:

1. **Check if URL exists:**
   ```python
   if photo.get('url') and photo['url'].strip():
       # Use stored URL
       processed.append(photo)
   ```

2. **Generate presigned URL if needed:**
   ```python
   else:
       r2_key = photo.get('r2_key')
       presigned_url = r2_client.generate_presigned_url(r2_key, expires_in=600)
       photo['url'] = presigned_url
       processed.append(photo)
   ```

**Presigned URL Benefits:**
- Time-limited access (default 10 minutes)
- No public bucket required
- Secure photo access

---

### Step 4: Backend Returns Photo List

**Response:**
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
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 1
  }
}
```

---

## Map Rendering Flow

### Step 1: Frontend Receives Photo Data

**Component:** `PhotoMapFetchExample.jsx`

1. Parse response and extract photos array
2. Validate each photo has required fields:
   - `id`
   - `latitude` and `longitude`
   - `url`
   - `taken_at`

**State Update:**
```javascript
const loadPhotos = async () => {
    const response = await fetchPhotos({ limit: 50 });
    setPhotos(response.photos || []);
};
```

---

### Step 2: Create Map Markers

**Library:** MapLibre GL JS

For each photo:

1. **Create marker element:**
   ```javascript
   const el = document.createElement('div');
   el.className = 'photo-marker';
   el.style.width = '30px';
   el.style.height = '30px';
   el.style.borderRadius = '50%';
   el.style.backgroundColor = '#007cbf';
   ```

2. **Create popup with photo preview:**
   ```javascript
   const popup = new maplibregl.Popup({ offset: 25 }).setHTML(`
       <div>
           <img src="${photo.url}" alt="Photo ${photo.id}" />
           <p>Taken: ${new Date(photo.taken_at).toLocaleDateString()}</p>
           <p>${photo.latitude.toFixed(5)}, ${photo.longitude.toFixed(5)}</p>
       </div>
   `);
   ```

3. **Add marker to map:**
   ```javascript
   const marker = new maplibregl.Marker({ element: el })
       .setLngLat([photo.longitude, photo.latitude])
       .setPopup(popup)
       .addTo(map);
   ```

---

### Step 3: Display Photos on Map

**Visual Output:**
```
┌─────────────────────────────────────────┐
│  Map Container (MapLibre)               │
│                                         │
│      🔵 ← Photo Marker (lat, lng)      │
│                                         │
│            🔵 ← Another photo          │
│                                         │
│  🔵 ← Click to see popup               │
│                                         │
└─────────────────────────────────────────┘
```

**Popup on Click:**
```
┌───────────────────┐
│ Photo Preview     │
│ ┌───────────────┐ │
│ │   [Image]     │ │
│ └───────────────┘ │
│ Taken: Jan 1, 2024│
│ 37.77490, -122.42 │
└───────────────────┘
```

---

### Step 4: Map Interaction

**User Actions:**

1. **Click marker:** Opens popup with photo preview and metadata
2. **Pan map:** Optionally fetch photos in new viewport
3. **Zoom in/out:** Cluster markers for better performance (planned)

**Dynamic Updates:**
```javascript
map.on('moveend', () => {
    const bounds = map.getBounds();
    fetchPhotosInBounds(
        bounds.getSouth(), bounds.getWest(),
        bounds.getNorth(), bounds.getEast()
    ).then(photos => updateMarkers(photos));
});
```

---

## Complete Flow Diagram

```
┌─────────────┐
│   USER      │
│  (Browser)  │
└──────┬──────┘
       │ 1. Select photo + location
       │
       ▼
┌─────────────────────┐
│  PhotoUpload.js     │
│  React Component    │
└──────┬──────────────┘
       │ 2. FormData POST
       │
       ▼
┌──────────────────────────────────────────┐
│  Flask Backend                           │
│  /api/photos/upload                      │
│                                          │
│  ┌────────────┐        ┌──────────────┐ │
│  │ Validate   │───────▶│  R2 Upload   │ │
│  │ Request    │        │  (boto3)     │ │
│  └────────────┘        └──────┬───────┘ │
│                               │          │
│                               ▼          │
│  ┌─────────────────────────────────┐    │
│  │  Supabase Metadata Insert       │    │
│  │  (photo_id, r2_key, url,        │    │
│  │   lat, lng, timestamp)          │    │
│  └─────────────────┬───────────────┘    │
│                    │                     │
└────────────────────┼─────────────────────┘
                     │ 3. Success response
                     │    { photo_id, url }
                     ▼
┌──────────────────────────────┐
│  Frontend State Update       │
│  setPhotos([...photos, new]) │
└──────────┬───────────────────┘
           │ 4. Fetch all photos
           │
           ▼
┌────────────────────────────────┐
│  GET /api/photos               │
│  ?limit=50&bbox=...            │
└──────────┬─────────────────────┘
           │
           ▼
┌────────────────────────────────┐
│  Supabase Query                │
│  SELECT * FROM photos          │
│  WHERE lat BETWEEN ...         │
│  ORDER BY taken_at DESC        │
└──────────┬─────────────────────┘
           │ 5. Photos array + metadata
           │
           ▼
┌────────────────────────────────┐
│  MapLibre Rendering            │
│  - Create markers              │
│  - Position at coordinates     │
│  - Attach popups               │
│  - Fit bounds to markers       │
└────────────────────────────────┘
```

---

## Error Handling Flow

### Upload Errors

**Client-side validation:**
```javascript
if (!file) {
    alert('Please select a file');
    return;
}
if (!location.latitude || !location.longitude) {
    alert('Location required');
    return;
}
```

**Server-side errors:**
```python
# File too large
if content_length > max_bytes:
    return {"error": "File too large (max 20MB)"}, 413

# R2 upload fails
if not uploaded:
    return {"error": "Failed to upload to storage"}, 502

# Supabase insert fails
if not stored:
    return {"error": "Could not store metadata in Supabase"}, 502
```

**Frontend error handling:**
```javascript
try {
    const result = await photoService.uploadPhoto(formData);
    if (result.status === 'success') {
        showSuccess('Photo uploaded!');
    }
} catch (error) {
    showError(`Upload failed: ${error.message}`);
}
```

---

### Retrieval Errors

**Network errors:**
```javascript
try {
    const response = await fetchPhotos();
} catch (error) {
    setError('Failed to load photos. Please try again.');
    console.error(error);
}
```

**Empty results:**
```javascript
if (photos.length === 0) {
    showMessage('No photos found in this area');
}
```

---

## Performance Optimizations

### Current Optimizations

1. **Pagination:** Limit photos per request (default 50, max 200)
2. **Bounding box filtering:** Only fetch photos in visible map area
3. **Presigned URL caching:** URLs valid for 10 minutes
4. **MapLibre vector tiles:** Efficient map rendering

### Planned Optimizations

1. **Thumbnail generation:** Store/serve smaller preview images
2. **Photo clustering:** Combine nearby markers at low zoom
3. **Lazy loading:** Load photos as user scrolls/pans
4. **Image compression:** Reduce file size on upload
5. **CDN caching:** Cache R2 responses at edge

---

## Security Considerations

### Upload Security

- File type validation (MIME type check)
- File size limits (20MB default)
- Secure filename generation (UUID + sanitization)
- User-scoped storage paths

### Access Security

- Presigned URLs with expiration (10 minutes)
- Supabase row-level security (planned)
- CORS restrictions for backend API
- Environment variable isolation for credentials

---

## Testing Data Flow

See `server/tests/test_integration.py` and `client/src/__tests__/integration/PhotoFlow.test.js` for complete integration tests covering:

1. Upload → R2 storage → Supabase insert
2. Query → Supabase fetch → URL generation
3. Frontend rendering → marker creation → popup display

**Test Flow:**
```
Mock Upload → Verify R2 called → Verify Supabase called
    ↓
Mock Fetch → Verify query params → Verify response format
    ↓
Mock Map Render → Verify markers created → Verify coordinates
```

