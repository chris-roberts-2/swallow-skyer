# Swallow Skyer Documentation

## Overview

Complete documentation for the Swallow Skyer photo mapping platform, covering architecture, API endpoints, data flow, testing, and setup instructions.

---

## Documentation Index

### 📐 [Architecture](./architecture.md)
**System design and component overview**
- System architecture diagram
- Technology stack (React, Flask, Supabase, R2)
- Project structure
- Frontend and backend components
- External service integrations
- Data models and security considerations

### 🔌 [API Endpoints](./api_endpoints.md)
**Complete API reference with examples**
- Health check endpoints
- Photo upload and retrieval
- User and location management
- Request/response formats
- Error handling
- Testing examples (cURL, JavaScript)

### 🔄 [Data Flow](./data_flow.md)
**End-to-end data flow diagrams**
- Photo upload process (Frontend → Backend → R2 → Supabase)
- Photo retrieval and display
- Map rendering workflow
- Error handling flows
- Performance optimizations
- Security measures

### 🧪 [Testing Coverage](./testing_coverage.md)
**Testing strategy and test execution**
- Test pyramid and principles
- Backend integration tests (Pytest)
- Frontend integration tests (Jest)
- Test environment setup
- Running tests (individual and combined)
- Coverage reports and CI/CD setup

### ⚙️ [Setup Guide](./setup_guide.md)
**Complete environment setup instructions**
- Prerequisites and dependencies
- Backend setup (Flask, Python, virtual environment)
- Frontend setup (React, Node.js, npm)
- External services (Supabase, Cloudflare R2)
- Testing infrastructure
- Development workflow
- Troubleshooting common issues

---

## Quick Start

### For New Developers

1. **Read First:**
   - [Setup Guide](./setup_guide.md) - Get your environment running
   - [Architecture](./architecture.md) - Understand the system

2. **Reference During Development:**
   - [API Endpoints](./api_endpoints.md) - API usage and testing
   - [Data Flow](./data_flow.md) - How data moves through the system

3. **Before Committing:**
   - [Testing Coverage](./testing_coverage.md) - Run and write tests

### For API Users

- [API Endpoints](./api_endpoints.md) - Complete API reference
- [Data Flow](./data_flow.md) - Understand request/response flow

### For DevOps/Deployment

- [Architecture](./architecture.md) - System components and dependencies
- [Setup Guide](./setup_guide.md) - Environment configuration
- [Testing Coverage](./testing_coverage.md) - CI/CD test setup

---

## Additional Documentation

### API Documentation
- [API Endpoints Reference](./api/endpoints.md) - Detailed endpoint documentation

### Architecture Documentation
- [System Overview](./architecture/overview.md) - High-level architecture

### Deployment Documentation
- [Deployment Guide](./deployment/README.md) - Production deployment

### User Documentation
- [User Guide](./user-guide/README.md) - End-user instructions

---

## Document Status

| Document | Status | Last Updated | Completeness |
|----------|--------|--------------|--------------|
| Architecture | ✅ Complete | 2025-10-20 | 100% |
| API Endpoints | ✅ Complete | 2025-10-20 | 100% |
| Data Flow | ✅ Complete | 2025-10-20 | 100% |
| Testing Coverage | ✅ Complete | 2025-10-20 | 100% |
| Setup Guide | ✅ Complete | 2025-10-20 | 100% |

---

## Key Concepts

### Photo Upload Flow
```
User selects photo → Frontend uploads to /api/photos/upload
→ Backend stores file in R2 → Backend stores metadata in Supabase
→ Returns photo_id and URL → Frontend refreshes map
```

### Photo Retrieval Flow
```
Frontend requests photos → Backend queries Supabase
→ Backend generates presigned URLs from R2 → Returns photo array
→ Frontend renders markers on MapLibre map
```

### External Services
- **Supabase:** Photo metadata storage (PostgreSQL-based)
- **Cloudflare R2:** Photo file storage (S3-compatible)
- **MapLibre GL:** Interactive map rendering

---

## Development Commands

### Backend
```bash
cd server
source ../venv/bin/activate
flask run                  # Start server
pytest                     # Run tests
black app/ tests/          # Format code
```

### Frontend
```bash
cd client
npm start                  # Start dev server
npm test                   # Run tests
npm run format             # Format code
```

### Combined
```bash
./scripts/test_all.sh      # Run all tests
./scripts/setup.sh         # Initial setup
```

---

## Contributing

When adding new features:

1. Update relevant documentation
2. Add API examples to [API Endpoints](./api_endpoints.md)
3. Document data flow in [Data Flow](./data_flow.md)
4. Add tests and update [Testing Coverage](./testing_coverage.md)
5. Update [Architecture](./architecture.md) if adding new components

---

## Support

### Internal Resources
- Documentation: `docs/` directory
- Tests: `server/tests/` and `client/src/__tests__/`
- Scripts: `scripts/` directory

### External Resources
- [Flask Documentation](https://flask.palletsprojects.com/)
- [React Documentation](https://react.dev/)
- [Supabase Documentation](https://supabase.com/docs)
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [MapLibre GL JS Documentation](https://maplibre.org/maplibre-gl-js/docs/)

---

## Version History

### Stage 2.5 - Integration Documentation (Current)
- ✅ Complete architecture documentation
- ✅ Full API endpoint reference
- ✅ Data flow diagrams
- ✅ Testing coverage documentation
- ✅ Setup guide with troubleshooting
- ✅ Integration tests (backend + frontend)
- ✅ Code formatting and consistency

### Stage 2.4 - End-to-End Testing
- ✅ Backend integration tests
- ✅ Frontend integration tests
- ✅ Jest setup with mocks
- ✅ Combined test script

### Stage 2.x - Integration Layer (Previous)
- ✅ Supabase integration
- ✅ Cloudflare R2 integration
- ✅ Photo upload and retrieval
- ✅ Map rendering with MapLibre

---

## Next Steps

### Stage 3 - Advanced Features (Planned)
- User authentication
- Photo editing and metadata updates
- Advanced map clustering
- Real-time photo updates
- Thumbnail generation
- Batch uploads

See individual documentation files for detailed implementation plans.
