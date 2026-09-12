import { Fragment, useRef, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Map as MapIcon, Newspaper, ShieldCheck, Flame, UserRound } from "lucide-react";

import { WtfLogo } from "@/components/wtf/logo";
import { CameraButton } from "@/components/wtf/camera-button";
import { Capture } from "@/components/wtf/capture-lazy";
import { InstallLink, InstallPrompt } from "@/components/wtf/install-app";
import { useSession } from "@/hooks/use-session";
import { BUILD_COMMIT, BUILD_TIME, REPO_COMMIT_URL } from "@/lib/build-info";
import { cn } from "@/lib/utils";

/**
 * Two navigations for one route set: a horizontal masthead from `md` up, and the
 * thumb-reachable tab bar below it. Previously the tab bar was the only nav, so on
 * a desktop it floated across the middle of the page.
 */
export function AppShell({
  children,
  width = "default",
  immersive = false,
}: {
  children: ReactNode;
  /** `wide` lets the discovery page run a map beside the list instead of a phone column. */
  width?: "default" | "wide";
  /**
   * Hands the whole viewport to the page and keeps only the tab bar, floating
   * over it. The feed is a stack of full-screen cards; a masthead and a footer
   * above and below it would turn a thing you fall into back into a document.
   */
  immersive?: boolean;
}) {
  const session = useSession();
  // One sheet for both cameras. Two would mean two hidden file inputs, and the
  // photograph landing in whichever one the browser happened to reach first.
  const [capturing, setCapturing] = useState(false);
  // Latches on the first open and never goes back, so dismissing the sheet does
  // not unmount the chunk it took a tap to fetch.
  const opened = useRef(false);
  if (capturing) opened.current = true;
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  // No "Suggest" tab. The camera is the way to report something, and a second
  // entry point for the same intention only made people choose between them.
  // The route still exists and is linked from the places where it is the right
  // answer — an empty search, a project we do not have.
  const items = [
    { to: "/", label: "Feed", icon: Flame },
    { to: "/discover", label: "Map", icon: MapIcon },
    { to: "/news", label: "News", icon: Newspaper },
    ...(session.isReviewer ? [{ to: "/admin", label: "Review", icon: ShieldCheck } as const] : []),
    { to: "/auth", label: session.userId ? "Account" : "Sign in", icon: UserRound },
  ];

  // The camera splits the tab bar down the middle, because taking a photograph
  // of something half-built is the one action the whole product is asking for.
  const tabs = items.filter((item) => item.to !== "/admin");
  const half = Math.ceil(tabs.length / 2);

  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));
  const chromeWidth = "max-w-[104rem]";
  const contentWidth = width === "wide" ? "max-w-[104rem]" : "max-w-3xl";

  return (
    <div
      className={cn(
        "relative flex flex-col bg-background",
        // dvh rather than vh: on iOS Safari, 100vh is the height with the URL
        // bar hidden, so a min-h-screen page is taller than the window on
        // arrival and the whole layout shifts the first time you scroll.
        immersive
          ? "h-[100dvh] overflow-hidden"
          : // The bottom nav is 5rem of chrome plus whatever the home indicator
            // needs, and it pads itself by that inset. This has to clear both or
            // the last line of every page is read through the nav bar — which is
            // exactly what happens on a notched iPhone, where the inset is 34px.
            "min-h-dvh pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0",
      )}
    >
      {/* The same wash the feed cards have, so a page and a card feel like the
          same room. Fixed rather than absolute: it stays put while the page
          scrolls, which is what makes it read as light in the room rather than
          as a band painted across the top of the document. */}
      {immersive ? null : (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-0"
          style={{
            background:
              "radial-gradient(120% 60% at 50% 0%, var(--status-delayed) 0%, transparent 62%)",
            opacity: 0.28,
          }}
        />
      )}
      <header
        className={cn(
          // Solid, not translucent-and-blurred. A backdrop filter on a bar that
          // stays on screen while the page scrolls re-reads everything moving
          // behind it on every frame, and on a phone that is the single most
          // expensive thing in the layout. Against this app's own dark ground
          // the difference is barely visible; md:supports-[backdrop-filter]
          // keeps it where there is a desktop GPU to pay for it.
          "sticky top-0 z-30 border-b border-border bg-background md:bg-background/70 md:backdrop-blur-xl",
          // The iOS app and an iPhone home-screen install both run full-bleed
          // under the status bar, so without this the logo row sits beneath the
          // clock. The blur extends up behind it rather than leaving a band.
          "pt-[env(safe-area-inset-top)]",
          immersive && "hidden md:block",
        )}
      >
        <div className={cn("mx-auto flex items-center gap-6 px-4 py-3 md:px-6", chromeWidth)}>
          <Link to="/" aria-label="We the Future home" className="shrink-0">
            <WtfLogo />
          </Link>

          <nav
            aria-label="Main"
            className="ml-auto hidden shrink-0 items-center gap-1 whitespace-nowrap md:flex"
          >
            {items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "m3-state relative rounded-full px-3.5 py-2 text-sm font-medium",
                  isActive(item.to)
                    ? "text-foreground"
                    : "text-muted-foreground hover:bg-surface-container-high hover:text-foreground",
                )}
              >
                {item.label}
                {isActive(item.to) ? (
                  <span
                    aria-hidden
                    className="absolute inset-x-3.5 -bottom-[13px] h-0.5 rounded-full bg-primary"
                  />
                ) : null}
              </Link>
            ))}
            <InstallLink className="ml-2" />
            <CameraButton onClick={() => setCapturing(true)} className="ml-2 size-10" />
          </nav>
        </div>
      </header>

      <main
        className={cn(
          "relative z-10 w-full flex-1",
          immersive ? "min-h-0" : cn("mx-auto px-4 py-6 md:px-6 md:py-10", contentWidth),
        )}
      >
        {children}
      </main>

      <footer
        className={cn(
          "relative z-10 mt-auto hidden border-t border-border",
          !immersive && "md:block",
        )}
      >
        <div
          className={cn(
            "mx-auto flex flex-wrap items-center justify-between gap-4 px-4 py-6 md:px-6",
            chromeWidth,
          )}
        >
          <div className="max-w-xl">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Facts and timelines come from official sources and are checked by a reviewer. Ratings,
              reviews and photos come from the public and are kept separate.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Build{" "}
              <a
                href={REPO_COMMIT_URL}
                className="font-mono underline underline-offset-2 hover:text-foreground"
              >
                {BUILD_COMMIT}
              </a>{" "}
              · {BUILD_TIME}
            </p>
          </div>
          <InstallLink variant="quiet" />
        </div>
      </footer>

      <nav
        aria-label="Main"
        // Same again, and this one matters more: the bottom bar is on screen
        // for every frame of every feed swipe.
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background md:hidden"
      >
        <ul className="flex items-stretch pb-[env(safe-area-inset-bottom)]">
          {tabs.map((item, index) => {
            const active = isActive(item.to);
            const Icon = item.icon;
            return (
              <Fragment key={item.to}>
                {index === half ? (
                  <li className="flex shrink-0 items-center px-2">
                    <CameraButton onClick={() => setCapturing(true)} />
                  </li>
                ) : null}
                <li className="flex-1">
                  <Link
                    to={item.to}
                    className="m3-state flex flex-col items-center gap-1 px-1 py-2 text-center text-[11px] font-medium leading-tight"
                  >
                    <span
                      className={cn(
                        "grid h-7 w-full max-w-14 place-items-center rounded-full transition-colors",
                        active ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                      )}
                    >
                      <Icon className="size-[18px]" aria-hidden />
                    </span>
                    <span className={active ? "text-foreground" : "text-muted-foreground"}>
                      {item.label}
                    </span>
                  </Link>
                </li>
              </Fragment>
            );
          })}
        </ul>
      </nav>

      {/* Mounted on the first tap, not at startup, so its chunk is fetched then
          too. It stays mounted afterwards: a sheet that re-fetches every time
          you dismiss it would be worse than one moment's wait, once. */}
      {opened.current ? <Capture open={capturing} onOpenChange={setCapturing} /> : null}

      {/* Asks once, late, and takes no for an answer. Mounted in the shell so it
          reaches every page rather than only the one that used to carry a card. */}
      <InstallPrompt />

      {immersive ? null : (
        <p className="px-4 pb-2 text-center text-[10px] text-muted-foreground md:hidden">
          Build <span className="font-mono">{BUILD_COMMIT}</span> · {BUILD_TIME}
        </p>
      )}
    </div>
  );
}
