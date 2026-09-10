-- A post belongs to the account that wrote it, as well as to the browser.
--
-- The community layer was built device-first on purpose: you can react, post
-- and photograph without ever signing in, and that is worth keeping. But it
-- meant an account had no bearing on ownership at all. Somebody who signed in,
-- posted from their phone, then opened the site on a laptop found no delete
-- button on their own post — the laptop is a different browser with a different
-- device id, and the account they were signed into counted for nothing.
--
-- Ownership is now either: the browser that wrote it, or the account that was
-- signed in at the time. Anonymous posting is unchanged. Nothing becomes less
-- private — an anonymous post still carries no account — and the public view
-- still exposes neither.

ALTER TABLE public.project_posts
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS project_posts_user_idx ON public.project_posts (user_id);

-- Records the account, when there is one.
CREATE OR REPLACE FUNCTION public.create_post(
  _project uuid,
  _kind text,
  _device text,
  _body text DEFAULT NULL,
  _photo_path text DEFAULT NULL,
  _lat double precision DEFAULT NULL,
  _lng double precision DEFAULT NULL,
  _taken_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  IF _kind NOT IN ('photo', 'comment') THEN
    RAISE EXCEPTION 'unknown post kind';
  END IF;
  IF char_length(_device) NOT BETWEEN 16 AND 64 THEN
    RAISE EXCEPTION 'bad device id';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = _project AND published) THEN
    RAISE EXCEPTION 'no such project';
  END IF;
  PERFORM public.assert_within_rate(_device);

  INSERT INTO public.project_posts
    (project_id, kind, body, photo_path, latitude, longitude, taken_at, device_id, user_id)
  VALUES (
    _project,
    _kind,
    nullif(btrim(coalesce(_body, '')), ''),
    _photo_path,
    -- Three decimals is about 100 m. Anything finer is somebody's front door.
    round(_lat::numeric, 3)::double precision,
    round(_lng::numeric, 3)::double precision,
    _taken_at,
    _device,
    auth.uid()
  )
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

-- Either identity will do, and a stranger with neither still cannot.
CREATE OR REPLACE FUNCTION public.delete_own_post(_post uuid, _device text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rows integer;
BEGIN
  DELETE FROM public.project_posts
  WHERE id = _post
    AND (
      device_id = _device
      OR (user_id IS NOT NULL AND user_id = auth.uid())
    );
  GET DIAGNOSTICS _rows = ROW_COUNT;
  RETURN _rows > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.my_post_ids(_device text)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.project_posts
  WHERE (device_id = _device AND char_length(_device) BETWEEN 16 AND 64)
     OR (user_id IS NOT NULL AND user_id = auth.uid());
$$;

-- Signing in adopts what this browser already wrote.
--
-- Only rows with no account yet, and only from the device asking, so signing in
-- can never take over somebody else's posts. It is what makes the history a
-- reader built before they had an account follow them to their next phone.
CREATE OR REPLACE FUNCTION public.claim_posts(_device text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rows integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 0;
  END IF;
  IF char_length(_device) NOT BETWEEN 16 AND 64 THEN
    RAISE EXCEPTION 'bad device id';
  END IF;

  UPDATE public.project_posts
  SET user_id = auth.uid()
  WHERE device_id = _device AND user_id IS NULL;
  GET DIAGNOSTICS _rows = ROW_COUNT;
  RETURN _rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_posts(text) TO authenticated;
