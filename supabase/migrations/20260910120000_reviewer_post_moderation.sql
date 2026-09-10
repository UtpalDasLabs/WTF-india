-- A way for a reviewer to look at what has been flagged.
--
-- Four flags hides a post on its own, which handles the ugly cases quickly but
-- handles nothing else: a post flagged once by somebody it annoyed, or one
-- hidden by four friends acting together, both need a person to look. Readers
-- still have no table access at all — these policies are false for everybody who
-- is not a reviewer, so an ordinary signed-in account querying the table gets an
-- empty result rather than a device id.

GRANT SELECT, UPDATE, DELETE ON public.project_posts TO authenticated;
GRANT SELECT, DELETE ON public.post_flags TO authenticated;
GRANT SELECT, UPDATE, DELETE ON public.community_notes TO authenticated;

DROP POLICY IF EXISTS "reviewers read posts" ON public.project_posts;
CREATE POLICY "reviewers read posts" ON public.project_posts
  FOR SELECT TO authenticated USING (public.is_reviewer(auth.uid()));

DROP POLICY IF EXISTS "reviewers hide posts" ON public.project_posts;
CREATE POLICY "reviewers hide posts" ON public.project_posts
  FOR UPDATE TO authenticated
  USING (public.is_reviewer(auth.uid()))
  WITH CHECK (public.is_reviewer(auth.uid()));

DROP POLICY IF EXISTS "reviewers remove posts" ON public.project_posts;
CREATE POLICY "reviewers remove posts" ON public.project_posts
  FOR DELETE TO authenticated USING (public.is_reviewer(auth.uid()));

DROP POLICY IF EXISTS "reviewers read flags" ON public.post_flags;
CREATE POLICY "reviewers read flags" ON public.post_flags
  FOR SELECT TO authenticated USING (public.is_reviewer(auth.uid()));

-- Clearing the flags is how a reviewer says "this one is fine", so the count
-- does not immediately re-hide it.
DROP POLICY IF EXISTS "reviewers clear flags" ON public.post_flags;
CREATE POLICY "reviewers clear flags" ON public.post_flags
  FOR DELETE TO authenticated USING (public.is_reviewer(auth.uid()));

DROP POLICY IF EXISTS "reviewers read notes" ON public.community_notes;
CREATE POLICY "reviewers read notes" ON public.community_notes
  FOR SELECT TO authenticated USING (public.is_reviewer(auth.uid()));

DROP POLICY IF EXISTS "reviewers hide notes" ON public.community_notes;
CREATE POLICY "reviewers hide notes" ON public.community_notes
  FOR UPDATE TO authenticated
  USING (public.is_reviewer(auth.uid()))
  WITH CHECK (public.is_reviewer(auth.uid()));
