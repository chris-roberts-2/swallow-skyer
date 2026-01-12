-- Production-final locations + photos tables.
--
-- Note: Projects/users/membership are introduced in later migrations.
-- We create columns now but defer foreign key constraints + RLS policies to later
-- migrations once the referenced tables exist and auth mapping is defined.

create table if not exists public.locations (
  id uuid not null default extensions.uuid_generate_v4(),
  latitude double precision not null,
  longitude double precision not null,
  elevation double precision null,
  created_at timestamptz null default now(),
  constraint locations_pkey primary key (id)
);

create index if not exists idx_locations_lat_lon
  on public.locations (latitude, longitude);

create table if not exists public.photos (
  id uuid not null default extensions.uuid_generate_v4(),
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
  captured_at timestamptz null,
  uploaded_at timestamptz null default now(),
  caption text null,
  latitude double precision null,
  longitude double precision null,
  show_on_photos boolean not null default true,
  constraint photos_pkey primary key (id)
);

create index if not exists idx_photos_project_id
  on public.photos (project_id);

create index if not exists idx_photos_location_id
  on public.photos (location_id);

