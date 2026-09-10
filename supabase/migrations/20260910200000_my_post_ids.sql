-- Which posts are yours to delete.
--
-- The app was keeping its own list in localStorage, written when a post was
-- made. That was wrong twice over: photographs taken through the camera never
-- got added to it, so the delete button never appeared on them at all, and
-- clearing the browser meant losing the ability to take down your own posts
-- even though the server still knew perfectly well who wrote them.
--
-- The server is the record. It already stores the device id against every post;
-- this hands back the ids for one device so the button can appear wherever it
-- should. No ownership is leaked: you have to present your own device id to
-- learn anything, and a device id is a random UUID the server never gives out.
CREATE OR REPLACE FUNCTION public.my_post_ids(_device text)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.project_posts
  WHERE device_id = _device AND char_length(_device) BETWEEN 16 AND 64;
$$;

GRANT EXECUTE ON FUNCTION public.my_post_ids(text) TO anon, authenticated;
