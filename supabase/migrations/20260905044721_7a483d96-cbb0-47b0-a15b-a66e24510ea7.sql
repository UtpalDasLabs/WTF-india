-- Public read access for published, visible community content, so the public
-- views can run with the querying user's own permissions (no SECURITY DEFINER views).
DROP POLICY IF EXISTS "Published visible reviews readable" ON public.reviews;
CREATE POLICY "Published visible reviews readable"
  ON public.reviews FOR SELECT TO anon, authenticated
  USING (
    moderation_state = 'visible'::public.moderation_state
    AND EXISTS (
      SELECT 1 FROM public.projects p WHERE p.id = reviews.project_id AND p.published
    )
  );

DROP POLICY IF EXISTS "Published checked review photos readable" ON public.review_images;
CREATE POLICY "Published checked review photos readable"
  ON public.review_images FOR SELECT TO anon, authenticated
  USING (
    moderation_state = ANY (ARRAY['visible'::public.moderation_state, 'blurred'::public.moderation_state])
    AND EXISTS (
      SELECT 1 FROM public.reviews r
      JOIN public.projects p ON p.id = r.project_id
      WHERE r.id = review_images.review_id
        AND r.moderation_state = 'visible'::public.moderation_state
        AND p.published
    )
  );

GRANT SELECT ON public.reviews TO anon;
GRANT SELECT ON public.review_images TO anon;

ALTER VIEW public.review_images_public SET (security_invoker = true);