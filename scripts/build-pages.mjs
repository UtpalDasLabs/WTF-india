// Builds the static GitHub Pages bundle into dist/client.
//
// Wraps `vite build` so the Pages-only settings live in one place:
//   - GITHUB_PAGES=true switches vite.config.ts to TanStack Start's SPA mode
//     with nitro/SSR off, because Pages serves static files and nothing else.
//   - BASE_PATH roots every asset at the URL the site is published under. A
//     project site lives at https://<owner>.github.io/<repo>/, a user/org site
//     (<owner>.github.io) and any custom domain live at "/". Override it
//     explicitly when neither default applies.
//
// Afterwards it adds the two files Pages needs that vite does not emit:
//   - 404.html: a deep link like /projects/<id> is a request for a file that
//     does not exist, and Pages answers those with 404.html. Serving the SPA
//     shell there lets the client router pick the route up from the URL.
//   - .nojekyll: without it Pages runs the output through Jekyll, which drops
//     files whose names start with an underscore.
import { spawnSync } from "node:child_process";
import { copyFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const OUT_DIR = "dist/client";

function resolveBasePath() {
  if (process.env["BASE_PATH"]) return process.env["BASE_PATH"];

  const [owner, repo] = (process.env["GITHUB_REPOSITORY"] ?? "").split("/");
  if (!owner || !repo) return "/";
  // <owner>.github.io is served from the domain root, not from a subpath.
  if (repo.toLowerCase() === `${owner.toLowerCase()}.github.io`) return "/";
  return `/${repo}/`;
}

const basePath = resolveBasePath();
console.log(`[pages] building with base path ${basePath}`);

const build = spawnSync("vite", ["build"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, GITHUB_PAGES: "true", BASE_PATH: basePath },
});
if (build.status !== 0) process.exit(build.status ?? 1);

await copyFile(join(OUT_DIR, "index.html"), join(OUT_DIR, "404.html"));
await writeFile(join(OUT_DIR, ".nojekyll"), "");
console.log(`[pages] wrote 404.html and .nojekyll into ${OUT_DIR}`);
