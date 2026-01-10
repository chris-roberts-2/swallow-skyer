# Server Uploads Directory

## Purpose
This directory contains **development/test assets** (sample uploads). In production, photo files are stored in **Cloudflare R2** and metadata/auth are stored in **Supabase**.

## Storage Strategy
- **Development/testing**: sample files may live under `server/uploads/`
- **Production**: original images + thumbnails are stored in **Cloudflare R2**
- **Metadata**: stored in **Supabase** (Postgres)

## File Organization
```
uploads/
└── (sample files used for local dev/testing)
```

## Important Notes
- Not a deployment artifact for GitHub Pages or Render.
- The running application does not rely on this directory in production.
