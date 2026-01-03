-- Add show_on_photos flag to photos for soft-hide on Photos/Map tabs
alter table public.photos
add column if not exists show_on_photos boolean not null default true;

-- Backfill existing rows
update public.photos set show_on_photos = true where show_on_photos is null;

