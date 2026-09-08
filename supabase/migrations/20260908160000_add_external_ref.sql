-- A stable identity for rows that come from an outside publication.
--
-- The MoSPI flash report is republished every month with the same projects in
-- it, so an importer with no identity column would either duplicate every
-- project monthly or have to match on name — and project names in that report
-- drift ("Ph-II" becomes "Phase-II", a district gets appended). The reference
-- is built from the publisher plus the project's own serial number and name,
-- so a re-run updates the row it created last time.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS external_ref text;

CREATE UNIQUE INDEX IF NOT EXISTS projects_external_ref_key
  ON public.projects (external_ref)
  WHERE external_ref IS NOT NULL;

COMMENT ON COLUMN public.projects.external_ref IS
  'Stable key for an imported project, e.g. mospi:<serial>:<name-slug>. Null for anything entered by hand.';

-- Time overrun in months, as the source reports it. Kept separate from the dates
-- because the report sometimes publishes the overrun for a project whose revised
-- date is blank, and a figure the agency itself published is worth keeping even
-- when we cannot recompute it.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS time_overrun_months integer;

COMMENT ON COLUMN public.projects.time_overrun_months IS
  'Delay in months as published by the reporting agency. Never derived here.';
