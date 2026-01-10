# User Guide

This directory contains **end-user documentation** for the Swallow Skyer web application.

## Where the app runs

- **Frontend**: Static React site hosted on **GitHub Pages**
- **Backend**: Flask API hosted on **Render**
- **Login**: Supabase Auth
- **Photo files**: Cloudflare R2 (images are fetched directly from storage URLs)

## Core workflows

- **Sign in**: Authenticate via Supabase.
- **Browse photos**: The frontend requests photo metadata from the API and renders markers on the map; image bytes are loaded from URLs returned by the API (often R2 URLs).
- **Upload photos**: The frontend uploads files to the backend. The backend validates permissions, extracts EXIF/GPS data, generates thumbnails, stores files in R2, and writes metadata to Supabase.
- **Download**: Some multi-photo downloads are performed via backend endpoints (e.g., zip downloads) to avoid browser CORS limitations.

## Support

If you are missing access to a project or an upload fails due to permissions, you may need to be added as a project member with an appropriate role.
