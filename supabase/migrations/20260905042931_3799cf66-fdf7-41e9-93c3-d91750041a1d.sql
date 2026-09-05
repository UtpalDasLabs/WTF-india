-- Anonymous visitors hit RLS policies that call these helpers, so they need
-- EXECUTE. Both are SECURITY DEFINER and only return a boolean.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_reviewer(uuid) TO anon, authenticated;