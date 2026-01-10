# API Version 1 Routes

## Purpose
This directory contains the **versioned v1 HTTP API** served by the Flask backend under `/api/v1/...`. It is the primary API contract used by the current frontend.

## Versioning Strategy
- **v1 API**: Modules under `server/app/api_routes/v1/` registered with URL prefixes like `/api/v1/photos`
- **Legacy endpoints**: Some older `/api/...` routes exist for compatibility (e.g., upload), while older listing endpoints may be disabled

## URL Structure
```
/api/v1/photos/          # Versioned photo endpoints
```

## Benefits
- **Backward Compatibility**: Existing clients continue to work
- **Gradual Migration**: Clients can migrate to new versions at their own pace
- **Feature Flags**: Different features in different versions
- **Deprecation Path**: Clear deprecation timeline for old versions

## Implementation
- v1 endpoints are protected by JWT middleware and enforce project-level roles where required.
- Photo responses typically include `version: "v1"` and normalized photo fields (including R2 URLs when available).

## Usage
```python
# v1 routes are registered in the app factory with url_prefixes such as:
# app.register_blueprint(photos_v1_bp, url_prefix="/api/v1/photos")
```
