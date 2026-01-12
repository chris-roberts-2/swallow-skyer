-- Task 4.a.1 – Supabase RLS & Permission Policies
--
-- This migration enables row-level security and defines the access policies
-- for the collaborative project workflow across projects, project_members,
-- photos, and locations.  Roles are enforced according to the following rules:
--   • owners & co-owners … full read/write/delete inside their project
--   • collaborators … read, insert photos/locations, update only their photos
--   • viewers … read-only
--   • non-members … no access

-- Ensure RLS is enabled on all participating tables
alter table if exists public.projects        enable row level security;
alter table if exists public.project_members enable row level security;
alter table if exists public.photos          enable row level security;
alter table if exists public.locations       enable row level security;
alter table if exists public.users           enable row level security;

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
        and exists (
          select 1
          from public.users u
          where u.id = pm.user_id
            and u.auth_user_id = auth.uid()
        )
    )
  );

create policy "projects_insert_owner"
  on public.projects
  for insert
  with check (
    auth.uid() is not null
    and owner_id = (
      select u.id
      from public.users u
      where u.auth_user_id = auth.uid()
      limit 1
    )
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
        and exists (
          select 1
          from public.users u
          where u.id = pm.user_id
            and u.auth_user_id = auth.uid()
        )
        and pm.role in ('owner', 'co-owner')
    )
  )
  with check (
    auth.uid() is not null
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = projects.id
        and exists (
          select 1
          from public.users u
          where u.id = pm.user_id
            and u.auth_user_id = auth.uid()
        )
        and pm.role in ('owner', 'co-owner')
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
        and exists (
          select 1
          from public.users u
          where u.id = pm.user_id
            and u.auth_user_id = auth.uid()
        )
        and pm.role in ('owner', 'co-owner')
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
        and exists (
          select 1
          from public.users u
          where u.id = pm.user_id
            and u.auth_user_id = auth.uid()
        )
    )
  );

create policy "project_members_insert_owner_coowner"
  on public.project_members
  for insert
  with check (
    auth.uid() is not null
    and (
      -- Existing owner/co-owner managing membership
      exists (
        select 1
        from public.project_members pm
        where pm.project_id = project_members.project_id
          and exists (
            select 1
            from public.users u
            where u.id = pm.user_id
              and u.auth_user_id = auth.uid()
          )
          and pm.role in ('owner', 'co-owner')
      )
      -- Seed owner membership immediately after project creation
      or (
        project_members.role in ('owner', 'co-owner')
        and project_members.user_id = (
          select u.id
          from public.users u
          where u.auth_user_id = auth.uid()
          limit 1
        )
        and exists (
          select 1
          from public.projects p
          where p.id = project_members.project_id
            and p.owner_id = (
              select u.id
              from public.users u
              where u.auth_user_id = auth.uid()
              limit 1
            )
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
        and exists (
          select 1
          from public.users u
          where u.id = pm.user_id
            and u.auth_user_id = auth.uid()
        )
        and pm.role in ('owner', 'co-owner')
    )
  )
  with check (
    auth.uid() is not null
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = project_members.project_id
        and exists (
          select 1
          from public.users u
          where u.id = pm.user_id
            and u.auth_user_id = auth.uid()
        )
        and pm.role in ('owner', 'co-owner')
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
        and exists (
          select 1
          from public.users u
          where u.id = pm.user_id
            and u.auth_user_id = auth.uid()
        )
        and pm.role in ('owner', 'co-owner')
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
        and exists (
          select 1
          from public.users u
          where u.id = pm.user_id
            and u.auth_user_id = auth.uid()
        )
    )
  );

create policy "photos_insert_allowed_roles"
  on public.photos
  for insert
  with check (
    auth.uid() is not null
    and project_id is not null
    and user_id = (
      select u.id
      from public.users u
      where u.auth_user_id = auth.uid()
      limit 1
    )
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = photos.project_id
        and exists (
          select 1
          from public.users u
          where u.id = pm.user_id
            and u.auth_user_id = auth.uid()
        )
        and pm.role in ('owner', 'co-owner', 'collaborator')
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
          and exists (
            select 1
            from public.users u
            where u.id = pm.user_id
              and u.auth_user_id = auth.uid()
          )
          and pm.role in ('owner', 'co-owner')
      )
      or (
        photos.user_id = (
          select u.id
          from public.users u
          where u.auth_user_id = auth.uid()
          limit 1
        )
        and exists (
          select 1
          from public.project_members pm
          where pm.project_id = photos.project_id
            and exists (
              select 1
              from public.users u
              where u.id = pm.user_id
                and u.auth_user_id = auth.uid()
            )
            and pm.role = 'collaborator'
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
          and exists (
            select 1
            from public.users u
            where u.id = pm.user_id
              and u.auth_user_id = auth.uid()
          )
          and pm.role in ('owner', 'co-owner')
      )
      or (
        photos.user_id = (
          select u.id
          from public.users u
          where u.auth_user_id = auth.uid()
          limit 1
        )
        and exists (
          select 1
          from public.project_members pm
          where pm.project_id = photos.project_id
            and exists (
              select 1
              from public.users u
              where u.id = pm.user_id
                and u.auth_user_id = auth.uid()
            )
            and pm.role = 'collaborator'
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
        and exists (
          select 1
          from public.users u
          where u.id = pm.user_id
            and u.auth_user_id = auth.uid()
        )
        and pm.role in ('owner', 'co-owner')
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
        and exists (
          select 1
          from public.users u
          where u.id = pm.user_id
            and u.auth_user_id = auth.uid()
        )
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
        and exists (
          select 1
          from public.users u
          where u.id = pm.user_id
            and u.auth_user_id = auth.uid()
        )
        and pm.role in ('owner', 'co-owner', 'collaborator')
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
        and exists (
          select 1
          from public.users u
          where u.id = pm.user_id
            and u.auth_user_id = auth.uid()
        )
        and pm.role in ('owner', 'co-owner')
    )
  )
  with check (
    auth.uid() is not null
    and project_id is not null
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = locations.project_id
        and exists (
          select 1
          from public.users u
          where u.id = pm.user_id
            and u.auth_user_id = auth.uid()
        )
        and pm.role in ('owner', 'co-owner')
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
        and exists (
          select 1
          from public.users u
          where u.id = pm.user_id
            and u.auth_user_id = auth.uid()
        )
        and pm.role in ('owner', 'co-owner')
    )
  );

