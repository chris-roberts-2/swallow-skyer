# Setup Guide

## Overview

This guide provides step-by-step instructions for setting up the Swallow Skyer development environment, including backend (Flask), frontend (React), external services (Supabase, Cloudflare R2), and testing infrastructure.

---

## Prerequisites

### Required Software

| Software | Minimum Version | Recommended | Purpose |
|----------|-----------------|-------------|---------|
| **Python** | 3.8+ | 3.10+ | Backend runtime |
| **Node.js** | 18+ | 20+ | Frontend runtime |
| **npm** | 8+ | 10+ | Package management |
| **Git** | 2.30+ | Latest | Version control |

### Optional Tools

- **Visual Studio Code** - Recommended IDE
- **Postman** - API testing
- **Docker** - Container deployment (future)

---

## Quick Start

### Automated Setup (Recommended)

```bash
# Clone repository
git clone <repository-url>
cd swallow-skyer-5

# Run setup script
./scripts/setup.sh

# Activate virtual environment
source venv/bin/activate

# Configure environment variables
cp server/.env.example server/.env
cp client/env.example client/.env.local
# Edit .env files with your credentials

# Start backend (terminal 1)
cd server && flask run

# Start frontend (terminal 2)
cd client && npm start
```

---

## Detailed Setup Instructions

### 1. Backend Setup (Flask)

#### Step 1.1: Create Virtual Environment

```bash
# Navigate to project root
cd swallow-skyer-5

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On macOS/Linux:
source venv/bin/activate
# On Windows:
venv\Scripts\activate

# Verify activation
which python  # Should show venv/bin/python
```

#### Step 1.2: Install Dependencies

```bash
cd server
pip install -r requirements.txt
```

**Key Dependencies:**
```
Flask>=3.0.0              # Web framework
Flask-SQLAlchemy>=3.1.0   # ORM
Flask-CORS>=4.0.0         # Cross-origin support
supabase>=2.0.0           # Supabase client
boto3>=1.34.0             # AWS/R2 client
pytest>=7.4.0             # Testing framework
black>=23.0.0             # Code formatter
python-dotenv>=1.0.0      # Environment variables
```

#### Step 1.3: Configure Environment Variables

```bash
# Copy example file
cp .env.example .env

# Edit with your credentials
nano .env  # or use your preferred editor
```

**Required Variables:**
```bash
# Flask Configuration
SECRET_KEY=your-secret-key-here
FLASK_ENV=development
DATABASE_URL=sqlite:///instance/database.db
FRONTEND_ORIGIN=http://localhost:3000

# Supabase Configuration
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_KEY=your-service-key-here

# Cloudflare R2 Configuration
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
R2_BUCKET_NAME=skyer-platform-v0
R2_ENDPOINT_URL=https://your-account-id.r2.cloudflarestorage.com
R2_PUBLIC_URL=https://your-custom-domain.com
```

**Getting Credentials:**

**Supabase:**
1. Go to https://supabase.com
2. Create new project or select existing
3. Navigate to Settings → API
4. Copy `Project URL` and `service_role key`

**Cloudflare R2:**
1. Go to Cloudflare Dashboard → R2
2. Create bucket (e.g., `skyer-platform-v0`)
3. Go to R2 → Manage R2 API Tokens
4. Create API token with read/write permissions
5. Copy `Access Key ID` and `Secret Access Key`
6. Note your Account ID from URL

#### Step 1.4: Initialize Database

```bash
# Create database tables
flask db upgrade  # If using Flask-Migrate

# Or initialize with Flask shell
flask shell
>>> from app import db
>>> db.create_all()
>>> exit()
```

#### Step 1.5: Verify Backend Setup

```bash
# Run Flask development server
flask run

# Or use Python directly
python run.py
```

**Expected Output:**
```
 * Environment: development
 * Debug mode: on
 * Running on http://127.0.0.1:5000
```

**Test Endpoint:**
```bash
# In another terminal
curl http://localhost:5000/ping

# Expected response:
{"status":"ok"}
```

---

### 2. Frontend Setup (React)

#### Step 2.1: Install Dependencies

```bash
cd client
npm install
```

**Key Dependencies:**
```json
{
  "@supabase/supabase-js": "^2.75.0",
  "axios": "^1.12.2",
  "maplibre-gl": "^5.9.0",
  "react": "^19.1.1",
  "react-dom": "^19.1.1",
  "react-router-dom": "^7.9.4"
}
```

#### Step 2.2: Configure Environment Variables

```bash
# Copy example file (we keep it as env.example in the repo)
cp client/env.example client/.env.local

# Edit with your configuration
nano client/.env.local
```

**Required Variables:**
```bash
# Supabase Configuration (optional for direct client access)
REACT_APP_SUPABASE_URL=https://your-project-ref.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key-here

# API Configuration
REACT_APP_API_URL=http://localhost:5000/api
```

#### Step 2.3: Verify Frontend Setup

```bash
# Start React development server
npm start
```

**Expected Output:**
```
Compiled successfully!

You can now view client in the browser.

  Local:            http://localhost:3000
  On Your Network:  http://192.168.1.x:3000
```

**Browser Test:**
- Navigate to http://localhost:3000
- Map should load with MapLibre tiles
- No console errors

---

### 3. External Service Setup

#### 3.1: Supabase Database Schema

**Create Photos Table:**

1. Go to Supabase Dashboard → SQL Editor
2. Run the following SQL:

```sql
-- Create photos table
CREATE TABLE photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT,
    r2_key TEXT NOT NULL,
    url TEXT,
    latitude FLOAT NOT NULL,
    longitude FLOAT NOT NULL,
    taken_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_photos_coordinates ON photos(latitude, longitude);
CREATE INDEX idx_photos_user_id ON photos(user_id);
CREATE INDEX idx_photos_taken_at ON photos(taken_at DESC);

-- Enable Row Level Security (optional)
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (development)
CREATE POLICY "Allow all operations" ON photos
    FOR ALL USING (true);
```

**Verify Table:**
```sql
SELECT * FROM photos LIMIT 5;
```

#### 3.2: Cloudflare R2 Bucket Configuration

**Create Bucket:**

1. Go to Cloudflare Dashboard → R2
2. Click "Create bucket"
3. Name: `skyer-platform-v0` (or your chosen name)
4. Location: Auto (or choose closest region)
5. Click "Create bucket"

**Configure CORS (if needed for direct uploads):**

1. Select bucket → Settings → CORS policy
2. Add policy:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "http://localhost:5000"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

**Test Connection:**

```bash
# Backend should be running
curl http://localhost:5000/api/test/supabase-r2

# Expected response shows both services connected:
{
  "status": "test_completed",
  "results": {
    "supabase": {"status": "connected", ...},
    "r2": {"status": "connected", ...}
  }
}
```

---

### 4. Testing Setup

#### 4.1: Test Environment Configuration

```bash
# Create test environment files
cp .env .env.test
cp server/.env server/.env.test
```

**Edit `.env.test` with mock values:**
```bash
SECRET_KEY=test-secret
SUPABASE_URL=https://example.supabase.co
SUPABASE_SERVICE_KEY=mock-service-key
R2_ACCESS_KEY_ID=mock-access
R2_SECRET_ACCESS_KEY=mock-secret
R2_BUCKET_NAME=mock-bucket
R2_ENDPOINT_URL=https://mock.r2.local
R2_PUBLIC_URL=https://cdn.mock.example
```

#### 4.2: Run Tests

**Backend Tests:**
```bash
cd server
pytest

# With verbose output
pytest -v

# With coverage
pytest --cov=app tests/
```

**Frontend Tests:**
```bash
cd client
npm test -- --watchAll=false

# With coverage
npm test -- --coverage --watchAll=false
```

**All Tests:**
```bash
# From project root
./scripts/test_all.sh
```

---

## Development Workflow

### Daily Development

```bash
# 1. Activate virtual environment
source venv/bin/activate

# 2. Pull latest changes
git pull origin Integration

# 3. Install any new dependencies
cd server && pip install -r requirements.txt
cd ../client && npm install

# 4. Start backend (terminal 1)
cd server && flask run

# 5. Start frontend (terminal 2)
cd client && npm start

# 6. Run tests before committing
./scripts/test_all.sh

# 7. Format code
cd server && black app/ tests/
cd ../client && npm run format

# 8. Commit changes
git add .
git commit -m "feat: your feature description"
git push origin Integration
```

---

## Common Issues & Troubleshooting

### Backend Issues

**Issue: `ModuleNotFoundError: No module named 'flask'`**
```bash
# Solution: Activate virtual environment
source venv/bin/activate
pip install -r requirements.txt
```

**Issue: `R2 client not initialized`**
```bash
# Solution: Check environment variables
cat server/.env | grep R2_

# Verify all R2 variables are set
```

**Issue: `Supabase client not initialized`**
```bash
# Solution: Check Supabase credentials
cat server/.env | grep SUPABASE_

# Verify URL and service key are correct
```

**Issue: Database errors**
```bash
# Solution: Reinitialize database
rm server/instance/database.db
flask shell
>>> from app import db
>>> db.create_all()
```

---

### Frontend Issues

**Issue: `Module not found: Can't resolve 'maplibre-gl'`**
```bash
# Solution: Reinstall dependencies
cd client
rm -rf node_modules package-lock.json
npm install
```

**Issue: CORS errors in browser console**
```bash
# Solution: Check backend CORS configuration
# Verify FRONTEND_ORIGIN in server/.env matches frontend URL
# Default: http://localhost:3000
```

**Issue: API requests fail with 404**
```bash
# Solution: Check API URL configuration
cat client/.env | grep REACT_APP_API_URL

# Should be: http://localhost:5000/api
# Restart React dev server after changing
```

---

### Test Issues

**Issue: Backend tests fail with import errors**
```bash
# Solution: Install test dependencies
cd server
pip install pytest pytest-flask

# Run from server directory
cd server
pytest
```

**Issue: Frontend tests fail with MapLibre errors**
```bash
# Solution: Verify jest.setup.js exists and is configured
ls client/jest.setup.js

# Check package.json test command includes setup
npm test -- --watchAll=false
```

---

## IDE Configuration

### Visual Studio Code

**Recommended Extensions:**
- Python (ms-python.python)
- Pylance (ms-python.vscode-pylance)
- ES7+ React/Redux/React-Native snippets
- ESLint
- Prettier - Code formatter
- GitLens

**Settings (`.vscode/settings.json`):**
```json
{
  "python.linting.enabled": true,
  "python.formatting.provider": "black",
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "[python]": {
    "editor.defaultFormatter": "ms-python.black-formatter"
  },
  "python.testing.pytestEnabled": true,
  "python.testing.pytestArgs": ["tests"]
}
```

---

## Production Deployment (Future)

### Environment Variables

**Production `.env` should include:**
```bash
FLASK_ENV=production
SECRET_KEY=<strong-random-key>
DATABASE_URL=<production-db-url>
SUPABASE_URL=<production-supabase-url>
SUPABASE_SERVICE_KEY=<production-service-key>
R2_ENDPOINT_URL=<production-r2-endpoint>
```

**Security Checklist:**
- ✅ Use strong SECRET_KEY (32+ random characters)
- ✅ Enable HTTPS for all endpoints
- ✅ Configure proper CORS origins
- ✅ Use production Supabase project
- ✅ Enable Supabase Row Level Security
- ✅ Configure R2 bucket permissions
- ✅ Set up CDN for R2 public URL
- ✅ Enable rate limiting
- ✅ Configure proper logging

---

## Next Steps

After completing setup:

1. **Review Documentation:**
   - `docs/architecture.md` - System overview
   - `docs/api_endpoints.md` - API reference
   - `docs/data_flow.md` - Data flow diagrams

2. **Test Integration:**
   - Upload a test photo via `/api/photos/upload`
   - Verify it appears in Supabase
   - Verify file stored in R2
   - View photo on map

3. **Development:**
   - Create feature branch
   - Make changes
   - Run tests
   - Submit pull request

---

## Support

### Resources

- **Documentation:** `docs/` directory
- **Issues:** GitHub Issues (if available)
- **Tests:** `server/tests/` and `client/src/__tests__/`

### Common Commands Reference

```bash
# Backend
cd server
source ../venv/bin/activate   # Activate venv
flask run                      # Start server
pytest                         # Run tests
black app/ tests/              # Format code

# Frontend
cd client
npm start                      # Start dev server
npm test                       # Run tests
npm run format                 # Format code
npm run build                  # Production build

# Combined
./scripts/test_all.sh         # Run all tests
./scripts/setup.sh            # Initial setup
```

---

## Appendix

### Full Dependency List

**Backend (`server/requirements.txt`):**
```
Flask>=3.0.0
Flask-SQLAlchemy>=3.1.0
Flask-CORS>=4.0.0
SQLAlchemy>=2.0.0
supabase>=2.0.0
boto3>=1.34.0
pytest>=7.4.0
pytest-flask>=1.3.0
black>=23.0.0
python-dotenv>=1.0.0
python-dateutil>=2.8.0
```

**Frontend (`client/package.json`):**
```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.75.0",
    "@testing-library/jest-dom": "^6.8.0",
    "@testing-library/react": "^16.3.0",
    "axios": "^1.12.2",
    "maplibre-gl": "^5.9.0",
    "react": "^19.1.1",
    "react-dom": "^19.1.1",
    "react-router-dom": "^7.9.4",
    "react-scripts": "5.0.1"
  },
  "devDependencies": {
    "eslint-config-prettier": "^10.1.8",
    "eslint-plugin-prettier": "^5.5.4",
    "prettier": "^3.6.2"
  }
}
```

### Environment Variable Reference

| Variable | Example | Required | Description |
|----------|---------|----------|-------------|
| `SECRET_KEY` | `abc123...` | Yes | Flask secret key |
| `DATABASE_URL` | `sqlite:///...` | Yes | Database connection |
| `SUPABASE_URL` | `https://...` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | `eyJ...` | Yes | Supabase service role key |
| `R2_ACCESS_KEY_ID` | `abc...` | Yes | R2 access key |
| `R2_SECRET_ACCESS_KEY` | `xyz...` | Yes | R2 secret key |
| `R2_BUCKET_NAME` | `bucket-name` | Yes | R2 bucket name |
| `R2_ENDPOINT_URL` | `https://...` | Yes | R2 S3 endpoint |
| `R2_PUBLIC_URL` | `https://cdn...` | No | Custom R2 public URL |
| `FRONTEND_ORIGIN` | `http://...` | Yes | Frontend CORS origin |
| `REACT_APP_API_URL` | `http://...` | Yes | Backend API URL |

