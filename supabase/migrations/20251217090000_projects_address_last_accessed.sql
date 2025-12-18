-- Remove deprecated description column and add address to projects
alter table public.projects
  drop column if exists description,
  add column if not exists address text;

-- Track last access per user per project
alter table public.project_members
  add column if not exists last_accessed_at timestamptz;

-- Optional: seed last_accessed_at with created_at when missing
update public.project_members
  set last_accessed_at = coalesce(last_accessed_at, created_at, now());

