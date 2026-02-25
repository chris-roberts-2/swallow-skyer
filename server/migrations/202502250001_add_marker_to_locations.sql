-- Adds a marker column to public.locations to distinguish project-pin markers
-- from photo-generated markers, and adds an index for efficient project-pin lookup.

ALTER TABLE public.locations
    ADD COLUMN IF NOT EXISTS marker TEXT NOT NULL DEFAULT 'photo';

CREATE INDEX IF NOT EXISTS idx_locations_project_marker
    ON public.locations (project_id, marker)
    WHERE marker = 'project';
