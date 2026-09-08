-- Records what a project was ORIGINALLY sanctioned for, alongside what it is now
-- expected to cost and finish.
--
-- Without this the app can say "1,340 days late" but not "218% over budget", and
-- the overrun figure is the more damning of the two. It is also the shape every
-- Indian project-monitoring source publishes: MoSPI's flash reports are built
-- entirely around original vs revised/anticipated cost and completion date.
--
-- The existing budget_inr stays as the headline "money set aside" figure so
-- nothing that reads it today has to change. These columns are additive and
-- nullable: a project we have no revision data for simply has none, rather than
-- a guessed value.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS original_cost_inr bigint,
  ADD COLUMN IF NOT EXISTS revised_cost_inr bigint,
  ADD COLUMN IF NOT EXISTS original_end_date date,
  ADD COLUMN IF NOT EXISTS revised_end_date date;

COMMENT ON COLUMN public.projects.original_cost_inr IS
  'Cost in the original sanction order. Never estimated — null if unpublished.';
COMMENT ON COLUMN public.projects.revised_cost_inr IS
  'Latest revised or anticipated completion cost, as reported by the agency.';
COMMENT ON COLUMN public.projects.original_end_date IS
  'Completion date in the original sanction order.';
COMMENT ON COLUMN public.projects.revised_end_date IS
  'Latest revised or anticipated completion date, as reported by the agency.';

-- Cost overrun as a percentage of the original sanction, computed once in the
-- database so every surface agrees. Null unless both figures are published and
-- the original is non-zero, so a missing figure can never read as 0% overrun.
CREATE OR REPLACE FUNCTION public.cost_overrun_pct(
  _original bigint,
  _revised bigint
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _original IS NULL OR _revised IS NULL OR _original <= 0 THEN NULL
    ELSE round(((_revised - _original)::numeric / _original) * 100, 1)
  END
$$;

-- The Hall of Shame is sorted on these, and the table is about to get large.
CREATE INDEX IF NOT EXISTS projects_revised_end_date_idx
  ON public.projects (revised_end_date)
  WHERE published;

CREATE INDEX IF NOT EXISTS projects_status_published_idx
  ON public.projects (status)
  WHERE published;
