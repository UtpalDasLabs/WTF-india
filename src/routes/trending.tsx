import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Trending used to be a page you navigated to. It is now the thing the app opens
 * on, so the old address forwards rather than breaking: these links have been
 * shared, and a shared link that 404s is a reader lost.
 */
export const Route = createFileRoute("/trending")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});
