# API Version 1 Routes

## Purpose
This directory contains version 1 of the API routes for backward compatibility and future API evolution.

## Versioning Strategy
- **Current API**: Routes in `/server/app/routes/` (latest version)
- **v1 API**: Routes in `/server/app/routes/v1/` (stable version)
- **Future versions**: v2, v3, etc. as needed

## URL Structure
```
/api/v1/photos/          # Versioned photo endpoints
/api/v1/locations/       # Versioned location endpoints
/api/v1/auth/            # Versioned auth endpoints
```

## Benefits
- **Backward Compatibility**: Existing clients continue to work
- **Gradual Migration**: Clients can migrate to new versions at their own pace
- **Feature Flags**: Different features in different versions
- **Deprecation Path**: Clear deprecation timeline for old versions

## Implementation
- All v1 routes include `version: 'v1'` in responses
- Error responses include version information
- Maintains same functionality as current routes
- Can be extended with additional v1-specific features

## Usage
```python
# Register v1 routes
from app.routes.v1 import photos as photos_v1
app.register_blueprint(photos_v1.bp, url_prefix='/api/v1/photos')
```
