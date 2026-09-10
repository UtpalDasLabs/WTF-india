-- What you have done here.
--
-- All of it is keyed to the device rather than to an account, because that is
-- how the community layer works: you can react, post, photograph and write notes
-- without ever signing in. So the timeline has to be readable the same way —
-- hand the function your own device id and it hands back your own history.
--
-- That is safe for the same reason the rest of it is: a device id is a random
-- UUID this server generates once, keeps in the browser, and never hands back
-- out. Knowing one means it is yours. No row is exposed that its owner could
-- not already see.

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
  WITH mine AS (
    -- Something you wrote or photographed.
    SELECT
      p.kind AS kind,
      p.created_at AS happened_at,
      p.project_id,
      pr.name AS project_name,
      coalesce(p.body, '') AS detail,
      p.id AS post_id
    FROM public.project_posts p
    JOIN public.projects pr ON pr.id = p.project_id
    WHERE p.device_id = _device

    UNION ALL

    -- A note you added to somebody else's post.
    SELECT
      'note',
      n.created_at,
      p.project_id,
      pr.name,
      n.body,
      n.post_id
    FROM public.community_notes n
    JOIN public.project_posts p ON p.id = n.post_id
    JOIN public.projects pr ON pr.id = p.project_id
    WHERE n.device_id = _device

    UNION ALL

    -- A face you tapped.
    SELECT
      'reaction',
      r.created_at,
      r.project_id,
      pr.name,
      r.reaction,
      NULL::uuid
    FROM public.project_reactions r
    JOIN public.projects pr ON pr.id = r.project_id
    WHERE r.voter_id = _device

    UNION ALL

    -- A place you put on the map that was not there before.
    SELECT
      'spot',
      a.created_at,
      a.project_id,
      pr.name,
      '',
      NULL::uuid
    FROM public.community_spot_authors a
    JOIN public.projects pr ON pr.id = a.project_id
    WHERE a.device_id = _device
  )
  SELECT kind, happened_at, project_id, project_name, detail, post_id
  FROM mine
  WHERE char_length(_device) BETWEEN 16 AND 64
  ORDER BY happened_at DESC
  LIMIT 200;
$$;

GRANT EXECUTE ON FUNCTION public.my_activity(text) TO anon, authenticated;
