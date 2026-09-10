import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MapPin, X } from "lucide-react";

import { AppShell } from "@/components/wtf/app-shell";
import { Feed, type FeedItem } from "@/components/wtf/feed";
import { Oath } from "@/components/wtf/oath";
import { Radar } from "@/components/wtf/radar";
import { useLocation } from "@/hooks/use-location";
import { useOnboarding } from "@/hooks/use-onboarding";
import { rankByHeat } from "@/lib/hot";
import {
  postCountsQuery,
  projectsQuery,
  ratingsQuery,
  reactionsQuery,
  recentPostsQuery,
  type Post,
  type Project,
} from "@/lib/queries";
import { formatDistance, nearbyTo } from "@/lib/nearby";
import { distanceKm, randomMetro } from "@/lib/wtf";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "We the Future — where does the taxpayer's money actually go?" },
      {
        name: "description",
        content:
          "A feed of the government projects India is watching: how late each one is, how much public money is on it, and what people standing in front of it are saying.",
      },
      { property: "og:title", content: "We the Future — where does your money go?" },
      {
        property: "og:description",
        content: "Swipe through the projects your taxes paid for, and say what you see.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const projects = useQuery(projectsQuery());
  const ratings = useQuery(ratingsQuery());
  const reactions = useQuery(reactionsQuery());
  const counts = useQuery(postCountsQuery());
  const posts = useQuery(recentPostsQuery());
  const location = useLocation();
  const onboarding = useOnboarding();

  const [wideOpen, setWideOpen] = useState(false);
  const [sworn, setSworn] = useState(false);
  const [scanned, setScanned] = useState(false);
  // Where to start somebody who declines location. Fixed on mount so the answer
  // cannot change under them while the radar is running.
  const [fallbackCity] = useState(randomMetro);
  const askedRef = useRef(false);

  // The permission prompt goes up the moment a visitor arrives, with the radar
  // already turning behind it on a first run. Asking on arrival rather than
  // behind a button is the whole point: the app should know what is near you
  // before it asks you to do anything.
  //
  // This runs for returning visitors too, not only first ones. Somebody who
  // granted permission last month gets no prompt at all — the browser answers
  // straight away — and somebody who refused is refused again silently and
  // lands on the national feed. The alternative was a feed that claims to be
  // about where you are and opens in Kochi.
  useEffect(() => {
    if (onboarding.done === undefined || askedRef.current) return;
    // Not while the Preamble is still on screen. A permission prompt over the
    // oath would be the app asking where you live before it has said what it
    // is for, which is precisely how you get a refusal.
    if (onboarding.done === false && !sworn) return;
    askedRef.current = true;
    if (location.state.status === "idle") location.request();
    // location.request is stable; the two flags are the real trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboarding.done, sworn]);

  const published = useMemo(
    () => (projects.data ?? []).filter((project) => project.published),
    [projects.data],
  );

  const byId = useMemo(() => {
    const map = new Map<string, Project>();
    for (const project of published) map.set(project.id, project);
    return map;
  }, [published]);

  /** The newest photograph per project, so a project card can wear one. */
  const newestPhoto = useMemo(() => {
    const map: Record<string, Post> = {};
    for (const post of posts.data ?? []) {
      // Newest first out of the query, so the first one seen wins.
      if (post.kind === "photo" && !map[post.project_id]) map[post.project_id] = post;
    }
    return map;
  }, [posts.data]);

  const here =
    location.state.status === "granted"
      ? { lat: location.state.lat, lng: location.state.lng, precise: location.state.precise }
      : null;

  /**
   * A post is where its photograph says it was taken, and failing that where the
   * project it is about is. Neither means it cannot be placed near anybody, and
   * it stays out of a feed that is claiming to be about here.
   */
  const postCoords = (post: Post) => {
    if (post.latitude != null && post.longitude != null) {
      return { lat: post.latitude, lng: post.longitude };
    }
    const project = byId.get(post.project_id);
    if (project?.latitude != null && project?.longitude != null) {
      return { lat: project.latitude, lng: project.longitude };
    }
    return null;
  };

  const scope = useMemo(() => {
    if (!here || wideOpen) return null;
    const projectsNear = nearbyTo(published, here, (project) =>
      project.latitude != null && project.longitude != null
        ? { lat: project.latitude, lng: project.longitude }
        : null,
    );
    // Posts are held to the radius the projects settled on, so one photograph a
    // long way off cannot make the feed claim a reach it does not have.
    const postsNear = (posts.data ?? [])
      .map((post) => ({ post, coords: postCoords(post) }))
      .filter(
        (entry): entry is { post: Post; coords: { lat: number; lng: number } } =>
          entry.coords != null,
      )
      .map(({ post, coords }) => ({
        post,
        distance: distanceKm(here.lat, here.lng, coords.lat, coords.lng),
      }))
      .filter((entry) => entry.distance <= projectsNear.radiusKm);

    // What the chip says has to be the truth about what is on screen, so the
    // number quoted is how far the furthest card really is — across both kinds.
    const reachKm = Math.max(
      projectsNear.reachKm,
      postsNear.length > 0 ? Math.max(...postsNear.map((entry) => entry.distance)) : 0,
    );

    return { projectsNear, postsNear, reachKm };
    // postCoords closes over byId, which is derived from published.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [published, posts.data, byId, here?.lat, here?.lng, wideOpen]);

  /**
   * One list, two kinds of card.
   *
   * Projects carry the ranking; posts are spliced in newest first so that what
   * somebody photographed this morning is never more than a few swipes away. A
   * post is not allowed to open the feed — the first card should be the reason
   * anybody is here.
   */
  const items = useMemo(() => {
    const ranked = scope
      ? rankByHeat(
          scope.projectsNear.items.map((entry) => entry.item),
          ratings.data,
        )
      : rankByHeat(published, ratings.data);

    const distances = new Map<string, number>();
    for (const entry of scope?.projectsNear.items ?? []) {
      distances.set(entry.item.id, entry.distance);
    }

    const projectItems: FeedItem[] = ranked.map((card) => ({
      kind: "project",
      key: `project:${card.project.id}`,
      card,
      distanceKm: distances.get(card.project.id) ?? null,
    }));

    const nearbyPosts = (
      scope ? scope.postsNear : (posts.data ?? []).map((post) => ({ post, distance: Number.NaN }))
    ).slice(0, 40);

    const out: FeedItem[] = [];
    let postIndex = 0;
    for (let index = 0; index < projectItems.length; index += 1) {
      out.push(projectItems[index]!);
      // After the first card, then every third, hand the floor to a reader.
      if (index % 3 === 0 && postIndex < nearbyPosts.length) {
        const entry = nearbyPosts[postIndex]!;
        postIndex += 1;
        out.push({
          kind: "post",
          key: `post:${entry.post.id}`,
          post: entry.post,
          project: byId.get(entry.post.project_id),
          distanceKm: Number.isFinite(entry.distance) ? entry.distance : null,
        });
      }
    }
    return out;
  }, [scope, published, posts.data, ratings.data, byId]);

  const projectCount = items.filter((item) => item.kind === "project").length;
  const postCount = items.filter((item) => item.kind === "post").length;

  // First run: read the Preamble, then scan, then the feed.
  //
  // The oath comes before the radar rather than after it, because the radar is
  // already asking for your location — and being asked for that by an app whose
  // purpose you have not yet been told is exactly the thing that makes people
  // say no.
  if (onboarding.done === false && !sworn) {
    return <Oath onTake={() => setSworn(true)} />;
  }

  if (onboarding.done === false && !scanned) {
    const declined = location.state.status === "denied" || location.state.status === "unavailable";
    const origin =
      location.state.status === "granted"
        ? { lat: location.state.lat, lng: location.state.lng }
        : declined
          ? { lat: fallbackCity.lat, lng: fallbackCity.lng }
          : null;

    return (
      <Radar
        projects={published}
        origin={origin}
        placeLabel={declined ? fallbackCity.name : "you"}
        approximate={declined}
        onDone={() => {
          // Declining location is not a dead end: it just means we start you in
          // a large city instead, and the feed scopes itself around that.
          if (declined) location.setManual(fallbackCity.lat, fallbackCity.lng, fallbackCity.name);
          setScanned(true);
          onboarding.finish();
        }}
      />
    );
  }

  return (
    <AppShell immersive>
      <h1 className="sr-only">
        The government projects near you, and what readers are saying about them
      </h1>

      {projects.isLoading ? (
        <div className="grid h-[100dvh] place-items-center bg-ink text-ink-foreground">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="size-6 animate-spin" aria-hidden />
            <p className="text-sm text-ink-muted">Loading the ledger…</p>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="grid h-[100dvh] place-items-center bg-ink px-6 text-center text-ink-foreground">
          <div>
            <p className="display-sm">Nothing to show yet</p>
            <Link
              to="/discover"
              className="m3-state mt-6 inline-flex rounded-full bg-ink-foreground px-4 py-2 text-sm font-semibold text-ink"
            >
              Look at the map instead
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* One line of chrome over the feed: what this is about, and the way
              out of it. Anything more would be a masthead. */}
          <div className="pointer-events-none fixed inset-x-0 top-0 z-20 flex justify-center px-4 pt-[max(0.75rem,env(safe-area-inset-top))] md:top-16">
            {scope ? (
              <span className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-black/45 py-1.5 pl-3.5 pr-1.5 text-xs font-medium text-white backdrop-blur-sm">
                <MapPin className="size-3.5" aria-hidden />
                {projectCount} within {formatDistance(scope.reachKm)}
                {here?.precise
                  ? " of you"
                  : ` of ${location.state.status === "granted" ? location.state.label : "here"}`}
                {postCount > 0 ? ` · ${postCount} from readers` : ""}
                <button
                  type="button"
                  onClick={() => setWideOpen(true)}
                  aria-label="Show all of India instead"
                  className="grid size-6 place-items-center rounded-full bg-white/15 hover:bg-white/25"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            ) : (
              <span className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-black/45 px-3.5 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                {projectCount.toLocaleString("en-IN")} projects across India
                {here ? (
                  <button
                    type="button"
                    onClick={() => setWideOpen(false)}
                    className="font-semibold underline underline-offset-2"
                  >
                    near me
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => location.request()}
                    className="font-semibold underline underline-offset-2"
                  >
                    near me
                  </button>
                )}
              </span>
            )}
          </div>

          <Feed
            items={items}
            photos={newestPhoto}
            counts={counts.data ?? {}}
            reactions={reactions.data}
          />
        </>
      )}
    </AppShell>
  );
}
