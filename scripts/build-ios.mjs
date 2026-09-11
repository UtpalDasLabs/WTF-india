// Builds the web bundle for the iOS WKWebView and syncs it into the native project.
//
// Identical in shape to build-android.mjs: Capacitor serves the bundle from the
// root of a local origin inside the web view, so unlike the Pages build this one
// must be rooted at "/". GITHUB_PAGES=true still selects the same static SPA
// output (no SSR, no server functions), which is what a web view can run.
//
// `cap sync ios` copies the bundle into ios/App/App/public — gitignored, so this
// is the step that actually puts the web app inside the .app — and rewrites
// Package.swift with the native side of whichever Capacitor plugins are
// installed. Capacitor 8 uses Swift Package Manager, so there is no CocoaPods
// step and nothing to install before Xcode can open the project.
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
run("cap", ["sync", "ios"]);
