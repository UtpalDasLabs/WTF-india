// Builds the web bundle for the Android WebView and syncs it into the native project.
//
// Capacitor serves the bundle from the root of a local origin inside the WebView, so
// unlike the Pages build this one must be rooted at "/". GITHUB_PAGES=true is still
// set: it selects the same static SPA output (no SSR, no server functions), which is
// exactly what a WebView can run.
import { spawnSync } from "node:child_process";

function run(command, args, env) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("vite", ["build"], { GITHUB_PAGES: "true", BASE_PATH: "/" });
run("cap", ["sync", "android"]);
