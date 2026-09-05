-- 1. Community-submitted candidates share the reviewer queue with agent findings
ALTER TABLE public.candidate_projects
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'agent',
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitter_name text,
  ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS location_text text,
  ADD COLUMN IF NOT EXISTS observed_condition text,
  ADD COLUMN IF NOT EXISTS completion_date date,
  ADD COLUMN IF NOT EXISTS approximate_date_note text,
  ADD COLUMN IF NOT EXISTS photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS moderation_label text,
  ADD COLUMN IF NOT EXISTS moderation_state public.moderation_state NOT NULL DEFAULT 'visible',
  ADD COLUMN IF NOT EXISTS moderation_notes text;

ALTER TABLE public.candidate_projects
  DROP CONSTRAINT IF EXISTS candidate_projects_origin_check;
ALTER TABLE public.candidate_projects
  ADD CONSTRAINT candidate_projects_origin_check CHECK (origin IN ('agent', 'community'));

CREATE INDEX IF NOT EXISTS candidate_projects_submitted_by_idx
  ON public.candidate_projects (submitted_by);

DROP POLICY IF EXISTS "Members submit community candidates" ON public.candidate_projects;
CREATE POLICY "Members submit community candidates"
  ON public.candidate_projects FOR INSERT TO authenticated
  WITH CHECK (
    origin = 'community'
    AND submitted_by = auth.uid()
    AND review_state = 'discovered'
    AND published_project_id IS NULL
  );

DROP POLICY IF EXISTS "Members read own community candidates" ON public.candidate_projects;
CREATE POLICY "Members read own community candidates"
  ON public.candidate_projects FOR SELECT TO authenticated
  USING (submitted_by = auth.uid());

-- 2. Projects remember whether the listing began as a community report
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS source_origin text NOT NULL DEFAULT 'official',
  ADD COLUMN IF NOT EXISTS community_note text;

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_source_origin_check;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_source_origin_check CHECK (source_origin IN ('official', 'community'));

-- 3. Reviews can carry a community-reported present-day condition
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS condition text;
ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_condition_check;
ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_condition_check
  CHECK (condition IS NULL OR condition IN ('good', 'mixed', 'poor'));

DROP VIEW IF EXISTS public.reviews_public;
CREATE VIEW public.reviews_public
WITH (security_invoker = true) AS
  SELECT r.id,
    r.project_id,
    r.rating,
    r.masked_body,
    r.moderation_label,
    r.moderation_state,
    r.created_at,
    r.is_anonymous,
    r.condition,
    CASE WHEN r.is_anonymous THEN NULL::text ELSE r.author_name END AS author_name
  FROM public.reviews r
  JOIN public.projects p ON p.id = r.project_id
  WHERE r.moderation_state = 'visible'::public.moderation_state AND p.published;

GRANT SELECT ON public.reviews_public TO anon, authenticated;
GRANT ALL ON public.reviews_public TO service_role;