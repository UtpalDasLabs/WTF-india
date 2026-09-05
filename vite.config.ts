import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

// GitHub Pages serves static files only, so that build swaps the nitro/SSR output for
// TanStack Start's SPA mode and roots every asset at the repository subpath
// (https://<user>.github.io/<repo>/). Both are opt-in via env, so the default
// server build is untouched.
const isGithubPages = process.env["GITHUB_PAGES"] === "true";
// Must keep the leading and trailing slash, e.g. "/WTF-india/".
const base = process.env["BASE_PATH"] || "/";

export default defineConfig({
  ...(isGithubPages
    ? {
        base,
        // Lets the app hide the features that need a server, since Pages has none.
        define: { "import.meta.env.VITE_STATIC_DEPLOY": JSON.stringify("true") },
      }
    : {}),
  resolve: {
    // Keep a single copy of these, or hooks and router context break across chunks.
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
      "@tanstack/react-router",
    ],
  },
  plugins: [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      // Redirect the bundled server entry to src/server.ts (our SSR error wrapper).
      server: { entry: "server" },
      ...(isGithubPages
        ? {
            // Emits a single prerendered shell that boots the client router for every
            // route. Writing it to "/index" gives Pages the index.html it serves.
            spa: { enabled: true, prerender: { outputPath: "/index" } },
          }
        : {}),
    }),
    // Skipping nitro leaves the plain vite client build, which is what Pages hosts.
    ...(isGithubPages ? [] : [nitro()]),
    viteReact(),
  ],
});
