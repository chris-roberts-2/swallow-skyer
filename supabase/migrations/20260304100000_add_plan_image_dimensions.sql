-- Add image_width and image_height for rasterized plan pixel dimensions
-- Used by frontend calibration workflow (pixel coordinate system)

alter table public.project_plans
  add column if not exists image_width integer,
  add column if not exists image_height integer;
