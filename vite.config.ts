// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// GitHub Pages only serves static files, so that build swaps the nitro/SSR output for
// TanStack Start's SPA mode and roots every asset at the repository subpath
// (https://<user>.github.io/<repo>/). Both are opt-in via env, so the default
// Lovable/Cloudflare build is untouched.
const isGithubPages = process.env["GITHUB_PAGES"] === "true";
// Must keep the leading and trailing slash, e.g. "/WTF-india/".
const base = process.env["BASE_PATH"] || "/";

export default defineConfig({
  // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
  // nitro/vite builds from this
  tanstackStart: isGithubPages
    ? {
        server: { entry: "server" },
        // Emits a single prerendered shell that boots the client router for every route.
        // Writing it to "/" gives Pages the index.html it serves for the site root.
        spa: { enabled: true, prerender: { outputPath: "/index" } },
      }
    : { server: { entry: "server" } },
  // Skipping nitro leaves the plain vite client build, which is what Pages hosts.
  ...(isGithubPages
    ? {
        nitro: false as const,
        vite: {
          base,
          // Lets the app hide the features that need a server, since Pages has none.
          define: { "import.meta.env.VITE_STATIC_DEPLOY": JSON.stringify("true") },
        },
      }
    : {}),
});
