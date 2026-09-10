import { Fragment, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Map as MapIcon,
  PlusCircle,
  ScrollText,
  ShieldCheck,
  Flame,
  UserRound,
} from "lucide-react";

import { WtfLogo } from "@/components/wtf/logo";
import { CaptureButton } from "@/components/wtf/capture";
import { ApkDownloadLink } from "@/components/wtf/apk-download";
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
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  const items = [
    { to: "/", label: "Feed", icon: Flame },
    { to: "/discover", label: "Map", icon: MapIcon },
    { to: "/constitution", label: "Constitution", icon: ScrollText },
    { to: "/suggest", label: "Suggest", icon: PlusCircle },
    ...(session.isReviewer ? [{ to: "/admin", label: "Review", icon: ShieldCheck } as const] : []),
    { to: "/auth", label: session.userId ? "Account" : "Sign in", icon: UserRound },
  ];

  // The camera splits the tab bar down the middle, because taking a photograph
  // of something half-built is the one action the whole product is asking for.
  const tabs = items.filter((item) => item.to !== "/constitution" && item.to !== "/admin");
  const half = Math.ceil(tabs.length / 2);

  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));
  const chromeWidth = "max-w-[104rem]";
  const contentWidth = width === "wide" ? "max-w-[104rem]" : "max-w-3xl";

  return (
    <div
      className={cn(
        "flex flex-col bg-background",
        immersive ? "h-[100dvh] overflow-hidden" : "min-h-screen pb-20 md:pb-0",
      )}
    >
      <header
        className={cn(
          "sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl",
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
            <ApkDownloadLink className="ml-2" />
            <CaptureButton className="ml-2 size-10" />
          </nav>
        </div>
      </header>

      <main
        className={cn(
          "w-full flex-1",
          immersive ? "min-h-0" : cn("mx-auto px-4 py-6 md:px-6 md:py-10", contentWidth),
        )}
      >
        {children}
      </main>

      <footer className={cn("mt-auto hidden border-t border-border", !immersive && "md:block")}>
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
          <ApkDownloadLink variant="quiet" />
        </div>
      </footer>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur-xl md:hidden"
      >
        <ul className="flex items-stretch pb-[env(safe-area-inset-bottom)]">
          {tabs.map((item, index) => {
            const active = isActive(item.to);
            const Icon = item.icon;
            return (
              <Fragment key={item.to}>
                {index === half ? (
                  <li className="flex shrink-0 items-center px-2">
                    <CaptureButton />
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

      {immersive ? null : (
        <p className="px-4 pb-2 text-center text-[10px] text-muted-foreground md:hidden">
          Build <span className="font-mono">{BUILD_COMMIT}</span> · {BUILD_TIME}
        </p>
      )}
    </div>
  );
}
