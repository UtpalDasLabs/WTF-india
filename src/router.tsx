import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
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

  return router;
};
