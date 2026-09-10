-- Reactions, follows and notes belong to the account too, not only the browser.
--
-- The previous migration did this for posts. Everything else a reader does was
-- still keyed to the browser alone, which showed up as three separate oddities:
-- a facepalm tapped on the phone came back grey on the laptop, a followed
-- project looked unfollowed there, and re-submitting a note from a second
-- browser wrote a second note instead of editing the first.
--
-- Ownership is now either identity: the browser that did it, or the account
-- signed in at the time. Anonymous use is unchanged — no account, no user_id,
-- and the device id keeps working exactly as before.

ALTER TABLE public.project_reactions
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.project_follows
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.community_notes
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- One reaction, one follow and one note per account, not per browser. Partial,
-- so the anonymous rows (user_id IS NULL) stay governed by the device-keyed
-- constraints they already have and are not collapsed into one another.
CREATE UNIQUE INDEX IF NOT EXISTS project_reactions_account_idx
  ON public.project_reactions (project_id, reaction, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS project_follows_account_idx
  ON public.project_follows (project_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS community_notes_account_idx
  ON public.community_notes (post_id, user_id) WHERE user_id IS NOT NULL;

-- Tapping again from a second browser has to undo, not double-count, so the
-- delete matches on either identity before the insert is considered.
CREATE OR REPLACE FUNCTION public.toggle_reaction(_project uuid, _reaction text, _voter text)
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
  IF NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = _project AND p.published) THEN
    RAISE EXCEPTION 'no such project';
  END IF;

  DELETE FROM public.project_reactions
  WHERE project_id = _project AND reaction = _reaction
    AND (voter_id = _voter OR (user_id IS NOT NULL AND user_id = auth.uid()));
  GET DIAGNOSTICS _deleted = ROW_COUNT;
  IF _deleted > 0 THEN
    RETURN false;
  END IF;

  INSERT INTO public.project_reactions (project_id, reaction, voter_id, user_id)
  VALUES (_project, _reaction, _voter, auth.uid())
  ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;

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
  WHERE project_id = _project
    AND (device_id = _device OR (user_id IS NOT NULL AND user_id = auth.uid()));
  GET DIAGNOSTICS _deleted = ROW_COUNT;
  IF _deleted > 0 THEN
    RETURN false;
  END IF;

  INSERT INTO public.project_follows (project_id, device_id, user_id)
  VALUES (_project, _device, auth.uid())
  ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.my_follows(_device text)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT project_id FROM public.project_follows
  WHERE (device_id = _device AND char_length(_device) BETWEEN 16 AND 64)
     OR (user_id IS NOT NULL AND user_id = auth.uid());
$$;

-- What the rail reads on load, so a face lit on one device is lit on the next.
CREATE OR REPLACE FUNCTION public.my_reactions(_device text)
RETURNS TABLE (project_id uuid, reaction text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.project_id, r.reaction FROM public.project_reactions r
  WHERE (r.voter_id = _device AND char_length(_device) BETWEEN 16 AND 64)
     OR (r.user_id IS NOT NULL AND r.user_id = auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.my_reactions(text) TO anon, authenticated;

-- An upsert on (post_id, device_id) could not see the account, so a second
-- browser wrote a second note. Update by either identity first; insert only if
-- there was nothing to update.
CREATE OR REPLACE FUNCTION public.add_note(_post uuid, _device text, _body text, _source_url text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _url text;
BEGIN
  IF char_length(_device) NOT BETWEEN 16 AND 64 THEN
    RAISE EXCEPTION 'bad device id';
  END IF;
  IF char_length(btrim(_body)) < 10 THEN
    RAISE EXCEPTION 'a note needs to say something';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.project_posts WHERE id = _post AND state = 'visible') THEN
    RAISE EXCEPTION 'no such post';
  END IF;
  _url := nullif(btrim(coalesce(_source_url, '')), '');

  UPDATE public.community_notes
  SET body = btrim(_body), source_url = _url
  WHERE post_id = _post
    AND (device_id = _device OR (user_id IS NOT NULL AND user_id = auth.uid()))
  RETURNING id INTO _id;
  IF _id IS NOT NULL THEN
    RETURN _id;
  END IF;

  INSERT INTO public.community_notes (post_id, body, source_url, device_id, user_id)
  VALUES (_post, btrim(_body), _url, _device, auth.uid())
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

-- Nobody grades their own homework — and now that holds across the writer's
-- browsers, not just the one they wrote from.
CREATE OR REPLACE FUNCTION public.rate_note(_note uuid, _device text, _helpful boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF char_length(_device) NOT BETWEEN 16 AND 64 THEN
    RAISE EXCEPTION 'bad device id';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.community_notes
    WHERE id = _note
      AND (device_id = _device OR (user_id IS NOT NULL AND user_id = auth.uid()))
  ) THEN
    RAISE EXCEPTION 'you wrote this note';
  END IF;
  INSERT INTO public.community_note_ratings (note_id, device_id, helpful)
  VALUES (_note, _device, _helpful)
  ON CONFLICT (note_id, device_id) DO UPDATE SET helpful = excluded.helpful;
END;
$$;

-- Replaces claim_posts: signing in adopts everything this browser has done.
--
-- Still only rows with no account yet, and only from the device asking, so
-- signing in can never take over somebody else's activity. Rows that would
-- collide with what the account already has from another browser are skipped —
-- the account's existing reaction or follow stands and the duplicate is left
-- keyed to its device, rather than the claim failing outright.
CREATE OR REPLACE FUNCTION public.claim_activity(_device text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _total integer := 0;
  _rows integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 0;
  END IF;
  IF char_length(_device) NOT BETWEEN 16 AND 64 THEN
    RAISE EXCEPTION 'bad device id';
  END IF;

  UPDATE public.project_posts SET user_id = auth.uid()
  WHERE device_id = _device AND user_id IS NULL;
  GET DIAGNOSTICS _rows = ROW_COUNT; _total := _total + _rows;

  UPDATE public.project_reactions r SET user_id = auth.uid()
  WHERE r.voter_id = _device AND r.user_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.project_reactions other
      WHERE other.project_id = r.project_id AND other.reaction = r.reaction
        AND other.user_id = auth.uid()
    );
  GET DIAGNOSTICS _rows = ROW_COUNT; _total := _total + _rows;

  UPDATE public.project_follows f SET user_id = auth.uid()
  WHERE f.device_id = _device AND f.user_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.project_follows other
      WHERE other.project_id = f.project_id AND other.user_id = auth.uid()
    );
  GET DIAGNOSTICS _rows = ROW_COUNT; _total := _total + _rows;

  UPDATE public.community_notes n SET user_id = auth.uid()
  WHERE n.device_id = _device AND n.user_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.community_notes other
      WHERE other.post_id = n.post_id AND other.user_id = auth.uid()
    );
  GET DIAGNOSTICS _rows = ROW_COUNT; _total := _total + _rows;

  RETURN _total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_activity(text) TO authenticated;
DROP FUNCTION IF EXISTS public.claim_posts(text);

-- The timeline reads the same way: mine is whatever either identity did.
CREATE OR REPLACE FUNCTION public.my_activity(_device text)
RETURNS TABLE (
  kind text,
  happened_at timestamptz,
  project_id uuid,
  project_name text,
  detail text,
  post_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (SELECT auth.uid() AS uid, _device AS device),
  mine AS (
    SELECT p.kind, p.created_at AS happened_at, p.project_id, pr.name AS project_name,
           coalesce(p.body, '') AS detail, p.id AS post_id
    FROM public.project_posts p
    JOIN public.projects pr ON pr.id = p.project_id, me
    WHERE p.device_id = me.device OR (p.user_id IS NOT NULL AND p.user_id = me.uid)

    UNION ALL

    SELECT 'note', n.created_at, p.project_id, pr.name, n.body, n.post_id
    FROM public.community_notes n
    JOIN public.project_posts p ON p.id = n.post_id
    JOIN public.projects pr ON pr.id = p.project_id, me
    WHERE n.device_id = me.device OR (n.user_id IS NOT NULL AND n.user_id = me.uid)

    UNION ALL

    SELECT 'reaction', r.created_at, r.project_id, pr.name, r.reaction, NULL::uuid
    FROM public.project_reactions r
    JOIN public.projects pr ON pr.id = r.project_id, me
    WHERE r.voter_id = me.device OR (r.user_id IS NOT NULL AND r.user_id = me.uid)

    UNION ALL

    SELECT 'spot', a.created_at, a.project_id, pr.name, '', NULL::uuid
    FROM public.community_spot_authors a
    JOIN public.projects pr ON pr.id = a.project_id, me
    WHERE a.device_id = me.device
  )
  SELECT kind, happened_at, project_id, project_name, detail, post_id
  FROM mine
  WHERE char_length(_device) BETWEEN 16 AND 64
  ORDER BY happened_at DESC
  LIMIT 200;
$$;
