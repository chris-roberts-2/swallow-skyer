-- Create project_plans table for georeferenced plan overlays
-- One plan per project (unique project_id)

create table if not exists public.project_plans (
  project_id uuid primary key references public.projects (id) on delete cascade,
  r2_path text not null,
  file_name text not null,
  file_type text not null,
  file_size integer not null default 0,
  user_id uuid not null references public.users (id),
  width integer,
  height integer,
  min_lat double precision not null,
  min_lng double precision not null,
  max_lat double precision not null,
  max_lng double precision not null,
  created_at timestamptz not null default timezone('UTC', now()),
  updated_at timestamptz not null default timezone('UTC', now())
);

create index if not exists project_plans_project_idx on public.project_plans (project_id);

alter table public.project_plans enable row level security;

-- Project members can read plans
create policy "project_plans_select_members"
  on public.project_plans
  for select
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = project_plans.project_id
        and pm.user_id = auth.uid()
    )
  );

-- Owners and Administrators can insert plans
create policy "project_plans_insert_owner_admin"
  on public.project_plans
  for insert
  with check (
    auth.uid() is not null
    and user_id = auth.uid()
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = project_plans.project_id
        and pm.user_id = auth.uid()
        and pm.role in ('Owner', 'Administrator')
    )
  );

-- Owners and Administrators can update plans
create policy "project_plans_update_owner_admin"
  on public.project_plans
  for update
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = project_plans.project_id
        and pm.user_id = auth.uid()
        and pm.role in ('Owner', 'Administrator')
    )
  )
  with check (
    auth.uid() is not null
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = project_plans.project_id
        and pm.user_id = auth.uid()
        and pm.role in ('Owner', 'Administrator')
    )
  );

-- Owners and Administrators can delete plans
create policy "project_plans_delete_owner_admin"
  on public.project_plans
  for delete
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.project_members pm
      where pm.project_id = project_plans.project_id
        and pm.user_id = auth.uid()
        and pm.role in ('Owner', 'Administrator')
    )
  );
