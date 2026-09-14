import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { pageView } from "./lib/analytics";
import { BASE_PATH } from "./lib/base-path";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // The ledger is built by scheduled jobs, not by the minute, so treating
        // every answer as stale the moment it arrives just buys the same rows
        // again: six tab switches cost eighteen Supabase round trips before
        // this, and one after. That is somebody's mobile data and battery, and
        // a re-render each time the identical answer lands. Five minutes is
        // well inside how often anything here changes.
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        // The default fires on every return to the app, which on a phone is
        // every time you glance at a message.
        refetchOnWindowFocus: false,
        // Three tries with backoff means a dead connection is spent waiting
        // rather than saying so. Once is enough to ride out a blip.
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    basepath: BASE_PATH,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  // Every screen after the first, which a single-page app would otherwise never
  // report: the document loads once and Google's own page_view fires with it.
  //
  // onRendered rather than onResolved, because the title is set by the route
  // that has just been rendered and reading it any earlier reports the previous
  // screen's. Nothing is subscribed during prerender, where there is no reader
  // and no window.
  if (typeof window !== "undefined") {
    router.subscribe("onRendered", ({ toLocation }) => {
      pageView(toLocation.pathname);
    });
  }

  return router;
};
