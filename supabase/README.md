# Supabase Schema (Production-Final)

This directory contains Supabase configuration and migrations. **For production, the Supabase tables below are the authoritative source of truth** for:

- **Users** (`public.users`)
- **Projects** (`public.projects`)
- **Project membership / roles** (`public.project_members`)
- **Photos** (`public.photos`)
- **Locations** (`public.locations`)

The server and client are expected to **read/write these tables** via the Supabase REST APIs (server uses service role where appropriate) and must stay consistent with this schema.

## Status

- **Production stage**: **Final / stable schema** (do not rename tables/columns without a migration + coordinated server/client change).

## Tables

### `public.users`

Stores the application-level user profile record.

```sql
create table public.users (
  id uuid not null default extensions.uuid_generate_v4 (),
  auth_user_id uuid null,
  email text not null,
  username text null,
  created_at timestamp with time zone null default now(),
  first_name text null,
  last_name text null,
  company text null,
  constraint users_pkey primary key (id),
  constraint users_email_key unique (email)
) TABLESPACE pg_default;
```

Deployed production index:

```sql
create unique index if not exists users_auth_user_id_key
  on public.users using btree (auth_user_id)
  where (auth_user_id is not null);
```

### `public.projects`

Represents a project (a workspace / collection of photos).

```sql
create table public.projects (
  id uuid not null default extensions.uuid_generate_v4 (),
  name text not null,
  owner_id uuid null,
  created_at timestamp with time zone null default now(),
  address text null,
  show_on_projects boolean not null default true,
  address_coord jsonb null,
  constraint projects_pkey primary key (id),
  constraint projects_owner_id_fkey foreign KEY (owner_id) references users (id) on delete CASCADE
) TABLESPACE pg_default;
```

### `public.project_members`

Many-to-many relationship between users and projects, including roles.

```sql
create table public.project_members (
  id uuid not null default extensions.uuid_generate_v4 (),
  project_id uuid null,
  user_id uuid null,
  role text null,
  created_at timestamp with time zone null default now(),
  last_accessed_at timestamp with time zone null,
  constraint project_members_pkey primary key (id),
  constraint project_members_project_id_user_id_key unique (project_id, user_id),
  constraint project_members_project_id_fkey foreign KEY (project_id) references projects (id) on delete CASCADE,
  constraint project_members_user_id_fkey foreign KEY (user_id) references users (id) on delete CASCADE,
  constraint project_members_role_check check (
    (
      role = any (
        array[
          'owner'::text,
          'co-owner'::text,
          'collaborator'::text,
          'viewer'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;
```

### `public.locations`

Stores reusable geographic locations. (Photos may link to a location.)

```sql
create table public.locations (
  id uuid not null default extensions.uuid_generate_v4 (),
  latitude double precision not null,
  longitude double precision not null,
  elevation double precision null,
  created_at timestamp with time zone null default now(),
  constraint locations_pkey primary key (id)
) TABLESPACE pg_default;
```

Indexes:

```sql
create index IF not exists idx_locations_lat_lon on public.locations using btree (latitude, longitude) TABLESPACE pg_default;
```

### `public.photos`

Stores photo metadata. The photo bytes live in Cloudflare R2; this row stores references (e.g. `r2_path`, `r2_url`) plus EXIF/GPS metadata.

```sql
create table public.photos (
  id uuid not null default extensions.uuid_generate_v4 (),
  project_id uuid null,
  location_id uuid null,
  user_id uuid null,
  file_name text not null,
  file_type text null,
  file_size integer null,
  resolution text null,
  r2_path text null,
  r2_url text null,
  exif_data jsonb null,
  captured_at timestamp with time zone null,
  uploaded_at timestamp with time zone null default now(),
  caption text null,
  latitude double precision null,
  longitude double precision null,
  show_on_photos boolean not null default true,
  constraint photos_pkey primary key (id),
  constraint photos_location_id_fkey foreign KEY (location_id) references locations (id) on delete set null,
  constraint photos_project_id_fkey foreign KEY (project_id) references projects (id) on delete CASCADE,
  constraint photos_user_id_fkey foreign KEY (user_id) references users (id) on delete set null
) TABLESPACE pg_default;
```

Indexes:

```sql
create index IF not exists idx_photos_project_id on public.photos using btree (project_id) TABLESPACE pg_default;
create index IF not exists idx_photos_location_id on public.photos using btree (location_id) TABLESPACE pg_default;
```

## Relationships (high-level)

- `projects.owner_id` → `users.id` (cascade delete)
- `project_members.project_id` → `projects.id` (cascade delete)
- `project_members.user_id` → `users.id` (cascade delete)
- `photos.project_id` → `projects.id` (cascade delete)
- `photos.user_id` → `users.id` (set null on user delete)
- `photos.location_id` → `locations.id` (set null on location delete)

## Important invariants

- **Unique user identity**: `users.email` is unique (`users_email_key`).
- **Membership uniqueness**: at most one membership row per `(project_id, user_id)` due to `project_members_project_id_user_id_key`.
- **Soft-hide photos**: `photos.show_on_photos = false` means “do not render on Photos/Map”.

