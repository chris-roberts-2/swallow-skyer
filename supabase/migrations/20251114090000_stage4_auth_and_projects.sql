-- Stage 4.1: Authentication architecture and project access controls
-- Ensure required extensions exist
create extension if not exists "pgcrypto";

-- Users profile table linked to Supabase auth.users
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default timezone('UTC', now())
);

alter table public.users
  add column if not exists email text;

alter table public.users
  add column if not exists created_at timestamptz default timezone('UTC', now());

create unique index if not exists users_email_key on public.users (email);

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
create table if not exists public.project_users (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role text not null default 'Viewer',
  created_at timestamptz not null default timezone('UTC', now()),
  primary key (project_id, user_id),
  check (role in ('Owner', 'Administrator', 'Editor', 'Viewer'))
);

create index if not exists project_users_user_idx on public.project_users (user_id);
create index if not exists project_users_project_idx on public.project_users (project_id);

-- Ensure photos reference a project for access control
alter table public.photos
  add column if not exists project_id uuid references public.projects (id) on delete cascade;

create index if not exists photos_project_idx on public.photos (project_id);

-- Automatically link project owners into the membership table
create or replace function public.ensure_project_owner_membership()
returns trigger as
$$
begin
  insert into public.project_users (project_id, user_id, role)
  values (new.id, new.owner_id, 'Owner')
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
alter table public.project_users enable row level security;
alter table public.photos enable row level security;

-- Clean up legacy photo policies that only checked user_id
drop policy if exists "Users can view their own photos" on public.photos;
drop policy if exists "Users can insert their own photos" on public.photos;
drop policy if exists "Users can update their own photos" on public.photos;
drop policy if exists "Users can delete their own photos" on public.photos;

-- Project policies
create policy "Project members can read projects"
  on public.projects
  for select
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.project_users pu
      where pu.project_id = projects.id
        and pu.user_id = auth.uid()
    )
  );

create policy "Owners manage their projects"
  on public.projects
  for update
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.project_users pu
      where pu.project_id = projects.id
        and pu.user_id = auth.uid()
        and pu.role in ('Owner', 'Administrator')
    )
  )
  with check (
    auth.uid() is not null
    and exists (
      select 1
      from public.project_users pu
      where pu.project_id = projects.id
        and pu.user_id = auth.uid()
        and pu.role in ('Owner', 'Administrator')
    )
  );

create policy "Owners can delete projects"
  on public.projects
  for delete
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.project_users pu
      where pu.project_id = projects.id
        and pu.user_id = auth.uid()
        and pu.role = 'Owner'
    )
  );

create policy "Users can create owned projects"
  on public.projects
  for insert
  with check (
    auth.uid() is not null
    and owner_id = auth.uid()
  );

-- Project user policies
create policy "Members can view project users"
  on public.project_users
  for select
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.project_users my_membership
      where my_membership.project_id = project_users.project_id
        and my_membership.user_id = auth.uid()
    )
  );

create policy "Owners manage project users"
  on public.project_users
  for all
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.project_users my_membership
      where my_membership.project_id = project_users.project_id
        and my_membership.user_id = auth.uid()
        and my_membership.role in ('Owner', 'Administrator')
    )
  )
  with check (
    auth.uid() is not null
    and exists (
      select 1
      from public.project_users my_membership
      where my_membership.project_id = project_users.project_id
        and my_membership.user_id = auth.uid()
        and my_membership.role in ('Owner', 'Administrator')
    )
  );

-- User profile policies
create policy "Users read project collaborators"
  on public.users
  for select
  using (
    auth.uid() is not null
    and (
      auth.uid() = id
      or exists (
        select 1
        from public.project_users my_membership
        join public.project_users target_membership
          on target_membership.project_id = my_membership.project_id
        where my_membership.user_id = auth.uid()
          and target_membership.user_id = users.id
      )
    )
  );

create policy "Users manage their profile"
  on public.users
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Users insert their profile"
  on public.users
  for insert
  with check (auth.uid() = id);

-- Photo policies bound to project membership
create policy "Project members can read photos"
  on public.photos
  for select
  using (
    auth.uid() is not null
    and project_id is not null
    and exists (
      select 1
      from public.project_users pu
      where pu.project_id = photos.project_id
        and pu.user_id = auth.uid()
    )
  );

create policy "Project members manage their photos"
  on public.photos
  for insert
  with check (
    auth.uid() is not null
    and project_id is not null
    and user_id = auth.uid()
    and exists (
      select 1
      from public.project_users pu
      where pu.project_id = photos.project_id
        and pu.user_id = auth.uid()
    )
  );

create policy "Project members update their photos"
  on public.photos
  for update
  using (
    auth.uid() is not null
    and project_id is not null
    and user_id = auth.uid()
    and exists (
      select 1
      from public.project_users pu
      where pu.project_id = photos.project_id
        and pu.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() is not null
    and project_id is not null
    and user_id = auth.uid()
    and exists (
      select 1
      from public.project_users pu
      where pu.project_id = photos.project_id
        and pu.user_id = auth.uid()
    )
  );

create policy "Project members delete their photos"
  on public.photos
  for delete
  using (
    auth.uid() is not null
    and project_id is not null
    and user_id = auth.uid()
    and exists (
      select 1
      from public.project_users pu
      where pu.project_id = photos.project_id
        and pu.user_id = auth.uid()
    )
  );

