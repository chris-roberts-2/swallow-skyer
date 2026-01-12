-- Stage 4.1: Authentication architecture and project access controls
-- Ensure required extensions exist
create extension if not exists "pgcrypto";

-- Users profile table (app-level UUID; linked to Supabase Auth via auth_user_id)
create table if not exists public.users (
  id uuid primary key default extensions.uuid_generate_v4(),
  email text not null,
  username text null,
  created_at timestamptz default timezone('UTC', now()),
  first_name text null,
  last_name text null,
  company text null,
  auth_user_id uuid null
);

create unique index if not exists users_email_key on public.users (email);
create unique index if not exists users_auth_user_id_key
  on public.users (auth_user_id)
  where auth_user_id is not null;

-- Projects owned by a specific user
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default timezone('UTC', now())
);

alter table public.projects
  add column if not exists owner_id uuid references public.users (id) on delete cascade;

alter table public.projects
  add column if not exists created_at timestamptz default timezone('UTC', now());

create index if not exists projects_owner_idx on public.projects (owner_id);

-- Project membership and roles
create table if not exists public.project_members (
  id uuid primary key default extensions.uuid_generate_v4(),
  project_id uuid references public.projects (id) on delete cascade,
  user_id uuid references public.users (id) on delete cascade,
  role text null,
  created_at timestamptz default timezone('UTC', now()),
  last_accessed_at timestamptz null,
  constraint project_members_project_id_user_id_key unique (project_id, user_id),
  constraint project_members_role_check check (
    role = any (
      array[
        'owner'::text,
        'co-owner'::text,
        'collaborator'::text,
        'viewer'::text
      ]
    )
  )
);

create index if not exists project_members_user_idx on public.project_members (user_id);
create index if not exists project_members_project_idx on public.project_members (project_id);

-- Ensure photos reference a project for access control
alter table public.photos
  add column if not exists project_id uuid references public.projects (id) on delete cascade;

create index if not exists photos_project_idx on public.photos (project_id);

-- Automatically link project owners into the membership table
create or replace function public.ensure_project_owner_membership()
returns trigger as
$$
begin
  insert into public.project_members (project_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (project_id, user_id) do update
    set role = excluded.role;
  return new;
end;
$$
language plpgsql;

drop trigger if exists ensure_project_owner_membership on public.projects;

create trigger ensure_project_owner_membership
after insert on public.projects
for each row
execute function public.ensure_project_owner_membership();

-- Enable Row Level Security on all participating tables
alter table public.users enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.photos enable row level security;

-- Clean up legacy photo policies that only checked user_id
drop policy if exists "Users can view their own photos" on public.photos;
drop policy if exists "Users can insert their own photos" on public.photos;
drop policy if exists "Users can update their own photos" on public.photos;
drop policy if exists "Users can delete their own photos" on public.photos;

-- NOTE: Project + membership + photo RLS policies are defined in later migrations
-- (see 20251123161500_project_rls_policies.sql). This migration focuses on tables.

