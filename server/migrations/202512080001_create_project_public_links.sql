CREATE TABLE IF NOT EXISTS public.project_public_links (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    token text NOT NULL UNIQUE,
    expires_at timestamptz NULL,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_public_links_project_id ON public.project_public_links(project_id);

