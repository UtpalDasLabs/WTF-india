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
    // Matches --background in src/styles.css and wtfBackground in the Android
    // theme, so there is no white frame between the WebView and the window
    // behind it while a page is still painting.
    backgroundColor: "#101219",
  },
};

export default config;
