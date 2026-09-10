-- The community layer: what people say, photograph and dispute about a project.
--
-- Everything here is keyed to a device, not an account. Asking somebody to sign
-- up before they can say anything is where the interest dies, so a random id
-- the browser keeps stands in for a name — the same trade already made for
-- reactions, extended to posts, photographs and notes.
--
-- Three rules hold the line that makes the rest of the app worth reading:
--
--   1. Community content never becomes official content. A post is a post; the
--      project's own figures still come from a government document. Community
--      spots are marked at the row level and carry no money figure at all.
--   2. Nobody reads a device id but the database. Readers see a view; writers
--      go through a function. So a device id can neither be harvested from the
--      wire nor used to delete somebody else's post.
--   3. Posting is live and take-down is public. Anyone can flag; enough flags
--      hide a post automatically; a Twitter-style note can contest one without
--      removing it.

-- ---------------------------------------------------------------------------
-- Who is talking
-- ---------------------------------------------------------------------------

-- A stable, pronounceable name derived from the device id, so a thread reads
-- like a conversation between people rather than between UUIDs. It is a
-- pseudonym and nothing more: the same device is the same handle, and the id
-- behind it never leaves the database.
CREATE OR REPLACE FUNCTION public.handle_for(_device text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT adjective || ' ' || animal || ' ' || suffix
  FROM (
    SELECT
      (ARRAY['Quiet','Restless','Patient','Stubborn','Curious','Sharp','Steady',
             'Wandering','Careful','Blunt','Bright','Weary','Alert','Plain',
             'Dogged','Keen'])[1 + (abs(hashtext(_device || ':a')) % 16)] AS adjective,
      (ARRAY['Peacock','Mongoose','Heron','Nilgai','Langur','Bulbul','Otter',
             'Kingfisher','Gaur','Sarus','Chital','Hornbill','Jackal','Myna',
             'Pangolin','Barasingha'])[1 + (abs(hashtext(_device || ':b')) % 16)] AS animal,
      lpad((abs(hashtext(_device || ':c')) % 1000)::text, 3, '0') AS suffix
  ) parts;
$$;

-- ---------------------------------------------------------------------------
-- Posts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.project_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('photo', 'comment')),
  body text CHECK (body IS NULL OR char_length(body) BETWEEN 1 AND 2000),
  -- A path inside the community-photos bucket, never a whole URL, so the
  -- storage host can move without rewriting rows.
  photo_path text,
  -- Where the photograph says it was taken. Rounded to about 100 m before it is
  -- stored: enough to place it on a road, not enough to place it at a door.
  latitude double precision CHECK (latitude IS NULL OR abs(latitude) <= 90),
  longitude double precision CHECK (longitude IS NULL OR abs(longitude) <= 180),
  taken_at timestamptz,
  device_id text NOT NULL CHECK (char_length(device_id) BETWEEN 16 AND 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Live on arrival. 'hidden' is what enough flags, or a reviewer, does to it.
  state text NOT NULL DEFAULT 'visible' CHECK (state IN ('visible', 'hidden')),
  flag_count integer NOT NULL DEFAULT 0,
  CONSTRAINT project_posts_has_content CHECK (
    (kind = 'photo' AND photo_path IS NOT NULL) OR
    (kind = 'comment' AND body IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS project_posts_project_idx
  ON public.project_posts (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS project_posts_device_idx
  ON public.project_posts (device_id, created_at DESC);

ALTER TABLE public.project_posts ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.project_posts TO service_role;
REVOKE ALL ON public.project_posts FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Flags
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.post_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.project_posts ON DELETE CASCADE,
  device_id text NOT NULL CHECK (char_length(device_id) BETWEEN 16 AND 64),
  reason text CHECK (reason IS NULL OR char_length(reason) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, device_id)
);

ALTER TABLE public.post_flags ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.post_flags TO service_role;
REVOKE ALL ON public.post_flags FROM anon, authenticated;

-- Enough independent devices object and the post goes dark until a reviewer
-- looks. Four is low enough to act quickly on something genuinely ugly and high
-- enough that one annoyed reader cannot silence a photograph.
CREATE OR REPLACE FUNCTION public.apply_flag_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _total integer;
BEGIN
  SELECT count(*) INTO _total FROM public.post_flags WHERE post_id = NEW.post_id;
  UPDATE public.project_posts
  SET flag_count = _total,
      state = CASE WHEN _total >= 4 THEN 'hidden' ELSE state END
  WHERE id = NEW.post_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS post_flags_apply ON public.post_flags;
CREATE TRIGGER post_flags_apply
  AFTER INSERT ON public.post_flags
  FOR EACH ROW EXECUTE FUNCTION public.apply_flag_count();

-- ---------------------------------------------------------------------------
-- Community notes
-- ---------------------------------------------------------------------------

-- A note does not delete a post; it stands next to it. That is the point of the
-- form: a photograph that is real but ten years old is not a lie to be removed,
-- it is a claim that needs a date attached.
CREATE TABLE IF NOT EXISTS public.community_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.project_posts ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 10 AND 1000),
  -- Optional link to something that backs the note up.
  source_url text CHECK (source_url IS NULL OR source_url ~* '^https?://'),
  device_id text NOT NULL CHECK (char_length(device_id) BETWEEN 16 AND 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL DEFAULT 'visible' CHECK (state IN ('visible', 'hidden')),
  UNIQUE (post_id, device_id)
);

CREATE INDEX IF NOT EXISTS community_notes_post_idx ON public.community_notes (post_id);

ALTER TABLE public.community_notes ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.community_notes TO service_role;
REVOKE ALL ON public.community_notes FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.community_note_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES public.community_notes ON DELETE CASCADE,
  device_id text NOT NULL CHECK (char_length(device_id) BETWEEN 16 AND 64),
  helpful boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (note_id, device_id)
);

ALTER TABLE public.community_note_ratings ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.community_note_ratings TO service_role;
REVOKE ALL ON public.community_note_ratings FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- What readers see
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.project_posts_public
WITH (security_invoker = off) AS
  SELECT
    p.id,
    p.project_id,
    p.kind,
    p.body,
    p.photo_path,
    p.latitude,
    p.longitude,
    p.taken_at,
    p.created_at,
    p.flag_count,
    public.handle_for(p.device_id) AS handle
  FROM public.project_posts p
  JOIN public.projects pr ON pr.id = p.project_id AND pr.published
  WHERE p.state = 'visible';

GRANT SELECT ON public.project_posts_public TO anon, authenticated;

-- A note is shown once enough people have judged it and most of them found it
-- helpful. Below that it exists but does not yet speak for the crowd.
CREATE OR REPLACE VIEW public.community_notes_public
WITH (security_invoker = off) AS
  SELECT
    n.id,
    n.post_id,
    n.body,
    n.source_url,
    n.created_at,
    public.handle_for(n.device_id) AS handle,
    count(r.id) FILTER (WHERE r.helpful)::int AS helpful,
    count(r.id) FILTER (WHERE NOT r.helpful)::int AS not_helpful,
    (
      count(r.id) >= 3
      AND count(r.id) FILTER (WHERE r.helpful) * 10 >= count(r.id) * 6
    ) AS shown
  FROM public.community_notes n
  LEFT JOIN public.community_note_ratings r ON r.note_id = n.id
  WHERE n.state = 'visible'
  GROUP BY n.id;

GRANT SELECT ON public.community_notes_public TO anon, authenticated;

-- Post counts for every project at once, so a feed does not ask per card.
CREATE OR REPLACE VIEW public.project_post_counts
WITH (security_invoker = off) AS
  SELECT project_id,
         count(*)::int AS total,
         count(*) FILTER (WHERE kind = 'photo')::int AS photos,
         max(created_at) AS latest
  FROM public.project_posts
  WHERE state = 'visible'
  GROUP BY project_id;

GRANT SELECT ON public.project_post_counts TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- What writers may do
-- ---------------------------------------------------------------------------

-- Anonymous writing needs a ceiling or it is a spam endpoint. This is per
-- device and deliberately generous for a person, useless for a script.
CREATE OR REPLACE FUNCTION public.assert_within_rate(_device text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hour integer;
  _day integer;
BEGIN
  SELECT count(*) INTO _hour FROM public.project_posts
  WHERE device_id = _device AND created_at > now() - interval '1 hour';
  IF _hour >= 15 THEN
    RAISE EXCEPTION 'slow down: too many posts in the last hour';
  END IF;

  SELECT count(*) INTO _day FROM public.project_posts
  WHERE device_id = _device AND created_at > now() - interval '1 day';
  IF _day >= 60 THEN
    RAISE EXCEPTION 'slow down: too many posts today';
  END IF;
END;
$$;

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
    (project_id, kind, body, photo_path, latitude, longitude, taken_at, device_id)
  VALUES (
    _project,
    _kind,
    nullif(btrim(coalesce(_body, '')), ''),
    _photo_path,
    -- Three decimals is about 100 m. Anything finer is somebody's front door.
    round(_lat::numeric, 3)::double precision,
    round(_lng::numeric, 3)::double precision,
    _taken_at,
    _device
  )
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

-- Taking back your own post. The device id is checked inside the function, so
-- knowing somebody else's id is still not enough to delete their post from the
-- client — there is no client path to it at all.
CREATE OR REPLACE FUNCTION public.delete_own_post(_post uuid, _device text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rows integer;
BEGIN
  DELETE FROM public.project_posts WHERE id = _post AND device_id = _device;
  GET DIAGNOSTICS _rows = ROW_COUNT;
  RETURN _rows > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.flag_post(_post uuid, _device text, _reason text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _total integer;
BEGIN
  IF char_length(_device) NOT BETWEEN 16 AND 64 THEN
    RAISE EXCEPTION 'bad device id';
  END IF;
  INSERT INTO public.post_flags (post_id, device_id, reason)
  VALUES (_post, _device, nullif(btrim(coalesce(_reason, '')), ''))
  ON CONFLICT (post_id, device_id) DO NOTHING;
  SELECT count(*) INTO _total FROM public.post_flags WHERE post_id = _post;
  RETURN _total;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_note(
  _post uuid,
  _device text,
  _body text,
  _source_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
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

  INSERT INTO public.community_notes (post_id, body, source_url, device_id)
  VALUES (_post, btrim(_body), nullif(btrim(coalesce(_source_url, '')), ''), _device)
  ON CONFLICT (post_id, device_id) DO UPDATE
    SET body = excluded.body, source_url = excluded.source_url
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

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
  -- Nobody grades their own homework.
  IF EXISTS (SELECT 1 FROM public.community_notes WHERE id = _note AND device_id = _device) THEN
    RAISE EXCEPTION 'you wrote this note';
  END IF;
  INSERT INTO public.community_note_ratings (note_id, device_id, helpful)
  VALUES (_note, _device, _helpful)
  ON CONFLICT (note_id, device_id) DO UPDATE SET helpful = excluded.helpful;
END;
$$;

-- ---------------------------------------------------------------------------
-- A spot somebody photographed that we were not tracking
-- ---------------------------------------------------------------------------

-- Who photographed a spot into existence. Kept beside the projects table rather
-- than in it, because every column of `projects` is readable by anyone and a
-- device id is not for readers.
CREATE TABLE IF NOT EXISTS public.community_spot_authors (
  project_id uuid PRIMARY KEY REFERENCES public.projects ON DELETE CASCADE,
  device_id text NOT NULL CHECK (char_length(device_id) BETWEEN 16 AND 64),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_spot_authors_device_idx
  ON public.community_spot_authors (device_id, created_at DESC);

ALTER TABLE public.community_spot_authors ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.community_spot_authors TO service_role;
REVOKE ALL ON public.community_spot_authors FROM anon, authenticated;

-- This is the one place community content enters the projects table, and it
-- enters marked. No budget, no dates, no citation, and a status that says
-- outright that nobody has checked it — so it can never be mistaken for a row
-- that came out of a government document.
CREATE OR REPLACE FUNCTION public.create_community_spot(
  _device text,
  _name text,
  _summary text,
  _lat double precision,
  _lng double precision,
  _state text DEFAULT NULL,
  _district text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _recent integer;
BEGIN
  IF char_length(_device) NOT BETWEEN 16 AND 64 THEN
    RAISE EXCEPTION 'bad device id';
  END IF;
  IF char_length(btrim(coalesce(_name, ''))) < 4 THEN
    RAISE EXCEPTION 'a spot needs a name';
  END IF;
  IF _lat IS NULL OR _lng IS NULL OR abs(_lat) > 90 OR abs(_lng) > 180 THEN
    RAISE EXCEPTION 'a spot needs a location';
  END IF;

  SELECT count(*) INTO _recent
  FROM public.community_spot_authors
  WHERE device_id = _device AND created_at > now() - interval '1 day';
  IF _recent >= 10 THEN
    RAISE EXCEPTION 'slow down: too many new spots today';
  END IF;

  INSERT INTO public.projects (
    name, plain_summary, latitude, longitude, state, district,
    status, verification_status, confidence, published,
    source_origin, community_note
  )
  VALUES (
    btrim(_name),
    coalesce(nullif(btrim(coalesce(_summary, '')), ''), 'Photographed by a reader. Nothing about this has been checked against an official record yet.'),
    round(_lat::numeric, 3)::double precision,
    round(_lng::numeric, 3)::double precision,
    nullif(btrim(coalesce(_state, '')), ''),
    nullif(btrim(coalesce(_district, '')), ''),
    'unknown',
    'unverified',
    0,
    true,
    'community',
    'Added by a reader from a photograph. Not yet checked against any official record.'
  )
  RETURNING id INTO _id;

  INSERT INTO public.community_spot_authors (project_id, device_id) VALUES (_id, _device);
  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_post(uuid, text, text, text, text, double precision, double precision, timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_own_post(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flag_post(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_note(uuid, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_note(uuid, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_community_spot(text, text, text, double precision, double precision, text, text) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assert_within_rate(text) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Where the photographs live
-- ---------------------------------------------------------------------------

-- Public read, because a photograph nobody can see is not evidence. Insert but
-- never update or delete, so a file cannot be swapped out from under a post
-- that has already been discussed. The app re-encodes every photograph before
-- upload, which both strips the location metadata and keeps it under the cap.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('community-photos', 'community-photos', true, 3145728, ARRAY['image/jpeg','image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

DROP POLICY IF EXISTS "community photos are readable" ON storage.objects;
CREATE POLICY "community photos are readable" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'community-photos');

DROP POLICY IF EXISTS "anyone may add a community photo" ON storage.objects;
CREATE POLICY "anyone may add a community photo" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'community-photos');
