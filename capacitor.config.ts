import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "in.wethefuture.wtf",
  appName: "We the Future",
  // The Android build reuses the static SPA bundle, so build it with BASE_PATH=/
  // (see npm run build:android) — inside the WebView the app is served from the root.
  webDir: "dist/client",
  android: {
    // Supabase is HTTPS-only; refusing cleartext keeps an http:// endpoint from
    // being introduced by accident.
    allowMixedContent: false,
  },
};

export default config;
