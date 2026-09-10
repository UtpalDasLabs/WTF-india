import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2, LocateFixed, Newspaper, ScrollText } from "lucide-react";

import { AppShell } from "@/components/wtf/app-shell";
import { useLocation } from "@/hooks/use-location";
import { formatDistance, nearbyTo } from "@/lib/nearby";
import { newsQuery, type NewsItem } from "@/lib/queries";
import { nearestCity } from "@/lib/wtf";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/news")({
  head: () => ({
    meta: [
      { title: "Money news near you — We the Future" },
      {
        name: "description",
        content:
          "Headlines about tenders, cost overruns, audits and civic budgets, for the part of India you are actually in.",
      },
      { property: "og:title", content: "Money news near you — We the Future" },
      {
        property: "og:description",
        content: "What is being reported about public spending where you are.",
      },
    ],
  }),
  component: News,
});

/** How long ago, said the way a newsroom would. */
function whenAgo(iso: string): string {
  const minutes = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  const days = hours / 24;
  if (days < 7) return `${Math.round(days)}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/**
 * One headline.
 *
 * The whole row is the publisher's link and it opens in their tab. Nothing is
 * excerpted and nothing is rewritten: this app did not do the reporting, and a
 * summary in our voice would quietly claim that it did.
 */
function Story({ item, distanceKm }: { item: NewsItem; distanceKm: number | null }) {
  return (
    <li className="border-b border-border last:border-b-0">
      <a
        href={item.url}
        target="_blank"
        rel="noreferrer noopener"
        className="m3-state group flex gap-3 py-4"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {item.publisher ? (
              <span className="font-semibold text-foreground">{item.publisher}</span>
            ) : null}
            <span aria-hidden>·</span>
            <span>{whenAgo(item.published_at)}</span>
            {/* As precise as the headline actually was: a city, a state, or
                nothing at all. Never more. */}
            <span aria-hidden>·</span>
            <span>{item.district ?? item.state ?? "India"}</span>
            {distanceKm != null ? (
              <>
                <span aria-hidden>·</span>
                <span data-numeric>{formatDistance(distanceKm)} away</span>
              </>
            ) : null}
          </span>
          <span className="mt-1.5 block text-balance font-medium leading-snug group-hover:underline">
            {item.title}
          </span>
        </span>
        <ExternalLink
          className="mt-1 size-4 shrink-0 text-muted-foreground group-hover:text-foreground"
          aria-hidden
        />
      </a>
    </li>
  );
}

function News() {
  const news = useQuery(newsQuery());
  const location = useLocation();
  const [everywhere, setEverywhere] = useState(false);

  const here =
    location.state.status === "granted"
      ? { lat: location.state.lat, lng: location.state.lng }
      : null;

  const placeLabel = here
    ? location.state.status === "granted" && location.state.precise
      ? (nearestCity(here.lat, here.lng)?.name ?? "you")
      : location.state.status === "granted"
        ? location.state.label
        : "you"
    : null;

  /**
   * National stories are kept whatever the radius, because a CAG report on
   * highways is about your road too. Only the local ones are measured.
   */
  const shown = useMemo(() => {
    const all = news.data ?? [];
    if (!here || everywhere) {
      return {
        items: all.map((item) => ({ item, distance: null })),
        radiusKm: null as number | null,
      };
    }

    const national = all.filter((item) => item.latitude == null || item.longitude == null);
    const local = all.filter((item) => item.latitude != null && item.longitude != null);
    const near = nearbyTo(
      local,
      here,
      (item) => ({ lat: item.latitude!, lng: item.longitude! }),
      6,
    );

    const merged = [
      ...near.items.map((entry) => ({
        item: entry.item,
        distance: entry.distance as number | null,
      })),
      ...national.map((item) => ({ item, distance: null as number | null })),
    ].sort(
      (a, b) => new Date(b.item.published_at).getTime() - new Date(a.item.published_at).getTime(),
    );

    return { items: merged, radiusKm: near.reachKm };
  }, [news.data, here, everywhere]);

  return (
    <AppShell>
      <h1 className="sr-only">Money news near you</h1>

      <section className="-mx-4 mb-6 bg-ink px-4 py-9 text-ink-foreground md:-mx-6 md:rounded-2xl md:px-10 md:py-11">
        <p className="eyebrow flex items-center gap-2 text-ink-muted">
          <Newspaper className="size-4" aria-hidden />
          Being reported now
        </p>
        <h2 className="display-hero mt-4 text-balance">What is being said about the money.</h2>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-muted">
          Tenders, cost overruns, audits and civic budgets — headlines from the press, for the part
          of India you are in. The ledger in this app is accurate and slow; this is the part that
          moves. We link out and never reprint: the reporting belongs to whoever did it.
        </p>
      </section>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {here ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface px-3.5 py-2">
              <LocateFixed className="size-4 text-primary" aria-hidden />
              {everywhere ? (
                "All of India"
              ) : (
                <>
                  Near <strong className="font-semibold">{placeLabel}</strong>
                  {shown.radiusKm != null ? (
                    <span className="text-muted-foreground">
                      · {formatDistance(shown.radiusKm)}
                    </span>
                  ) : null}
                </>
              )}
            </span>
            <button
              type="button"
              onClick={() => setEverywhere((current) => !current)}
              className="m3-state rounded-full px-3 py-1.5 text-xs font-semibold underline underline-offset-2 hover:bg-surface-container-high"
            >
              {everywhere ? "Show what is near me" : "Show all of India"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => location.request()}
            disabled={location.state.status === "locating"}
            className="m3-state inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface px-3.5 py-2 text-sm font-medium hover:bg-surface-container-high disabled:opacity-60"
          >
            <LocateFixed className="size-4" aria-hidden />
            {location.state.status === "locating" ? "Locating…" : "Use my location to filter this"}
          </button>
        )}
      </div>

      {news.isLoading ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
        </div>
      ) : news.isError ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive-container p-5 text-sm text-destructive-container-foreground">
          We could not load the headlines just now. Please try again in a moment.
        </p>
      ) : shown.items.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center">
          <Newspaper className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <p className="display-sm mt-4">Nothing has come in yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            Headlines are pulled in four times a day. If this stays empty, the pull is not running —
            it needs the Supabase credentials set as repository secrets.
          </p>
        </div>
      ) : (
        <ul>
          {shown.items.map(({ item, distance }) => (
            <Story key={item.id} item={item} distanceKm={distance} />
          ))}
        </ul>
      )}

      {/* The Constitution used to be a tab of its own and had no way in from a
          phone at all. It belongs next to the reporting: one is what is being
          done with the money, the other is the document that says on whose
          behalf. */}
      <Link
        to="/constitution"
        className={cn(
          "m3-state mt-8 flex items-center gap-4 rounded-2xl border border-border bg-surface p-5",
          "hover:bg-surface-container-high",
        )}
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-container-highest">
          <ScrollText className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">The Constitution of India</span>
          <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">
            The document all of this is supposed to answer to, in the languages an official text
            exists for.
          </span>
        </span>
      </Link>

      <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
        Headlines are gathered from public news feeds four times a day and shown with their
        publisher and date. Nothing is excerpted or rewritten, and a headline appearing here is not
        a claim by this app that it is accurate — it is a pointer to somebody else's reporting.
      </p>
    </AppShell>
  );
}
