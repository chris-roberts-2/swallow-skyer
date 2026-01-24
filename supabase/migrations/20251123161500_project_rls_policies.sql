-- Task 4.a.1 – Supabase RLS & Permission Policies
--
-- This migration enables row-level security and defines the access policies
-- for the collaborative project workflow across projects, project_members,
-- photos, and locations.  Roles are enforced according to the following rules:
--   • Owners & Administrators … full read/write/delete inside their project
--   • Editors … read, insert photos/locations, update only their photos
--   • Viewers … read-only
--   • non-members … no access

-- Ensure RLS is enabled on all participating tables
alter table if exists public.projects        enable row level security;
alter table if exists public.project_members enable row level security;
alter table if exists public.photos          enable row level security;
alter table if exists public.locations       enable row level security;

-- ---------------------------------------------------------------------------
-- Helper drops so the migration is idempotent
-- ---------------------------------------------------------------------------
drop policy if exists "projects_select_members"        on public.projects;
drop policy if exists "projects_insert_owner"          on public.projects;
drop policy if exists "projects_update_owner_coowner"  on public.projects;
drop policy if exists "projects_delete_owner_coowner"  on public.projects;

drop policy if exists "project_members_select_members"       on public.project_members;
drop policy if exists "project_members_insert_owner_coowner" on public.project_members;
drop policy if exists "project_members_update_owner_coowner" on public.project_members;
drop policy if exists "project_members_delete_owner_coowner" on public.project_members;

drop policy if exists "photos_select_members"              on public.photos;
drop policy if exists "photos_insert_allowed_roles"        on public.photos;
drop policy if exists "photos_update_collab_or_owner"      on public.photos;
drop policy if exists "photos_delete_owner_coowner"        on public.photos;

drop policy if exists "locations_select_members"              on public.locations;
drop policy if exists "locations_insert_allowed_roles"        on public.locations;
drop policy if exists "locations_update_owner_coowner"        on public.locations;
drop policy if exists "locations_delete_owner_coowner"        on public.locations;

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------
create policy "projects_select_members"
  on public.projects
  for select
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = projects.id
        and pm.user_id = auth.uid()
    )
  );

create policy "projects_insert_owner"
  on public.projects
  for insert
  with check (
    auth.uid() is not null
    and owner_id = auth.uid()
  );

create policy "projects_update_owner_coowner"
  on public.projects
  for update
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = projects.id
        and pm.user_id = auth.uid()
        and pm.role in ('Owner', 'Administrator')
    )
  )
  with check (
    auth.uid() is not null
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = projects.id
        and pm.user_id = auth.uid()
        and pm.role in ('Owner', 'Administrator')
    )
  );

create policy "projects_delete_owner_coowner"
  on public.projects
  for delete
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = projects.id
        and pm.user_id = auth.uid()
        and pm.role in ('Owner', 'Administrator')
    )
  );

-- ---------------------------------------------------------------------------
-- Project members
-- ---------------------------------------------------------------------------
create policy "project_members_select_members"
  on public.project_members
  for select
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = project_members.project_id
        and pm.user_id = auth.uid()
    )
  );

create policy "project_members_insert_owner_coowner"
  on public.project_members
  for insert
  with check (
    auth.uid() is not null
    and (
      -- Existing owner/administrator managing membership
      exists (
        select 1
        from public.project_members pm
        where pm.project_id = project_members.project_id
          and pm.user_id = auth.uid()
          and pm.role in ('Owner', 'Administrator')
      )
      -- Seed owner membership immediately after project creation
      or (
        project_members.role in ('Owner', 'Administrator')
        and project_members.user_id = auth.uid()
        and exists (
          select 1
          from public.projects p
          where p.id = project_members.project_id
            and p.owner_id = auth.uid()
        )
      )
    )
  );

create policy "project_members_update_owner_coowner"
  on public.project_members
  for update
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = project_members.project_id
        and pm.user_id = auth.uid()
        and pm.role in ('Owner')
    )
  )
  with check (
    auth.uid() is not null
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = project_members.project_id
        and pm.user_id = auth.uid()
        and pm.role in ('Owner', 'Administrator')
    )
  );

create policy "project_members_delete_owner_coowner"
  on public.project_members
  for delete
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = project_members.project_id
        and pm.user_id = auth.uid()
        and pm.role in ('Owner', 'Administrator')
    )
  );

-- ---------------------------------------------------------------------------
-- Photos
-- ---------------------------------------------------------------------------
create policy "photos_select_members"
  on public.photos
  for select
  using (
    auth.uid() is not null
    and project_id is not null
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = photos.project_id
        and pm.user_id = auth.uid()
    )
  );

create policy "photos_insert_allowed_roles"
  on public.photos
  for insert
  with check (
    auth.uid() is not null
    and project_id is not null
    and user_id = auth.uid()
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = photos.project_id
        and pm.user_id = auth.uid()
        and pm.role in ('Owner', 'Administrator', 'Editor')
    )
  );

create policy "photos_update_collab_or_owner"
  on public.photos
  for update
  using (
    auth.uid() is not null
    and project_id is not null
    and (
      exists (
        select 1
        from public.project_members pm
        where pm.project_id = photos.project_id
          and pm.user_id = auth.uid()
          and pm.role in ('Owner', 'Administrator', 'Editor')
      )
      or (
        photos.user_id = auth.uid()
        and exists (
          select 1
          from public.project_members pm
          where pm.project_id = photos.project_id
            and pm.user_id = auth.uid()
            and pm.role = 'Editor'
        )
      )
    )
  )
  with check (
    auth.uid() is not null
    and project_id is not null
    and (
      exists (
        select 1
        from public.project_members pm
        where pm.project_id = photos.project_id
          and pm.user_id = auth.uid()
          and pm.role in ('Owner', 'Administrator', 'Editor')
      )
      or (
        photos.user_id = auth.uid()
        and exists (
          select 1
          from public.project_members pm
          where pm.project_id = photos.project_id
            and pm.user_id = auth.uid()
            and pm.role = 'Editor'
        )
      )
    )
  );

create policy "photos_delete_owner_coowner"
  on public.photos
  for delete
  using (
    auth.uid() is not null
    and project_id is not null
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = photos.project_id
        and pm.user_id = auth.uid()
        and pm.role in ('Owner', 'Administrator')
    )
  );

-- ---------------------------------------------------------------------------
-- Locations
-- ---------------------------------------------------------------------------
create policy "locations_select_members"
  on public.locations
  for select
  using (
    auth.uid() is not null
    and project_id is not null
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = locations.project_id
        and pm.user_id = auth.uid()
    )
  );

create policy "locations_insert_allowed_roles"
  on public.locations
  for insert
  with check (
    auth.uid() is not null
    and project_id is not null
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = locations.project_id
        and pm.user_id = auth.uid()
        and pm.role in ('Owner', 'Administrator', 'Editor')
    )
  );

create policy "locations_update_owner_coowner"
  on public.locations
  for update
  using (
    auth.uid() is not null
    and project_id is not null
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = locations.project_id
        and pm.user_id = auth.uid()
        and pm.role in ('Owner', 'Administrator', 'Editor')
    )
  )
  with check (
    auth.uid() is not null
    and project_id is not null
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = locations.project_id
        and pm.user_id = auth.uid()
        and pm.role in ('Owner', 'Administrator')
    )
  );

create policy "locations_delete_owner_coowner"
  on public.locations
  for delete
  using (
    auth.uid() is not null
    and project_id is not null
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = locations.project_id
        and pm.user_id = auth.uid()
        and pm.role in ('Owner', 'Administrator')
    )
  );

