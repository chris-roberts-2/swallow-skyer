# Dev Setup (Postgres/Supabase Required)

- Set `DATABASE_URL` to your Postgres/Supabase DSN. SQLite is disabled.
- Apply migrations (requires `psql`):
  - `server/migrations/202512080001_create_project_public_links.sql`
  - `server/migrations/202512080100_rls_project_policies.sql`
  - Or run `python server/scripts/run_migrations.py`
- Foldering: `projects/<project_id>/photos/<photo_id>.<ext>` (thumbnails `_thumb`).
- RLS: owners/co-owners full, collaborators upload+read, viewers read-only.
- Public links: GET/POST/DELETE under `/api/v1/projects/:id/public-links`; public views `/api/v1/public/<token>/...` with expiry respected.
- Frontend scoping: active project required; Map/Gallery fetch `/api/v1/photos?project_id=<id>`.
- Project switching: use the switcher in Map page; roles stored in AuthContext.
- Run backend: `cd server && FLASK_APP=app.py flask run --port 5001`
- Run frontend: `cd client && npm start` with `REACT_APP_API_BASE_URL=http://localhost:5001`

