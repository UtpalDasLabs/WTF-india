-- Reporting about where public money went.
--
-- The dataset in this app is a ledger: sanctioned cost, promised date, what
-- happened. It is accurate and it is slow. What it cannot tell you is that the
-- tender was cancelled on Tuesday, and that is often the thing somebody standing
-- in the street actually wants to know.
--
-- So this table holds headlines, and only headlines: a title, who published it,
-- when, and a link. No article text is stored or shown — the work is somebody
-- else's and the reader is sent to them to read it. It is an index, not a
-- reprint.
--
-- Rows are written by a scheduled job, never by a reader, so there is no
-- anonymous write path here at all.

CREATE TABLE IF NOT EXISTS public.news_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The link is the identity: the same story reached twice must not appear twice.
  url text NOT NULL UNIQUE CHECK (url ~* '^https?://'),
  title text NOT NULL CHECK (char_length(title) BETWEEN 8 AND 500),
  publisher text,
  published_at timestamptz NOT NULL,

  -- Where the story is about, taken from the search that found it rather than
  -- guessed from the text. Null means it is national rather than local.
  state text,
  district text,
  latitude double precision CHECK (latitude IS NULL OR abs(latitude) <= 90),
  longitude double precision CHECK (longitude IS NULL OR abs(longitude) <= 180),

  -- Which query produced it, so a bad run can be traced to the search that
  -- caused it rather than argued about.
  topic text,
  created_at timestamptz NOT NULL DEFAULT now(),
  hidden boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS news_items_published_idx
  ON public.news_items (published_at DESC);
CREATE INDEX IF NOT EXISTS news_items_place_idx
  ON public.news_items (state, district);

ALTER TABLE public.news_items ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.news_items TO service_role;
GRANT SELECT ON public.news_items TO anon, authenticated;

DROP POLICY IF EXISTS "news is readable" ON public.news_items;
CREATE POLICY "news is readable" ON public.news_items
  FOR SELECT USING (hidden = false OR public.is_reviewer(auth.uid()));

-- A reviewer can take down a headline that turned out to be junk without the
-- next scheduled run putting it straight back: `hidden` survives the upsert
-- because the loader only ever writes the columns it fetched.
GRANT UPDATE ON public.news_items TO authenticated;
DROP POLICY IF EXISTS "reviewers hide news" ON public.news_items;
CREATE POLICY "reviewers hide news" ON public.news_items
  FOR UPDATE TO authenticated
  USING (public.is_reviewer(auth.uid()))
  WITH CHECK (public.is_reviewer(auth.uid()));
