-- Add auth_user_id to public.users to link app user rows to Supabase Auth users.
-- This improves semantics by separating:
--   - users.id         (app-level user primary key, referenced by photos/projects/memberships)
--   - users.auth_user_id (Supabase Auth user id, sourced from JWTs)

alter table public.users
  add column if not exists auth_user_id uuid;

comment on column public.users.auth_user_id is 'Supabase Auth user id (from JWT user.id). Unique when present.';

-- Enforce one-to-one mapping between Supabase auth users and app user rows.
-- Partial unique index allows NULL for invited/unregistered users.
create unique index if not exists users_auth_user_id_key
  on public.users (auth_user_id)
  where auth_user_id is not null;

