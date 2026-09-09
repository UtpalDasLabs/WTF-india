-- How a reader reacts to a project, without needing an account.
--
-- Asking someone to sign up before they can react is where the interest dies,
-- so a reaction is keyed to a random id the browser generates and keeps. That
-- id is not a person and cannot be verified, which is the honest trade: anyone
-- determined enough can inflate a count.
--
-- The blast radius of that is deliberately small. Reactions carry no weight in
-- what Trending ranks — that stays anchored on the project's own promised date
-- and the money on it — so the worst a brigade achieves is a wrong emoji count
-- next to a delay it cannot argue with.

CREATE TABLE IF NOT EXISTS public.project_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects ON DELETE CASCADE,
  -- Stored as a name, not an emoji, so the glyphs can be changed in the app
  -- without rewriting the data.
  reaction text NOT NULL CHECK (reaction IN ('facepalm', 'doubt', 'outrage', 'again')),
  voter_id text NOT NULL CHECK (char_length(voter_id) BETWEEN 16 AND 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- One of each reaction per browser per project.
  UNIQUE (project_id, reaction, voter_id)
);

CREATE INDEX IF NOT EXISTS project_reactions_project_idx
  ON public.project_reactions (project_id);

ALTER TABLE public.project_reactions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.project_reactions TO service_role;

-- No direct table access for readers at all. Counting happens through the view
-- below and writing through the function below, so a voter id never leaves the
-- database and cannot be used to delete somebody else's reaction.
REVOKE ALL ON public.project_reactions FROM anon, authenticated;

CREATE OR REPLACE VIEW public.project_reaction_counts
WITH (security_invoker = off) AS
  SELECT project_id, reaction, count(*)::int AS total
  FROM public.project_reactions
  GROUP BY project_id, reaction;

GRANT SELECT ON public.project_reaction_counts TO anon, authenticated;

-- Toggling is a single round trip, and returns whether the reaction is now on,
-- so the caller can settle its optimistic state against the truth.
CREATE OR REPLACE FUNCTION public.toggle_reaction(
  _project uuid,
  _reaction text,
  _voter text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deleted int;
BEGIN
  IF _reaction NOT IN ('facepalm', 'doubt', 'outrage', 'again') THEN
    RAISE EXCEPTION 'unknown reaction';
  END IF;
  IF char_length(_voter) NOT BETWEEN 16 AND 64 THEN
    RAISE EXCEPTION 'bad voter id';
  END IF;
  -- Only ever reacts to a project a reader can already see.
  IF NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = _project AND p.published) THEN
    RAISE EXCEPTION 'no such project';
  END IF;

  DELETE FROM public.project_reactions
  WHERE project_id = _project AND reaction = _reaction AND voter_id = _voter;
  GET DIAGNOSTICS _deleted = ROW_COUNT;
  IF _deleted > 0 THEN
    RETURN false;
  END IF;

  INSERT INTO public.project_reactions (project_id, reaction, voter_id)
  VALUES (_project, _reaction, _voter)
  ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_reaction(uuid, text, text) TO anon, authenticated;
