-- Create photos table
create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  r2_key text not null,
  url text not null,
  latitude double precision,
  longitude double precision,
  taken_at timestamptz,
  created_at timestamptz default now()
);

-- Create index on user_id for faster queries
create index if not exists idx_photos_user_id on photos(user_id);

-- Create index on location for spatial queries
create index if not exists idx_photos_location on photos(latitude, longitude);

-- Create index on taken_at for temporal queries
create index if not exists idx_photos_taken_at on photos(taken_at);

-- Enable Row Level Security
alter table photos enable row level security;

-- Create policy: Users can view their own photos
create policy "Users can view their own photos"
  on photos for select
  using (auth.uid() = user_id);

-- Create policy: Users can insert their own photos
create policy "Users can insert their own photos"
  on photos for insert
  with check (auth.uid() = user_id);

-- Create policy: Users can update their own photos
create policy "Users can update their own photos"
  on photos for update
  using (auth.uid() = user_id);

-- Create policy: Users can delete their own photos
create policy "Users can delete their own photos"
  on photos for delete
  using (auth.uid() = user_id);

