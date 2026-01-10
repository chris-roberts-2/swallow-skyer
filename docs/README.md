# Swallow Skyer Documentation

This directory contains **documentation only** (not deployed to GitHub Pages or Render as part of the running app).

## Architecture summary

- **Frontend**: React static site on **GitHub Pages** (deploy build output only)
- **Backend**: Flask API on **Render**
- **Auth + metadata**: Supabase
- **Photo files**: Cloudflare R2

## Documentation index

- **Architecture**: `docs/architecture.md` and `docs/architecture/overview.md`
- **API reference**: `docs/api_endpoints.md` and `docs/api/endpoints.md`
- **Data flow**: `docs/data_flow.md`
- **Setup**: `docs/setup_guide.md`
- **Deployment**: `docs/deployment/README.md`
- **User guide**: `docs/user-guide/README.md`

## Quick commands (local dev)

Backend:

```bash
cd server
source ../venv/bin/activate
python app.py
```

Frontend:

```bash
cd client
npm start
```

## Key endpoints referenced in docs

- **Upload**: `POST /api/photos/upload` (compat upload route) and `POST /api/v1/photos/upload`
- **List photos (v1)**: `GET /api/v1/photos/?project_id=<uuid>`
- **Health**: `GET /api/health`
