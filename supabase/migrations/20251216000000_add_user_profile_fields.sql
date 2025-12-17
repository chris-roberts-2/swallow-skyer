-- Add profile fields to public.users for names and company
alter table public.users
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists company text;

comment on column public.users.first_name is 'User given/first name';
comment on column public.users.last_name is 'User family/last name';
comment on column public.users.company is 'Optional company/organization';

