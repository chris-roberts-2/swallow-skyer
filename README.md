# Swallow Skyer

Swallow Skyer is a photo mapping platform: users upload photos, the backend extracts GPS/EXIF metadata, and the frontend renders photos on an interactive MapLibre map.

## Deployment architecture (production)

- **Frontend**: React static site deployed to **GitHub Pages**. Only the build output is deployed.
- **Backend**: Flask API deployed to **Render**.
- **Auth**: Supabase Auth (frontend uses Supabase JS; backend validates Supabase JWTs).
- **Metadata DB**: Supabase Postgres (backend uses service role credentials to write/read metadata).
- **File storage**: Cloudflare R2 (S3-compatible) for original images + thumbnails.
- **Networking**:
  - Frontend → Backend over **HTTPS** API calls.
  - Frontend loads image bytes **directly from R2** using URLs returned by the backend (public or presigned URLs).

Frontend and backend are deployed independently.

## Production configuration (GitHub Pages + Render)

### Frontend (GitHub Pages)

Build-time env vars (baked into the bundle):

- `REACT_APP_API_BASE_URL=https://swallow-skyer-v1.onrender.com`
- `REACT_APP_SUPABASE_URL=<your supabase url>`
- `REACT_APP_SUPABASE_ANON_KEY=<your anon key>`

### Backend (Render)

Recommended Render start command:

```bash
python -m gunicorn "app:create_app()" --bind 0.0.0.0:$PORT
```

Required env vars:

- `APP_ENV=production`
- `DATABASE_URL=<render postgres url>` (required; SQLite is disabled in production)
- `SECRET_KEY=<random>`
- `FRONTEND_ORIGIN=https://chris-roberts-2.github.io`
- `SUPABASE_URL=<...>`
- `SUPABASE_ANON_KEY=<...>` (for JWT validation)
- `SUPABASE_SERVICE_ROLE_KEY=<...>` (required for server-side Supabase metadata writes)
- `R2_ACCESS_KEY_ID=<...>`
- `R2_SECRET_ACCESS_KEY=<...>`
- `R2_BUCKET=<...>`
- `R2_ACCOUNT_ID=<...>` (or `R2_ENDPOINT_URL=<...>`)
- `R2_PUBLIC_BASE_URL=<...>`
- `AUTH_ACCESS_SECRET=<random>`
- `AUTH_REFRESH_SECRET=<random>`
- `AUTH_JWT_ALGORITHM=HS256`
- `AUTH_ACCESS_TTL_SECONDS=900`
- `AUTH_REFRESH_TTL_SECONDS=1209600`

## Repository layout

```
client/   # React frontend source (build output goes to client/build/)
server/   # Flask backend source (API, storage clients, auth middleware)
shared/   # Shared constants/types/schemas used across the repo
docs/     # Architecture, API, and data-flow docs
scripts/  # Local automation scripts (setup/tests; not deployment targets)
```

## Local development

### Prerequisites

- Node.js 18+
- Python 3.8+

### 1) Backend (Flask API)

```bash
python3 -m venv venv
source venv/bin/activate

cd server
pip install -r requirements.txt

# Configure server environment variables (see server/.env.example)
# Then start the API:
python app.py
```

By default the API listens on `http://localhost:5001` (or `PORT` if set).

### 2) Frontend (React)

```bash
cd client
npm install
cp env.example .env.local

# Configure client environment variables in client/.env.local (see client/README.md)
npm start
```

Frontend dev server: `http://localhost:3000`

## Production deployment

### Frontend → GitHub Pages (static)

Build the frontend and deploy **only** the generated `client/build/` directory:

```bash
cd client
npm ci
npm run build
```

`client/` is source code. `client/build/` is the deployable artifact.

### Backend → Render (API)

Deploy the `server/` directory as a Render web service. The repo includes a runnable entry point that honors Render’s `PORT` environment variable:

```bash
cd server
python app.py
```

Render must be configured with environment variables for:

- **Supabase**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (and/or `SUPABASE_ANON_KEY` for JWT validation fallback paths)
- **R2**: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (or `R2_BUCKET_NAME`), plus `R2_ACCOUNT_ID` or `R2_ENDPOINT_URL`
  - Optional: `R2_PUBLIC_BASE_URL` (to return public URLs when available)
- **App**: `SECRET_KEY`
  - Optional: `FRONTEND_ORIGIN` (set to your GitHub Pages origin for CORS)

## Deployment workflow (main + website-v1)

This repo deploys the backend from `main` (Render) and the frontend from
`website-v1` (GitHub Pages). The `website-v1` branch should contain **only**
the static build output (`client/build`), not the source tree.

### Backend update → Render (main branch)

```bash
git checkout main
git status
git add client/src/context/AuthContext.js client/src/pages/ProjectsPage.jsx
git commit -m "Record project access on activation"
git push origin main
```

### Frontend update → GitHub Pages (website-v1 branch)

1) Build the static frontend:

```bash
cd client
npm ci
npm run build
cd ..
```

2) Copy the build output into the `website-v1` worktree.
If you already have a worktree at `_worktrees/website-v1`, use it directly:

```bash
rm -rf "_worktrees/website-v1"/*
cp -R client/build/* "_worktrees/website-v1/"
```

3) Commit and push the static build:

```bash
cd "_worktrees/website-v1"
git add -A
git commit -m "Deploy frontend build"
git push origin website-v1
```

## API quick reference

- **Health**: `GET /api/health`
- **Photos (v1)**:
  - `GET /api/v1/photos/?project_id=<uuid>`
  - `POST /api/v1/photos/upload`
- **Upload (compat)**: `POST /api/photos/upload` (project-scoped upload route)

## Tests

```bash
# Frontend
cd client
npm test

# Backend
cd server
pytest
```
