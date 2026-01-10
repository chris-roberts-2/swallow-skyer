# Deployment (GitHub Pages + Render)

Swallow Skyer is deployed as **two separate services**:

- **Frontend**: React static site on **GitHub Pages** (deploy build output only)
- **Backend**: Flask API on **Render**

Images are stored in **Cloudflare R2** and metadata/auth live in **Supabase**.

## Frontend (GitHub Pages)

- **Source**: `client/`
- **Deployable artifact**: `client/build/` (generated)

Build command:

```bash
cd client
npm ci
npm run build
```

Environment variables are **build-time** (baked into the static bundle):

- `REACT_APP_SUPABASE_URL`
- `REACT_APP_SUPABASE_ANON_KEY`
- Backend base URL (choose one):
  - `REACT_APP_API_BASE_URL` (preferred): `https://<your-render-host>`
  - `REACT_APP_API_URL` (legacy): `https://<your-render-host>/api`

## Backend (Render)

- **Source**: `server/`
- **Start command** (honors Render `PORT`):

```bash
cd server
python app.py
```

Local build/install (Render build step equivalent):

```bash
cd server
pip install -r requirements.txt
```

Required environment variables (Render):

- **App**: `PORT`, `SECRET_KEY`, `FRONTEND_ORIGIN` (GitHub Pages origin for CORS)
- **Supabase**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (and/or `SUPABASE_ANON_KEY`)
- **R2**: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (or `R2_BUCKET_NAME`)
  - plus `R2_ACCOUNT_ID` or `R2_ENDPOINT_URL`
  - optional `R2_PUBLIC_BASE_URL` (for public URLs when available)

## Verify

- Backend health: `GET /api/health`
