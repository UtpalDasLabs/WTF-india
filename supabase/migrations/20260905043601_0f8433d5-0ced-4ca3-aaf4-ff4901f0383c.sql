alter table public.reviews add column if not exists is_anonymous boolean not null default false;

create unique index if not exists reviews_one_per_user_project
  on public.reviews (project_id, user_id) where user_id is not null;

drop policy if exists "visible reviews readable" on public.reviews;
create policy "own or reviewer reviews readable" on public.reviews
  for select to authenticated
  using (user_id = auth.uid() or public.is_reviewer(auth.uid()));

drop policy if exists "visible images readable" on public.review_images;
create policy "own or reviewer images readable" on public.review_images
  for select to authenticated
  using (user_id = auth.uid() or public.is_reviewer(auth.uid()));

revoke select on public.reviews from anon;
revoke select on public.review_images from anon;

create or replace view public.reviews_public
with (security_invoker = off) as
select r.id,
       r.project_id,
       r.rating,
       r.masked_body,
       r.moderation_label,
       r.moderation_state,
       r.created_at,
       r.is_anonymous,
       case when r.is_anonymous then null else r.author_name end as author_name
from public.reviews r
join public.projects p on p.id = r.project_id
where r.moderation_state = 'visible' and p.published;

create or replace view public.review_images_public
with (security_invoker = off) as
select i.id,
       i.review_id,
       i.image_url,
       i.caption,
       i.moderation_label,
       i.moderation_state
from public.review_images i
join public.reviews r on r.id = i.review_id
join public.projects p on p.id = r.project_id
where i.moderation_state in ('visible', 'blurred')
  and r.moderation_state = 'visible'
  and p.published;

grant select on public.reviews_public to anon, authenticated;
grant select on public.review_images_public to anon, authenticated;