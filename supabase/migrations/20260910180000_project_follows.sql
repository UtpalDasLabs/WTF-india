-- Who is keeping an eye on what.
--
-- Following used to live only in localStorage, which was right while it was a
-- private bookmark. It stops being right the moment the button has to say how
-- many other people are watching too: a count that only counts you is not a
-- count. So follows move to the database, keyed to the same device id as
-- everything else in the community layer, and the browser keeps its copy as an
-- optimistic mirror so the button still answers instantly and offline.
--
-- Same posture as reactions throughout: readers touch no table. The count comes
-- from a view that cannot name who follows what, and writing goes through one
-- function, so a device id neither travels on the wire nor unfollows anybody
-- else's projects.

CREATE TABLE IF NOT EXISTS public.project_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects ON DELETE CASCADE,
  device_id text NOT NULL CHECK (char_length(device_id) BETWEEN 16 AND 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, device_id)
);

CREATE INDEX IF NOT EXISTS project_follows_project_idx ON public.project_follows (project_id);
CREATE INDEX IF NOT EXISTS project_follows_device_idx ON public.project_follows (device_id);

ALTER TABLE public.project_follows ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.project_follows TO service_role;
REVOKE ALL ON public.project_follows FROM anon, authenticated;

CREATE OR REPLACE VIEW public.project_follow_counts
WITH (security_invoker = off) AS
  SELECT project_id, count(*)::int AS total
  FROM public.project_follows
  GROUP BY project_id;

GRANT SELECT ON public.project_follow_counts TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.toggle_follow(_project uuid, _device text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deleted int;
BEGIN
  IF char_length(_device) NOT BETWEEN 16 AND 64 THEN
    RAISE EXCEPTION 'bad device id';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = _project AND p.published) THEN
    RAISE EXCEPTION 'no such project';
  END IF;

  DELETE FROM public.project_follows
  WHERE project_id = _project AND device_id = _device;
  GET DIAGNOSTICS _deleted = ROW_COUNT;
  IF _deleted > 0 THEN
    RETURN false;
  END IF;

  INSERT INTO public.project_follows (project_id, device_id)
  VALUES (_project, _device)
  ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_follow(uuid, text) TO anon, authenticated;

-- So a browser that has lost its localStorage, or a second device, can be told
-- what it already follows rather than starting again from nothing.
CREATE OR REPLACE FUNCTION public.my_follows(_device text)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT project_id FROM public.project_follows
  WHERE device_id = _device AND char_length(_device) BETWEEN 16 AND 64;
$$;

GRANT EXECUTE ON FUNCTION public.my_follows(text) TO anon, authenticated;
