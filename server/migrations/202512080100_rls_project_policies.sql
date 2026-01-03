-- Enable RLS on core tables
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

-- Helper comments:
-- Role hierarchy (project_members.role):
--   owner / co-owner : full control
--   collaborator     : read + insert photos
--   viewer           : read-only

-- PROJECTS -------------------------------------------------------------------
DROP POLICY IF EXISTS projects_select_members ON public.projects;
CREATE POLICY projects_select_members ON public.projects
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = projects.id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner','co-owner','collaborator','viewer')
  )
);

DROP POLICY IF EXISTS projects_modify_owner ON public.projects;
CREATE POLICY projects_modify_owner ON public.projects
FOR UPDATE, DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = projects.id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner','co-owner')
  )
);

-- Allow inserts only via service role; no end-user insert policy to avoid bypass.

-- PROJECT MEMBERS -------------------------------------------------------------
DROP POLICY IF EXISTS project_members_select_members ON public.project_members;
CREATE POLICY project_members_select_members ON public.project_members
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = project_members.project_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner','co-owner','collaborator','viewer')
  )
);

DROP POLICY IF EXISTS project_members_manage_owner ON public.project_members;
CREATE POLICY project_members_manage_owner ON public.project_members
FOR INSERT, UPDATE, DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = project_members.project_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner','co-owner')
  )
);

-- PHOTOS ---------------------------------------------------------------------
DROP POLICY IF EXISTS photos_select_members ON public.photos;
CREATE POLICY photos_select_members ON public.photos
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = photos.project_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner','co-owner','collaborator','viewer')
  )
);

DROP POLICY IF EXISTS photos_insert_collab ON public.photos;
CREATE POLICY photos_insert_collab ON public.photos
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = photos.project_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner','co-owner','collaborator')
  )
);

DROP POLICY IF EXISTS photos_update_owner ON public.photos;
CREATE POLICY photos_update_owner ON public.photos
FOR UPDATE, DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = photos.project_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner','co-owner')
  )
);

-- LOCATIONS ------------------------------------------------------------------
-- Access to locations is allowed only if the user has membership in a project
-- that references the location via photos. Insert allowed for collaborators+
-- so uploads can create locations.

DROP POLICY IF EXISTS locations_select_members ON public.locations;
CREATE POLICY locations_select_members ON public.locations
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.photos p
    JOIN public.project_members pm ON pm.project_id = p.project_id
    WHERE p.location_id = locations.id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner','co-owner','collaborator','viewer')
  )
);

DROP POLICY IF EXISTS locations_insert_collab ON public.locations;
CREATE POLICY locations_insert_collab ON public.locations
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.user_id = auth.uid()
      AND pm.role IN ('owner','co-owner','collaborator')
  )
);

DROP POLICY IF EXISTS locations_update_owner ON public.locations;
CREATE POLICY locations_update_owner ON public.locations
FOR UPDATE, DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.photos p
    JOIN public.project_members pm ON pm.project_id = p.project_id
    WHERE p.location_id = locations.id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner','co-owner')
  )
);

